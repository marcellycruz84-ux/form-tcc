-- Compatibiliza a primeira versão das campanhas (user_id) com o fluxo atual
-- (professional_id), preservando campanhas e vínculos já existentes.

ALTER TABLE public.group_campaigns
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.instruments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS access_token_hash text,
  ADD COLUMN IF NOT EXISTS consent_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- A versão antiga chamava o proprietário de user_id.
UPDATE public.group_campaigns
SET professional_id = user_id
WHERE professional_id IS NULL;

-- A versão antiga guardava instrumentos somente na tabela de associação.
UPDATE public.group_campaigns AS campaign
SET instrument_id = linked.instrument_id
FROM (
  SELECT DISTINCT ON (campaign_id) campaign_id, instrument_id
  FROM public.group_campaign_instruments
  ORDER BY campaign_id, instrument_id
) AS linked
WHERE campaign.id = linked.campaign_id
  AND campaign.instrument_id IS NULL;

ALTER TABLE public.group_campaigns
  ALTER COLUMN professional_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_campaigns_access_token_hash
  ON public.group_campaigns(access_token_hash)
  WHERE access_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_group_campaigns_prof
  ON public.group_campaigns(professional_id);

ALTER TABLE public.group_campaign_instruments
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
