// Server functions - instrumentos e avaliações.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assessmentIdSchema, createAssessmentSchema, patientIdSchema } from "@/lib/schemas";
import { computeScore, type EngineInstrument } from "@/lib/scoring/engine";
import { writeAudit } from "@/lib/audit";
import { enforceRateLimit, safeRequestIP } from "@/lib/rate-limit";
import { z } from "zod";

async function loadCrypto() { return await import("@/lib/crypto.server"); }

// Aplica rate limit por token+ip nos endpoints públicos e loga excessos.
async function guardPublic(bucket: string, token: string, limit: number, windowMs: number) {
  const ip = await safeRequestIP();
  const res = await enforceRateLimit({ bucket, key: `${token}|${ip}`, limit, windowMs });
  if (!res.ok) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await writeAudit(supabaseAdmin, null, "public.rate_limit_exceeded", "assessment", "-", {
        bucket, retry_after_ms: res.retryAfterMs,
      });
    } catch { /* ignore */ }
    throw new Error("Muitas requisições. Aguarde alguns instantes e tente novamente.");
  }
}

// Lista instrumentos ATIVOS para o aluno. Uso acadêmico restrito aos três
// questionários aprovados no trabalho: GAD-7, PHQ-9 e WHOQOL-BREF.
// Registros extras eventualmente existentes no banco não são expostos aqui.
const ALLOWED_INSTRUMENT_CODES = new Set(["GAD-7", "PHQ-9", "WHOQOL-BREF"]);

export const listInstruments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: instruments, error: iErr }, { data: prefs }] = await Promise.all([
      supabase.from("instruments").select("id, code, name, description").order("code", { ascending: true }),
      supabase.from("professional_instruments").select("instrument_id, is_active").eq("professional_id", userId),
    ]);
    if (iErr) throw new Error(iErr.message);
    const prefMap = new Map<string, boolean>();
    for (const p of prefs ?? []) prefMap.set(p.instrument_id, p.is_active);
    return (instruments ?? [])
      .filter((i) => ALLOWED_INSTRUMENT_CODES.has(i.code))
      .filter((i) => prefMap.get(i.id) ?? true);
  });


// Profissional cria uma nova avaliação para um paciente.
export const createAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createAssessmentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: patient, error: pErr } = await supabase
      .from("patients").select("id").eq("id", data.patient_id).is("deleted_at", null).single();
    if (pErr || !patient) throw new Error("Paciente não encontrado");
    const { data: inst, error: iErr } = await supabase
      .from("instruments").select("id").eq("code", data.instrument_code).single();
    if (iErr || !inst) throw new Error("Instrumento não encontrado");

    // Gera token cru + guarda hash
    const { randomBytes } = await import("node:crypto");
    const { hashToken } = await loadCrypto();
    const token = randomBytes(24).toString("base64url"); // 32 chars
    const expires_at = new Date(Date.now() + data.ttl_hours * 3600 * 1000).toISOString();

    const { data: row, error } = await supabase.from("assessments").insert({
      patient_id: patient.id,
      professional_id: userId,
      instrument_id: inst.id,
      access_token_hash: hashToken(token),
      expires_at,
      status: "pending",
    }).select("id").single();
    if (error) throw new Error(error.message);

    await writeAudit(supabase, userId, "assessment.create", "assessment", row.id, {
      patient_id: patient.id,
      instrument: data.instrument_code,
    });

    return { id: row.id, token, expires_at };
  });

// Lista avaliações de um paciente (para timeline).
export const listAssessmentsByPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patient_id: string }) => patientIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("assessments")
      .select("id, status, created_at, expires_at, consumed_at, instrument:instruments(code, name), result:assessment_results(computed, cutoff_hits, flags)")
      .eq("patient_id", data.patient_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Detalhe completo (usado na página do resultado). Traz também paciente (nome decifrado),
// cutoffs, domínios e escala do instrumento para permitir visualização rica.
export const getAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assessment_id: string }) => assessmentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: a, error } = await supabase
      .from("assessments")
      .select("id, status, created_at, expires_at, consumed_at, patient_id, instrument:instruments(id, code, name, description), result:assessment_results(raw_scores, computed, cutoff_hits, flags, reviewed_at, reviewed_by)")
      .eq("id", data.assessment_id).single();
    if (error) throw new Error(error.message);

    const instrumentId = a.instrument?.id;
    const [{ data: patientRow }, { data: cutoffs }, { data: domains }, { data: rule }, { data: questions }, { data: answers }, { data: options }] = await Promise.all([
      supabase.from("patients").select("id, pii_encrypted").eq("id", a.patient_id).single(),
      instrumentId
        ? supabase.from("cutoffs").select("min_score, max_score, classification, message, domain_id").eq("instrument_id", instrumentId)
        : Promise.resolve({ data: [] as never[] }),
      instrumentId
        ? supabase.from("domains").select("id, code, name").eq("instrument_id", instrumentId)
        : Promise.resolve({ data: [] as never[] }),
      instrumentId
        ? supabase.from("scoring_rules").select("aggregation, min_value, max_value, transform").eq("instrument_id", instrumentId).single()
        : Promise.resolve({ data: null }),
      instrumentId
        ? supabase.from("questions").select("id, ordinal, text, domain_id").eq("instrument_id", instrumentId).order("ordinal")
        : Promise.resolve({ data: [] as never[] }),
      supabase.from("answers").select("question_id, option_id").eq("assessment_id", data.assessment_id),
      instrumentId
        ? supabase.from("options").select("id, label").eq("instrument_id", instrumentId)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const { decryptPII } = await loadCrypto();
    const pii = patientRow ? decryptPII(patientRow.pii_encrypted) : null;

    const action = a?.result ? "assessment.result_view" : "assessment.read";
    await writeAudit(supabase, userId, action, "assessment", a.id, { has_result: !!a.result });

    return {
      ...a,
      patient_name: pii?.full_name ?? "Paciente",
      cutoffs: (cutoffs ?? []) as Array<{ min_score: number; max_score: number; classification: string; message: string; domain_id: string | null }>,
      domains: (domains ?? []) as Array<{ id: string; code: string; name: string }>,
      rule: rule ?? null,
      response_details: (questions ?? []).map((question) => {
        const answer = (answers ?? []).find((item) => item.question_id === question.id);
        const option = (options ?? []).find((item) => item.id === answer?.option_id);
        const domain = (domains ?? []).find((item) => item.id === question.domain_id);
        return {
          ordinal: question.ordinal,
          question: question.text,
          answer: option?.label ?? "Não respondida",
          domain_id: question.domain_id,
          domain_name: domain?.name ?? null,
        };
      }),
    };
  });

// Marca alertas clínicos de um resultado como revisados.
export const markAlertReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assessment_id: string }) => assessmentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("assessment_results")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: userId })
      .eq("assessment_id", data.assessment_id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "assessment.result_view", "assessment", data.assessment_id, { reviewed: true });
    return { ok: true };
  });

// Cancela uma avaliação pendente/em-progresso (invalida o link do paciente).
// Marca status='cancelled' e consumed_at=now(); o token some do acesso público
// porque getAssessmentByToken bloqueia consumed_at != null.
export const cancelAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assessment_id: string }) => assessmentIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: readErr } = await supabase
      .from("assessments").select("id, status, patient_id").eq("id", data.assessment_id).single();
    if (readErr || !row) throw new Error("Avaliação não encontrada.");
    if (row.status === "completed") throw new Error("Avaliação já concluída não pode ser cancelada.");
    if (row.status === "cancelled") return { ok: true };
    const { error } = await supabase
      .from("assessments")
      .update({ status: "cancelled", consumed_at: new Date().toISOString() })
      .eq("id", data.assessment_id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "assessment.cancel", "assessment", data.assessment_id, {
      patient_id: row.patient_id,
      previous_status: row.status,
    });
    return { ok: true };
  });

// KPIs do dashboard. Alertas contam apenas os NÃO revisados.
export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ count: patients }, { count: pending }, { count: completed }, { data: flagged }] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("assessments").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"]),
      supabase.from("assessments").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("assessment_results")
        .select("assessment_id, flags")
        .not("flags", "eq", "[]")
        .is("reviewed_at", null)
        .limit(100),
    ]);
    return {
      patients: patients ?? 0,
      pending: pending ?? 0,
      completed: completed ?? 0,
      alerts: (flagged ?? []).length,
    };
  });



// -------------- FLUXO DO PACIENTE (público, via token) --------------
// Estas funções NÃO usam requireSupabaseAuth; usam supabaseAdmin com validação de token.

const publicByToken = z.object({ token: z.string().min(20).max(80) });

export const getAssessmentByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => publicByToken.parse(d))
  .handler(async ({ data }) => {
    await guardPublic("public:get-token", data.token, 120, 60_000);
    const { hashToken } = await loadCrypto();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a, error } = await supabaseAdmin
      .from("assessments")
      .select("id, status, expires_at, consumed_at, instrument_id")
      .eq("access_token_hash", hashToken(data.token))
      .single();
    if (error || !a) throw new Error("Link inválido");
    if (a.consumed_at) throw new Error("Este link já foi utilizado.");
    if (new Date(a.expires_at) < new Date()) throw new Error("Este link expirou.");
    const [{ data: inst }, { data: questions }, { data: options }] = await Promise.all([
      supabaseAdmin.from("instruments").select("id, code, name, description, instructions").eq("id", a.instrument_id).single(),
      supabaseAdmin.from("questions").select("id, ordinal, text, is_inverted").eq("instrument_id", a.instrument_id).order("ordinal"),
      supabaseAdmin.from("options").select("id, ordinal, label, weight, question_id").eq("instrument_id", a.instrument_id).order("ordinal"),
    ]);
    const { data: existing } = await supabaseAdmin.from("answers").select("question_id, option_id").eq("assessment_id", a.id);
    return {
      assessment_id: a.id,
      status: a.status,
      instrument: inst!,
      questions: questions ?? [],
      options: options ?? [],
      existing_answers: existing ?? [],
    };
  });

export const savePatientAnswer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(20).max(80),
    question_id: z.string().uuid(),
    option_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }) => {
    await guardPublic("public:save-answer", data.token, 300, 60_000);
    const { hashToken } = await loadCrypto();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: a } = await supabaseAdmin
      .from("assessments").select("id, expires_at, consumed_at")
      .eq("access_token_hash", hashToken(data.token)).single();
    if (!a || a.consumed_at || new Date(a.expires_at) < new Date()) throw new Error("Link inválido ou expirado.");
    const { data: opt } = await supabaseAdmin.from("options").select("weight").eq("id", data.option_id).single();
    if (!opt) throw new Error("Alternativa inválida.");
    const { error } = await supabaseAdmin.from("answers").upsert({
      assessment_id: a.id,
      question_id: data.question_id,
      option_id: data.option_id,
      weight_snapshot: opt.weight,
    }, { onConflict: "assessment_id,question_id" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("assessments").update({ status: "in_progress" }).eq("id", a.id).eq("status", "pending");
    return { ok: true };
  });

export const submitAssessment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    token: z.string().min(20).max(80),
    consent: z.object({ accepted: z.literal(true), terms_version: z.string().default("v1") }),
    user_agent: z.string().max(500).default(""),
  }).parse(d))
  .handler(async ({ data }) => {
    await guardPublic("public:submit", data.token, 10, 60_000);
    const { hashToken, anonymizeIP } = await loadCrypto();
    const { getRequest, getRequestIP } = await import("@tanstack/react-start/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");


    const { data: a } = await supabaseAdmin
      .from("assessments").select("id, instrument_id, expires_at, consumed_at")
      .eq("access_token_hash", hashToken(data.token)).single();
    if (!a) throw new Error("Link inválido.");
    if (a.consumed_at) throw new Error("Já enviado.");
    if (new Date(a.expires_at) < new Date()) throw new Error("Link expirado.");

    // Carrega instrumento
    const [{ data: instRow }, { data: qs }, { data: opts }, { data: rule }, { data: cutoffs }] = await Promise.all([
      supabaseAdmin.from("instruments").select("id, code").eq("id", a.instrument_id).single(),
      supabaseAdmin.from("questions").select("id, ordinal, is_inverted, domain_id").eq("instrument_id", a.instrument_id).order("ordinal"),
      supabaseAdmin.from("options").select("id, ordinal, weight, question_id").eq("instrument_id", a.instrument_id),
      supabaseAdmin.from("scoring_rules").select("aggregation, min_value, max_value, transform").eq("instrument_id", a.instrument_id).single(),
      supabaseAdmin.from("cutoffs").select("min_score, max_score, classification, message, domain_id").eq("instrument_id", a.instrument_id),
    ]);
    if (!instRow || !rule) throw new Error("Instrumento incompleto.");

    const { data: answers } = await supabaseAdmin.from("answers").select("question_id, option_id").eq("assessment_id", a.id);
    if (!answers || answers.length < (qs?.length ?? 0)) throw new Error("Responda todas as questões antes de enviar.");

    const result = computeScore({
      id: instRow.id, code: instRow.code,
      questions: (qs ?? []).map((q) => ({ id: q.id, ordinal: q.ordinal, is_inverted: q.is_inverted, domain_id: q.domain_id })),
      options: (opts ?? []).map((o) => ({ id: o.id, ordinal: o.ordinal, weight: Number(o.weight) })),
      rule: { aggregation: rule.aggregation, min_value: Number(rule.min_value), max_value: Number(rule.max_value), transform: rule.transform as EngineInstrument["rule"]["transform"] },
      cutoffs: (cutoffs ?? []).map((c) => ({ min_score: Number(c.min_score), max_score: Number(c.max_score), classification: c.classification, message: c.message, domain_id: c.domain_id })),
    }, answers);

    // Persiste resultado + marca consumido
    await supabaseAdmin.from("assessment_results").upsert({
      assessment_id: a.id,
      raw_scores: result.raw_scores,
      computed: result.computed,
      cutoff_hits: result.cutoff_hits,
      flags: result.flags,
    }, { onConflict: "assessment_id" });

    await supabaseAdmin.from("assessments").update({
      status: "completed",
      consumed_at: new Date().toISOString(),
    }).eq("id", a.id);

    // Registra consentimento LGPD
    let ip = "unknown";
    try { ip = getRequestIP({ xForwardedFor: true }) ?? "unknown"; } catch { /* ignore */ }
    let ua = data.user_agent;
    try {
      const req = getRequest();
      ua = ua || req.headers.get("user-agent") || "";
    } catch { /* ignore */ }
    await supabaseAdmin.from("lgpd_consents").insert({
      assessment_id: a.id,
      ip_hash: anonymizeIP(ip),
      user_agent: ua.slice(0, 500),
      terms_version: data.consent.terms_version,
    });

    await writeAudit(supabaseAdmin, null, "assessment.submit", "assessment", a.id, {
      instrument: instRow.code,
      flags: result.flags,
      answered: result.answered,
    });

    return { ok: true, assessment_id: a.id };
  });
