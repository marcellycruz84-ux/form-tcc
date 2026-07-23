// Server functions - ativação de instrumentos por profissional e tickets de solicitação.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

async function requireAdmin(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito a administradores.");
}

// ============================================================
// Profissional - biblioteca (catálogo completo com is_active)
// ============================================================
export const listLibraryInstruments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [instrumentResult, prefResult, domainResult] =
      await Promise.all([
        supabase
          .from("instruments")
          .select("id, code, name, description, estimated_minutes")
          .order("name", { ascending: true }),
        supabase
          .from("professional_instruments")
          .select("instrument_id, is_active")
          .eq("professional_id", userId),
        supabase.from("domains").select("id, name, instrument_id"),
      ]);
    const { data: instruments, error: iErr } = instrumentResult;
    const { data: prefs, error: pErr } = prefResult;
    const { data: domains } = domainResult;
    if (iErr) throw new Error(iErr.message);
    if (pErr) throw new Error(pErr.message);
    const prefMap = new Map<string, boolean>();
    for (const p of prefs ?? []) prefMap.set(p.instrument_id, p.is_active);

    const missingPrefs = (instruments ?? [])
      .filter((i) => !prefMap.has(i.id))
      .map((i) => ({ professional_id: userId, instrument_id: i.id, is_active: true }));
    if (missingPrefs.length > 0) {
      const { error: seedErr } = await supabase
        .from("professional_instruments")
        .upsert(missingPrefs, {
          onConflict: "professional_id,instrument_id",
          ignoreDuplicates: true,
        });
      if (!seedErr) {
        for (const p of missingPrefs) prefMap.set(p.instrument_id, true);
      }
    }

    const domainsByInstrument = new Map<string, Array<{ id: string; name: string }>>();
    for (const d of domains ?? []) {
      const arr = domainsByInstrument.get(d.instrument_id) ?? [];
      arr.push({ id: d.id, name: d.name });
      domainsByInstrument.set(d.instrument_id, arr);
    }
    return (instruments ?? []).map((i) => ({
      ...i,
      is_active: prefMap.get(i.id) ?? true, // default ativo para instrumentos sem pref
      domains: domainsByInstrument.get(i.id) ?? [],
    }));
  });

export const toggleInstrument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ instrument_id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("professional_instruments")
      .upsert(
        { professional_id: userId, instrument_id: data.instrument_id, is_active: data.is_active },
        { onConflict: "professional_id,instrument_id" },
      );
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "patient.update", "professional_instruments", data.instrument_id, {
      is_active: data.is_active,
    });
    return { ok: true };
  });

// ============================================================
// Tickets (solicitações de novos instrumentos)
// ============================================================
const requestSchema = z.object({
  instrument_name: z.string().trim().min(2).max(120),
  reference: z.string().trim().max(200).default(""),
  purpose: z.string().trim().min(10).max(2000),
});

export const createInstrumentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("instrument_requests")
      .insert({
        professional_id: userId,
        instrument_name: data.instrument_name,
        reference: data.reference,
        purpose: data.purpose,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "patient.create", "instrument_request", row.id, {
      instrument_name: data.instrument_name,
    });
    return { id: row.id };
  });

export const listMyInstrumentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("instrument_requests")
      .select("id, instrument_name, reference, purpose, status, admin_notes, created_at, updated_at")
      .eq("professional_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============================================================
// Admin - tickets
// ============================================================
export const adminListRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("instrument_requests")
      .select("id, professional_id, instrument_name, reference, purpose, status, admin_notes, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Enriquecer com profile
    const ids = Array.from(new Set((data ?? []).map((r) => r.professional_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name").in("id", ids)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const));
    return (data ?? []).map((r) => ({ ...r, professional_name: profMap.get(r.professional_id) ?? "-" }));
  });

export const adminUpdateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "in_review", "delivered", "rejected"]),
        admin_notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const patch: { status: typeof data.status; admin_notes?: string } = { status: data.status };
    if (typeof data.admin_notes === "string") patch.admin_notes = data.admin_notes;
    const { error } = await supabase.from("instrument_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "admin.audit_view", "instrument_request", data.id, {
      new_status: data.status,
    });
    return { ok: true };
  });

// ============================================================
// Admin - assinantes (profissionais)
// ============================================================
export const adminListSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    // Combina profiles + user_roles + contagem básica
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name, credential, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    }
    // Contagem de pacientes por prof (admin vê tudo via RLS)
    const { data: patients } = await supabase
      .from("patients")
      .select("professional_id")
      .is("deleted_at", null);
    const patientCount = new Map<string, number>();
    for (const p of patients ?? [])
      patientCount.set(p.professional_id, (patientCount.get(p.professional_id) ?? 0) + 1);
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: roleMap.get(p.id) ?? [],
      patients: patientCount.get(p.id) ?? 0,
    }));
  });

// ============================================================
// Admin - métricas
// ============================================================
export const adminMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const [{ data: newProfs }, { data: newAssessments }, { data: allAssessmentsCount }, { count: totalProfs }] =
      await Promise.all([
        supabase.from("profiles").select("created_at").gte("created_at", since),
        supabase.from("assessments").select("created_at, status").gte("created_at", since),
        supabase.from("assessments").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

    // Agrega por dia (30d)
    const days: string[] = [];
    const dayFmt = (d: Date) => d.toISOString().slice(0, 10);
    for (let i = 29; i >= 0; i--) {
      days.push(dayFmt(new Date(Date.now() - i * 24 * 3600 * 1000)));
    }
    const profsByDay = new Map(days.map((d) => [d, 0]));
    for (const p of newProfs ?? []) {
      const k = p.created_at.slice(0, 10);
      if (profsByDay.has(k)) profsByDay.set(k, (profsByDay.get(k) ?? 0) + 1);
    }
    const assByDay = new Map(days.map((d) => [d, 0]));
    const completedByDay = new Map(days.map((d) => [d, 0]));
    for (const a of newAssessments ?? []) {
      const k = a.created_at.slice(0, 10);
      if (assByDay.has(k)) assByDay.set(k, (assByDay.get(k) ?? 0) + 1);
      if (a.status === "completed" && completedByDay.has(k))
        completedByDay.set(k, (completedByDay.get(k) ?? 0) + 1);
    }

    return {
      totals: {
        professionals: totalProfs ?? 0,
        new_professionals_30d: (newProfs ?? []).length,
        assessments_30d: (newAssessments ?? []).length,
        completed_30d: (newAssessments ?? []).filter((a) => a.status === "completed").length,
      },
      timeseries: days.map((d) => ({
        date: d,
        label: d.slice(5), // MM-DD
        signups: profsByDay.get(d) ?? 0,
        assessments: assByDay.get(d) ?? 0,
        completed: completedByDay.get(d) ?? 0,
      })),
      // apenas para métricas de saúde
      total_assessments_ever: allAssessmentsCount ?? 0,
    };
  });

// ============================================================
// Admin - CMS de instrumentos (criar completo em uma transação)
// ============================================================
const instrumentPayload = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  instructions: z.string().trim().max(4000).default(""),
  estimated_minutes: z.coerce.number().int().min(1).max(240).optional().nullable(),
  domains: z
    .array(z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(120) }))
    .default([]),
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        ordinal: z.coerce.number().int().min(1),
        is_inverted: z.boolean().default(false),
        domain_code: z.string().trim().max(20).optional(),
      }),
    )
    .min(1),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        ordinal: z.coerce.number().int().min(0),
        weight: z.coerce.number(),
      }),
    )
    .min(2),
  rule: z.object({
    aggregation: z.enum(["SUM", "MEAN", "SUM_BY_DOMAIN"]),
    min_value: z.coerce.number().default(0),
    max_value: z.coerce.number().default(0),
  }),
  cutoffs: z
    .array(
      z.object({
        classification: z.string().trim().min(1).max(80),
        min_score: z.coerce.number(),
        max_score: z.coerce.number(),
        message: z.string().trim().max(500).default(""),
        domain_code: z.string().trim().max(20).optional(),
      }),
    )
    .default([]),
});

export const adminCreateInstrument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => instrumentPayload.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    // Usa supabaseAdmin para operação transacional (múltiplas tabelas)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. instrumento
    const { data: inst, error: iErr } = await supabaseAdmin
      .from("instruments")
      .insert({
        code: data.code,
        name: data.name,
        description: data.description,
        instructions: data.instructions,
        estimated_minutes: data.estimated_minutes ?? null,
      })
      .select("id")
      .single();
    if (iErr) throw new Error(`Falha ao criar instrumento: ${iErr.message}`);
    const instrument_id = inst.id;

    try {
      // 2. domínios
      const domainCodeToId = new Map<string, string>();
      if (data.domains.length > 0) {
        const { data: doms, error: dErr } = await supabaseAdmin
          .from("domains")
          .insert(data.domains.map((d) => ({ ...d, instrument_id })))
          .select("id, code");
        if (dErr) throw new Error(`Domínios: ${dErr.message}`);
        for (const d of doms ?? []) domainCodeToId.set(d.code, d.id);
      }

      // 3. opções globais (question_id null)
      const { data: opts, error: oErr } = await supabaseAdmin
        .from("options")
        .insert(data.options.map((o) => ({ ...o, instrument_id })))
        .select("id");
      if (oErr) throw new Error(`Opções: ${oErr.message}`);
      if (!opts || opts.length === 0) throw new Error("Nenhuma opção salva.");

      // 4. questões
      const { error: qErr } = await supabaseAdmin.from("questions").insert(
        data.questions.map((q) => ({
          instrument_id,
          text: q.text,
          ordinal: q.ordinal,
          is_inverted: q.is_inverted,
          domain_id: q.domain_code ? domainCodeToId.get(q.domain_code) ?? null : null,
        })),
      );
      if (qErr) throw new Error(`Questões: ${qErr.message}`);

      // 5. scoring rule
      const { error: rErr } = await supabaseAdmin.from("scoring_rules").insert({
        instrument_id,
        aggregation: data.rule.aggregation,
        min_value: data.rule.min_value,
        max_value: data.rule.max_value,
      });
      if (rErr) throw new Error(`Regra: ${rErr.message}`);

      // 6. cutoffs
      if (data.cutoffs.length > 0) {
        const { error: cErr } = await supabaseAdmin.from("cutoffs").insert(
          data.cutoffs.map((c) => ({
            instrument_id,
            classification: c.classification,
            min_score: c.min_score,
            max_score: c.max_score,
            message: c.message,
            domain_id: c.domain_code ? domainCodeToId.get(c.domain_code) ?? null : null,
          })),
        );
        if (cErr) throw new Error(`Cutoffs: ${cErr.message}`);
      }
    } catch (e) {
      // Rollback manual - remove o instrumento (cascade limpa dependentes)
      await supabaseAdmin.from("instruments").delete().eq("id", instrument_id);
      throw e;
    }

    await writeAudit(supabase, userId, "admin.audit_view", "instrument", instrument_id, {
      code: data.code,
      questions: data.questions.length,
    });
    return { id: instrument_id };
  });
