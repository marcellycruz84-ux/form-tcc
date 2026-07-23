// Zod schemas - shared client/server input validation.
import { z } from "zod";

export const cpfSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\D+/g, ""))
  .refine((s) => s.length === 0 || s.length === 11, { message: "CPF deve ter 11 dígitos" });

export const patientInputSchema = z.object({
  full_name: z.string().trim().min(2, "Nome muito curto").max(120),
  cpf: cpfSchema,
  email: z.string().trim().email("Email inválido").max(160).or(z.literal("")),
  phone: z.string().trim().max(30).default(""),
  birth_year: z.coerce.number().int().min(1900).max(new Date().getFullYear()).optional().nullable(),
  gender: z.string().trim().max(30).default(""),
  notes: z.string().trim().max(4000).default(""),
});
export type PatientInput = z.infer<typeof patientInputSchema>;

export const uuid = z.string().uuid();

export const createAssessmentSchema = z.object({
  patient_id: uuid,
  instrument_code: z.string().min(2).max(20),
  ttl_hours: z.coerce.number().int().min(1).max(240).default(48),
});

export const submitAnswerSchema = z.object({
  token: z.string().min(20).max(80),
  question_id: uuid,
  option_id: uuid,
});

export const submitAssessmentSchema = z.object({
  token: z.string().min(20).max(80),
  consent: z.object({
    accepted: z.literal(true),
    terms_version: z.string().default("v1"),
  }),
});

export const patientIdSchema = z.object({ patient_id: uuid });
export const assessmentIdSchema = z.object({ assessment_id: uuid });
export const tokenSchema = z.object({ token: z.string().min(20).max(80) });
