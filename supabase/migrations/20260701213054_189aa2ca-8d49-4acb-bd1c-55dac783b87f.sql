
-- Grupos de avaliação (link único reutilizável) + respostas anônimas + agregados

CREATE TABLE IF NOT EXISTS public.group_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  access_token_hash text NOT NULL UNIQUE,
  consent_title text NOT NULL DEFAULT 'Termo de Consentimento Livre e Esclarecido',
  consent_body text NOT NULL DEFAULT '',
  consent_version text NOT NULL DEFAULT 'v1',
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_campaigns TO authenticated;
GRANT ALL ON public.group_campaigns TO service_role;

ALTER TABLE public.group_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_owner_select" ON public.group_campaigns;
DROP POLICY IF EXISTS "campaigns_owner_insert" ON public.group_campaigns;
DROP POLICY IF EXISTS "campaigns_owner_update" ON public.group_campaigns;
DROP POLICY IF EXISTS "campaigns_owner_delete" ON public.group_campaigns;

CREATE POLICY "campaigns_owner_select" ON public.group_campaigns
  FOR SELECT TO authenticated
  USING (professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "campaigns_owner_insert" ON public.group_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());
CREATE POLICY "campaigns_owner_update" ON public.group_campaigns
  FOR UPDATE TO authenticated
  USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());
CREATE POLICY "campaigns_owner_delete" ON public.group_campaigns
  FOR DELETE TO authenticated
  USING (professional_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_group_campaigns_prof ON public.group_campaigns(professional_id);

DROP TRIGGER IF EXISTS trg_group_campaigns_updated ON public.group_campaigns;
CREATE TRIGGER trg_group_campaigns_updated
  BEFORE UPDATE ON public.group_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Respostas
CREATE TABLE IF NOT EXISTS public.group_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.group_campaigns(id) ON DELETE CASCADE,
  respondent_name text NOT NULL,
  answers jsonb NOT NULL,
  computed jsonb NOT NULL,
  cutoff_hits jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity_classification text,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ip_hash text,
  user_agent text,
  consent_version text NOT NULL DEFAULT 'v1',
  submitted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_responses TO authenticated;
GRANT ALL ON public.group_responses TO service_role;

ALTER TABLE public.group_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "responses_owner_select" ON public.group_responses;
DROP POLICY IF EXISTS "responses_owner_delete" ON public.group_responses;

CREATE POLICY "responses_owner_select" ON public.group_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_campaigns c
      WHERE c.id = campaign_id
        AND (c.professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
    )
  );
CREATE POLICY "responses_owner_delete" ON public.group_responses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_campaigns c
      WHERE c.id = campaign_id AND c.professional_id = auth.uid()
    )
  );
-- INSERT é feito via supabaseAdmin no fluxo público (respondente sem sessão).

CREATE INDEX IF NOT EXISTS idx_group_responses_campaign ON public.group_responses(campaign_id);
