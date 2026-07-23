// Server functions - pacientes (CRUD) autenticados.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { patientInputSchema, patientIdSchema, cpfSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

async function loadCrypto() {
  return await import("@/lib/crypto.server");
}

export const listPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("patients")
      .select("id, pii_encrypted, birth_year, gender, created_at, updated_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const { decryptPII } = await loadCrypto();
    return (data ?? []).map((row) => {
      const pii = decryptPII(row.pii_encrypted);
      return {
        id: row.id,
        full_name: pii.full_name,
        cpf_masked: pii.cpf ? pii.cpf.replace(/^(\d{3})\d{5}(\d{3})$/, "$1.***.***-$2") : "",
        email: pii.email,
        phone: pii.phone,
        birth_year: row.birth_year,
        gender: row.gender,
        created_at: row.created_at,
      };
    });
  });

export const getPatient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patient_id: string }) => patientIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("patients")
      .select("id, pii_encrypted, notes_encrypted, birth_year, gender, created_at, updated_at")
      .eq("id", data.patient_id)
      .is("deleted_at", null)
      .single();
    if (error) throw new Error(error.message);
    const { decryptPII, decryptText } = await loadCrypto();
    const pii = decryptPII(row.pii_encrypted);
    return {
      id: row.id,
      ...pii,
      notes: decryptText(row.notes_encrypted),
      birth_year: row.birth_year,
      gender: row.gender,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

export const upsertPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ patient_id: z.string().uuid().optional(), input: patientInputSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { encryptPII, encryptText, hashCPF } = await loadCrypto();
    const encrypted = encryptPII({
      full_name: data.input.full_name,
      cpf: data.input.cpf,
      email: data.input.email,
      phone: data.input.phone,
    });
    const cpf_hash = hashCPF(data.input.cpf);
    const payload = {
      professional_id: userId,
      pii_encrypted: encrypted,
      cpf_hash,
      birth_year: data.input.birth_year ?? null,
      gender: data.input.gender || null,
      notes_encrypted: data.input.notes ? encryptText(data.input.notes) : null,
    };
    if (data.patient_id) {
      const { data: row, error } = await supabase
        .from("patients")
        .update(payload)
        .eq("id", data.patient_id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await writeAudit(supabase, userId, "patient.update", "patient", row.id);
      return { id: row.id };
    } else {
      const { data: row, error } = await supabase
        .from("patients")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await writeAudit(supabase, userId, "patient.create", "patient", row.id);
      return { id: row.id };
    }
  });

export const softDeletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { patient_id: string }) => patientIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("patients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.patient_id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, userId, "patient.soft_delete", "patient", data.patient_id);
    return { ok: true };
  });

export const searchPatientByCPF = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cpf: string }) => z.object({ cpf: cpfSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { hashCPF, decryptPII } = await loadCrypto();
    const hash = hashCPF(data.cpf);
    if (!hash) return [];
    const { data: rows, error } = await supabase
      .from("patients")
      .select("id, pii_encrypted")
      .eq("cpf_hash", hash)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ id: r.id, full_name: decryptPII(r.pii_encrypted).full_name }));
  });
