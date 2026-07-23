// LGPD - direitos do titular: exportação, anonimização e esquecimento.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { patientIdSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";
import { createHash } from "node:crypto";

async function loadCrypto() { return await import("@/lib/crypto.server"); }

// C2 - Exportação completa dos dados do titular em JSON.
export const exportPatientData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => patientIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: patient, error } = await supabase
      .from("patients")
      .select("id, pii_encrypted, notes_encrypted, birth_year, gender, anonymized_at, deleted_at, created_at, updated_at")
      .eq("id", data.patient_id)
      .single();
    if (error || !patient) throw new Error("Paciente não encontrado");

    const { decryptPII, decryptText } = await loadCrypto();
    const pii = patient.anonymized_at ? null : decryptPII(patient.pii_encrypted);
    const notes = patient.anonymized_at ? null : decryptText(patient.notes_encrypted);

    const [{ data: assessments }, { data: consents }] = await Promise.all([
      supabase
        .from("assessments")
        .select("id, status, created_at, expires_at, consumed_at, instrument:instruments(code, name), answers(question_id, option_id, weight_snapshot, created_at), result:assessment_results(raw_scores, computed, cutoff_hits, flags, reviewed_at)")
        .eq("patient_id", data.patient_id),
      supabase
        .from("lgpd_consents")
        .select("id, assessment_id, ip_hash, user_agent, terms_version, created_at")
        .in("assessment_id",
          (await supabase.from("assessments").select("id").eq("patient_id", data.patient_id)).data?.map((a) => a.id) ?? [],
        ),
    ]);

    await writeAudit(supabase, userId, "patient.export", "patient", data.patient_id, {
      assessments: assessments?.length ?? 0,
    });

    return {
      exported_at: new Date().toISOString(),
      patient: {
        id: patient.id,
        birth_year: patient.birth_year,
        gender: patient.gender,
        anonymized_at: patient.anonymized_at,
        deleted_at: patient.deleted_at,
        created_at: patient.created_at,
        updated_at: patient.updated_at,
        personal_data: pii,
        notes,
      },
      assessments: assessments ?? [],
      consents: consents ?? [],
    };
  });

// C3 - Anonimização preservando escores clínicos.
export const anonymizePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => patientIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("patients")
      .update({
        pii_encrypted: "ANONYMIZED",
        notes_encrypted: null,
        cpf_hash: null,
        anonymized_at: new Date().toISOString(),
      })
      .eq("id", data.patient_id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "patient.anonymize", "patient", data.patient_id);
    return { ok: true };
  });

// C4 - Direito ao esquecimento (hard delete).
// Grava evento em audit_logs ANTES do delete, com hash do id (nenhum PII).
export const hardDeletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    patient_id: z.string().uuid(),
    confirmation: z.literal("EXCLUIR DEFINITIVAMENTE"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const idHash = createHash("sha256").update(data.patient_id).digest("hex");
    // Audit ANTES para não perder o rastro se o delete falhar em cascata.
    await writeAudit(supabase, userId, "patient.hard_delete", "patient", data.patient_id, {
      patient_id_hash: idHash,
      confirmed: true,
    });
    const { error } = await supabase.from("patients").delete().eq("id", data.patient_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
