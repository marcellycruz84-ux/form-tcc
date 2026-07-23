// Rate limiter para endpoints públicos.
// Estratégia: janela deslizante em memória (rápida) + tabela `rate_limits` de
// fallback (persistente entre isolates do Worker). Falhas do fallback nunca
// bloqueiam o request - apenas registram no console.
import { createHash } from "node:crypto";

type Bucket = { count: number; windowStart: number };

// Cache em memória por isolate. Aceitável porque o Worker rota requests do
// mesmo token para o mesmo isolate quase sempre - o DB cobre o resto.
const memory = new Map<string, Bucket>();

// Housekeeping para evitar crescimento indefinido.
function gc(now: number, windowMs: number) {
  if (memory.size < 5000) return;
  for (const [k, v] of memory) if (now - v.windowStart > windowMs * 2) memory.delete(k);
}

export interface RateLimitOptions {
  bucket: string;          // ex: "public:save-answer"
  key: string;             // token+ip
  limit: number;           // ex: 60
  windowMs: number;        // ex: 60_000
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

function hashKey(bucket: string, key: string) {
  return createHash("sha256").update(`${bucket}:${key}`).digest("hex");
}

export async function enforceRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const cacheKey = `${opts.bucket}:${opts.key}`;
  const existing = memory.get(cacheKey);
  let bucket: Bucket;
  if (!existing || now - existing.windowStart > opts.windowMs) {
    bucket = { count: 1, windowStart: now };
  } else {
    bucket = { count: existing.count + 1, windowStart: existing.windowStart };
  }
  memory.set(cacheKey, bucket);
  gc(now, opts.windowMs);

  // Consulta DB para consolidar contagem entre isolates.
  let dbCount = 0;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keyHash = hashKey(opts.bucket, opts.key);
    const since = new Date(now - opts.windowMs).toISOString();
    // Insere marcador desta janela
    await supabaseAdmin.from("rate_limits").insert({
      bucket: opts.bucket,
      key_hash: keyHash,
      window_start: new Date(now).toISOString(),
      count: 1,
    });
    const { count } = await supabaseAdmin
      .from("rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("bucket", opts.bucket)
      .eq("key_hash", keyHash)
      .gte("window_start", since);
    dbCount = count ?? 0;
    // GC oportunista de registros muito antigos (>2x janela)
    if (Math.random() < 0.02) {
      const old = new Date(now - opts.windowMs * 10).toISOString();
      await supabaseAdmin.from("rate_limits").delete().lt("window_start", old);
    }
  } catch (e) {
    console.warn("[rate-limit] fallback failed", e);
  }

  const effective = Math.max(bucket.count, dbCount);
  const remaining = Math.max(0, opts.limit - effective);
  if (effective > opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: opts.windowMs - (now - bucket.windowStart) };
  }
  return { ok: true, remaining, retryAfterMs: 0 };
}

// Extrai IP do request (best-effort). Nunca lança.
export async function safeRequestIP(): Promise<string> {
  try {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    return getRequestIP({ xForwardedFor: true }) ?? "unknown";
  } catch {
    return "unknown";
  }
}
