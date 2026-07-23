// Server functions - campanhas de grupo (link único reutilizável).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit";
import { enforceRateLimit, safeRequestIP } from "@/lib/rate-limit";
import { computeScore, type EngineInstrument } from "@/lib/scoring/engine";
import { buildInstrumentResponseDistribution, normalizeInstrumentSelection } from "@/lib/group-campaigns.utils";
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type CampaignInstrument = { instrument_id: string; display_order?: number | null };
type CampaignInstrumentDetail = { id: string; code: string; name: string };
type GroupResponseRow = {
  id: string;
  instrument_id?: string | null;
  respondent_name: string;
  academic_period: string;
  computed: Json;
  cutoff_hits: Json;
  severity_classification: string | null;
  flags: Json;
  submitted_at: string;
};

// Instrumentos habilitados para modo grupo (triagens curtas).
export const GROUP_ELIGIBLE_CODES = [
  "GAD-7",
  "PHQ-9",
  "WHOQOL-BREF",
  "DASS-21",
  "AUDIT",
  "ISI",
  "ROSENBERG",
] as const;

async function loadCrypto() {
  return await import("@/lib/crypto.server");
}

async function guardPublic(bucket: string, token: string, limit: number, windowMs: number) {
  const ip = await safeRequestIP();
  const res = await enforceRateLimit({ bucket, key: `${token}|${ip}`, limit, windowMs });
  if (!res.ok) throw new Error("Muitas requisições. Aguarde alguns instantes e tente novamente.");
}

function isSchemaCacheMiss(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null | undefined;
  const message = err?.message ?? "";
  return (
    err?.code === "PGRST204" ||
    err?.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("group_campaign_instruments") ||
    message.includes("'instrument_id' column")
  );
}

async function insertCampaignInstrumentLinks(
  supabase: SupabaseClientLike,
  rows: Array<{ campaign_id: string; instrument_id: string; display_order: number }>,
) {
  const { error } = await supabase.from("group_campaign_instruments").insert(rows);
  if (!error) return true;
  if (isSchemaCacheMiss(error)) return false;
  throw new Error(error.message);
}

async function getCampaignInstrumentLinks(
  supabase: SupabaseClientLike,
  campaignId: string,
): Promise<CampaignInstrument[] | null> {
  const { data, error } = await supabase
    .from("group_campaign_instruments")
    .select("instrument_id, display_order")
    .eq("campaign_id", campaignId)
    .order("display_order", { ascending: true });
  if (!error) return data ?? [];
  if (isSchemaCacheMiss(error)) return null;
  throw new Error(error.message);
}

async function getCampaignInstrumentDetails(
  supabase: SupabaseClientLike,
  instrumentIds: string[],
  fallbackInstrument?: { id: string; code: string; name: string } | null,
): Promise<CampaignInstrumentDetail[]> {
  const orderedIds = instrumentIds.length > 0
    ? instrumentIds
    : fallbackInstrument?.id
      ? [fallbackInstrument.id]
      : [];
  if (orderedIds.length === 0) return [];

  const { data, error } = await supabase
    .from("instruments")
    .select("id, code, name")
    .in("id", orderedIds);
  if (error) throw new Error(error.message);

  const byId = new Map((data ?? []).map((instrument: CampaignInstrumentDetail) => [instrument.id, instrument]));
  return orderedIds
    .map((id) => byId.get(id))
    .filter((instrument): instrument is CampaignInstrumentDetail => Boolean(instrument));
}

async function listCampaignInstrumentDetails(
  supabase: SupabaseClientLike,
  campaignIds: string[],
): Promise<Map<string, CampaignInstrumentDetail[]> | null> {
  const { data, error } = await supabase
    .from("group_campaign_instruments")
    .select("campaign_id, display_order, instrument:instruments!group_campaign_instruments_instrument_id_fkey(id, code, name)")
    .in("campaign_id", campaignIds)
    .order("display_order", { ascending: true });
  if (error) {
    if (isSchemaCacheMiss(error)) return null;
    throw new Error(error.message);
  }

  const instrumentMap = new Map<string, CampaignInstrumentDetail[]>();
  for (const row of data ?? []) {
    const instrument = Array.isArray(row.instrument) ? row.instrument[0] : row.instrument;
    if (!instrument) continue;
    const arr = instrumentMap.get(row.campaign_id) ?? [];
    arr.push({ id: instrument.id, code: instrument.code, name: instrument.name });
    instrumentMap.set(row.campaign_id, arr);
  }
  return instrumentMap;
}

async function listGroupResponses(
  supabase: SupabaseClientLike,
  campaignId: string,
  fallbackInstrumentId?: string,
): Promise<GroupResponseRow[]> {
  const withInstrument = await supabase
    .from("group_responses")
    .select("id, instrument_id, respondent_name, academic_period, computed, cutoff_hits, severity_classification, flags, submitted_at")
    .eq("campaign_id", campaignId)
    .order("submitted_at", { ascending: false });
  if (!withInstrument.error) return withInstrument.data ?? [];
  if (!isSchemaCacheMiss(withInstrument.error)) throw new Error(withInstrument.error.message);

  const legacy = await supabase
    .from("group_responses")
    .select("id, respondent_name, computed, cutoff_hits, severity_classification, flags, submitted_at")
    .eq("campaign_id", campaignId)
    .order("submitted_at", { ascending: false });
  if (legacy.error) throw new Error(legacy.error.message);
  return (legacy.data ?? []).map((row: GroupResponseRow) => ({
    ...row,
    instrument_id: fallbackInstrumentId ?? null,
  }));
}

async function insertGroupResponse(
  supabase: SupabaseClientLike,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from("group_responses").insert(payload);
  if (!error) return;
  if (!isSchemaCacheMiss(error)) throw new Error(error.message);

  const { instrument_id: _instrumentId, ...legacyPayload } = payload;
  const legacy = await supabase.from("group_responses").insert(legacyPayload);
  if (legacy.error) throw new Error(legacy.error.message);
}

// ---------------- PROFISSIONAL ----------------

const createSchema = z.object({
  instrument_ids: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional().nullable(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).default(""),
  consent_title: z.string().trim().min(3).max(200).default("Termo de Consentimento Livre e Esclarecido"),
  consent_body: z.string().trim().min(20).max(20000),
  expires_at: z.string().datetime().optional().nullable(),
});

export const createGroupCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const instrumentIds = normalizeInstrumentSelection(
      data.instrument_ids ?? null,
    );

    const { data: instruments, error: iErr } = await supabase
      .from("instruments")
      .select("id, code")
      .in("id", instrumentIds);
    if (iErr || !instruments || instruments.length !== instrumentIds.length) {
      throw new Error("Um ou mais instrumentos não foram encontrados.");
    }

    const invalid = instruments.filter((inst) => !GROUP_ELIGIBLE_CODES.includes(inst.code as typeof GROUP_ELIGIBLE_CODES[number]));
    if (invalid.length > 0) {
      throw new Error("Alguns instrumentos não estão habilitados para campanhas em grupo.");
    }

    const { randomBytes } = await import("node:crypto");
    const { hashToken } = await loadCrypto();
    const token = randomBytes(24).toString("base64url");

    const { data: row, error } = await supabase
      .from("group_campaigns")
      .insert({
        professional_id: userId,
        instrument_id: instrumentIds[0],
        title: data.title,
        description: data.description,
        consent_title: data.consent_title,
        consent_body: data.consent_body,
        access_token_hash: hashToken(token),
        expires_at: data.expires_at ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const campaignInstrumentRows = instruments.map((inst, index) => ({
      campaign_id: row.id,
      instrument_id: inst.id,
      display_order: index,
    }));

    const linked = await insertCampaignInstrumentLinks(supabase, campaignInstrumentRows);

    await writeAudit(supabase, userId, "assessment.create", "group_campaign", row.id, {
      instruments: instruments.map((inst) => inst.code),
      multi_instrument_links: linked,
    });
    return {
      id: row.id,
      token,
      instrument_ids: linked ? instrumentIds : [instruments[0].id],
      schema_fallback: !linked,
    };
  });

export const listGroupCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("group_campaigns")
      .select("id, title, description, is_active, expires_at, created_at, instrument:instruments!group_campaigns_instrument_id_fkey(id, code, name)")
      .eq("professional_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return [];
    const ids = data.map((c) => c.id);
    const [{ data: counts }, instrumentMap] = await Promise.all([
      supabase.from("group_responses").select("campaign_id").in("campaign_id", ids),
      listCampaignInstrumentDetails(supabase, ids),
    ]);
    const countMap = new Map<string, number>();
    for (const r of counts ?? []) countMap.set(r.campaign_id, (countMap.get(r.campaign_id) ?? 0) + 1);
    return data.map((c) => ({
      ...c,
      response_count: countMap.get(c.id) ?? 0,
      instruments: instrumentMap?.get(c.id) ?? (c.instrument ? [c.instrument] : []),
    }));
  });

const idSchema = z.object({ campaign_id: z.string().uuid() });

export const getGroupCampaignDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: c, error } = await supabase
      .from("group_campaigns")
      .select("id, title, description, is_active, expires_at, created_at, consent_title, consent_body, access_token_hash, instrument:instruments!group_campaigns_instrument_id_fkey(id, code, name)")
      .eq("id", data.campaign_id)
      .single();
    if (error || !c) throw new Error("Campanha não encontrada.");
    const linkedInstruments = await getCampaignInstrumentLinks(supabase, data.campaign_id);
    const instrumentIds = (linkedInstruments ?? []).map((item) => item.instrument_id);
    const instruments = await getCampaignInstrumentDetails(supabase, instrumentIds, c.instrument);
    const responses = await listGroupResponses(supabase, data.campaign_id, c.instrument?.id);
    const instrumentDistribution = buildInstrumentResponseDistribution(responses, instruments);
    return {
      campaign: {
        ...c,
        instruments,
        schema_fallback: linkedInstruments === null,
      },
      responses,
      instrumentDistribution,
    };
  });

export const toggleGroupCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaign_id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("group_campaigns")
      .update({ is_active: data.is_active })
      .eq("id", data.campaign_id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "patient.update", "group_campaign", data.campaign_id, {
      is_active: data.is_active,
    });
    return { ok: true };
  });

export const deleteGroupCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("group_campaigns").delete().eq("id", data.campaign_id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "patient.soft_delete", "group_campaign", data.campaign_id, {});
    return { ok: true };
  });

// ---------------- PÚBLICO ----------------

const publicToken = z.object({ token: z.string().min(20).max(80) });

export const getGroupCampaignByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => publicToken.parse(d))
  .handler(async ({ data }) => {
    await guardPublic("public:group-get", data.token, 120, 60_000);
    const { hashToken } = await loadCrypto();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c, error } = await supabaseAdmin
      .from("group_campaigns")
      .select("id, title, description, is_active, expires_at, consent_title, consent_body, consent_version, instrument_id")
      .eq("access_token_hash", hashToken(data.token))
      .single();
    if (error || !c) throw new Error("Link inválido.");
    if (!c.is_active) throw new Error("Esta pesquisa está encerrada.");
    if (c.expires_at && new Date(c.expires_at) < new Date()) throw new Error("Esta pesquisa expirou.");

    const linkInstruments = await getCampaignInstrumentLinks(supabaseAdmin, c.id);

    const instrumentIds = (linkInstruments ?? []).map((item) => item.instrument_id);
    const effectiveInstrumentIds = instrumentIds.length > 0 ? instrumentIds : (c.instrument_id ? [c.instrument_id] : []);
    if (effectiveInstrumentIds.length === 0) {
      throw new Error("Nenhum instrumento de avaliação foi encontrado para esta campanha.");
    }

    const instrumentPayloads = await Promise.all(
      effectiveInstrumentIds.map(async (instrumentId) => {
        const [{ data: inst }, { data: questions }, { data: options }] = await Promise.all([
          supabaseAdmin.from("instruments").select("id, code, name, description, instructions").eq("id", instrumentId).single(),
          supabaseAdmin.from("questions").select("id, ordinal, text, is_inverted").eq("instrument_id", instrumentId).order("ordinal"),
          supabaseAdmin.from("options").select("id, ordinal, label, weight, question_id").eq("instrument_id", instrumentId).order("ordinal"),
        ]);
        return {
          id: inst!.id,
          code: inst!.code,
          name: inst!.name,
          description: inst!.description,
          instructions: inst!.instructions,
          questions: questions ?? [],
          options: options ?? [],
        };
      }),
    );
    const primaryInstrument = instrumentPayloads[0];
    return {
      campaign: {
        id: c.id, title: c.title, description: c.description,
        consent_title: c.consent_title, consent_body: c.consent_body, consent_version: c.consent_version,
        instrument_ids: effectiveInstrumentIds,
        schema_fallback: linkInstruments === null,
      },
      instrument: {
        id: primaryInstrument.id,
        code: primaryInstrument.code,
        name: primaryInstrument.name,
        description: primaryInstrument.description,
        instructions: primaryInstrument.instructions,
      },
      questions: primaryInstrument.questions,
      options: primaryInstrument.options,
      instruments: instrumentPayloads,
    };
  });

export const submitGroupResponse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      token: z.string().min(20).max(80),
      respondent_name: z.string().trim().min(3).max(160),
      academic_period: z.string().trim().min(1, "Informe o período atual na faculdade.").max(50),
      consent: z.object({ tcle_accepted: z.literal(true), lgpd_accepted: z.literal(true) }),
      instrument_id: z.string().uuid(),
      answers: z.array(z.object({ question_id: z.string().uuid(), option_id: z.string().uuid() })).min(1),
      user_agent: z.string().max(500).default(""),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    await guardPublic("public:group-submit", data.token, 20, 60_000);
    const { hashToken, anonymizeIP } = await loadCrypto();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: c } = await supabaseAdmin
      .from("group_campaigns")
      .select("id, is_active, expires_at, instrument_id, consent_version")
      .eq("access_token_hash", hashToken(data.token))
      .single();
    if (!c) throw new Error("Link inválido.");
    if (!c.is_active) throw new Error("Esta pesquisa está encerrada.");
    if (c.expires_at && new Date(c.expires_at) < new Date()) throw new Error("Esta pesquisa expirou.");

    const linkInstruments = await getCampaignInstrumentLinks(supabaseAdmin, c.id);

    const instrumentIds = (linkInstruments ?? []).map((item) => item.instrument_id);
    const selectedInstrumentId = instrumentIds.includes(data.instrument_id) ? data.instrument_id : (instrumentIds[0] ?? c.instrument_id);

    const [{ data: instRow }, { data: qs }, { data: opts }, { data: rule }, { data: cutoffs }] = await Promise.all([
      supabaseAdmin.from("instruments").select("id, code").eq("id", selectedInstrumentId).single(),
      supabaseAdmin.from("questions").select("id, ordinal, is_inverted, domain_id").eq("instrument_id", selectedInstrumentId).order("ordinal"),
      supabaseAdmin.from("options").select("id, ordinal, weight, question_id").eq("instrument_id", selectedInstrumentId),
      supabaseAdmin.from("scoring_rules").select("aggregation, min_value, max_value, transform").eq("instrument_id", selectedInstrumentId).single(),
      supabaseAdmin.from("cutoffs").select("min_score, max_score, classification, message, domain_id").eq("instrument_id", selectedInstrumentId),
    ]);
    if (!instRow || !rule || !qs) throw new Error("Instrumento incompleto.");
    if (data.answers.length < qs.length) throw new Error("Responda todas as questões.");

    const result = computeScore({
      id: instRow.id, code: instRow.code,
      questions: qs.map((q) => ({ id: q.id, ordinal: q.ordinal, is_inverted: q.is_inverted, domain_id: q.domain_id })),
      options: (opts ?? []).map((o) => ({ id: o.id, ordinal: o.ordinal, weight: Number(o.weight) })),
      rule: { aggregation: rule.aggregation, min_value: Number(rule.min_value), max_value: Number(rule.max_value), transform: rule.transform as EngineInstrument["rule"]["transform"] },
      cutoffs: (cutoffs ?? []).map((cu) => ({ min_score: Number(cu.min_score), max_score: Number(cu.max_score), classification: cu.classification, message: cu.message, domain_id: cu.domain_id })),
    }, data.answers);

    const severity = result.cutoff_hits.find((h) => h.scope === "total")?.classification ?? null;

    let ip = "unknown";
    try {
      const { getRequestIP } = await import("@tanstack/react-start/server");
      ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    } catch { /* ignore */ }

    await insertGroupResponse(supabaseAdmin, {
      campaign_id: c.id,
      instrument_id: selectedInstrumentId,
      respondent_name: data.respondent_name,
      academic_period: data.academic_period,
      answers: data.answers,
      computed: result.computed,
      cutoff_hits: result.cutoff_hits,
      severity_classification: severity,
      flags: result.flags,
      ip_hash: anonymizeIP(ip),
      user_agent: data.user_agent.slice(0, 500),
      consent_version: c.consent_version,
    });
    return { ok: true };
  });

// Instrumentos elegíveis (para o formulário de criação)
export const listGroupEligibleInstruments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("instruments")
      .select("id, code, name, description, estimated_minutes")
      .in("code", GROUP_ELIGIBLE_CODES as unknown as string[])
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
