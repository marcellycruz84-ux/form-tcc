// PII encryption helpers (server-only). AES-256-GCM with a project-level key.
// Never import from client-reachable modules at top level.
import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "node:crypto";

function loadKey(name: string, bytes: number): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing secret: ${name}`);
  // Secret is a random alphanumeric string; derive fixed-length key via SHA-256.
  return createHmac("sha256", "lovable-psi-kdf").update(`${name}:${raw}`).digest().subarray(0, bytes);
}

const KEY = () => loadKey("PII_ENCRYPTION_KEY", 32);
const PEPPER = () => process.env.CPF_HASH_PEPPER ?? "";

export interface PatientPII {
  full_name: string;
  cpf: string;
  email: string;
  phone: string;
}

export function encryptPII(payload: PatientPII): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptPII(blob: string): PatientPII {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8")) as PatientPII;
}

export function encryptText(text: string): string {
  if (!text) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY(), iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(text, "utf8")), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptText(blob: string | null | undefined): string {
  if (!blob) return "";
  const buf = Buffer.from(blob, "base64");
  const decipher = createDecipheriv("aes-256-gcm", KEY(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function normalizeCPF(cpf: string): string {
  return (cpf ?? "").replace(/\D+/g, "");
}

export function hashCPF(cpf: string): string | null {
  const norm = normalizeCPF(cpf);
  if (!norm) return null;
  return createHmac("sha256", PEPPER()).update(norm).digest("hex");
}

export function hashToken(token: string): string {
  return createHmac("sha256", PEPPER()).update(`token:${token}`).digest("hex");
}

export function anonymizeIP(ip: string): string {
  return createHmac("sha256", PEPPER()).update(`ip:${ip}`).digest("hex").slice(0, 32);
}
