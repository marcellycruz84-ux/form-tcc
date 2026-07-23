
-- Rate limits fallback table (janela deslizante persistente)
CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,           -- ex: "public:submit"
  key_hash text NOT NULL,         -- sha256(token+ip)
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limits_lookup ON public.rate_limits (bucket, key_hash, window_start DESC);
CREATE INDEX idx_rate_limits_gc ON public.rate_limits (window_start);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Sem policies: apenas service_role (via supabaseAdmin) acessa.

-- Admin pode ler todos os audit_logs
CREATE POLICY "Admin reads all audit"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Índice de suporte para paginação do painel
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs (created_at DESC);
