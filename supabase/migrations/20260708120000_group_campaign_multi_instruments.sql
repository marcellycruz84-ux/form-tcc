-- Suporte a múltiplos instrumentos por campanha de grupo

CREATE TABLE IF NOT EXISTS public.group_campaign_instruments (
  campaign_id uuid NOT NULL REFERENCES public.group_campaigns(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE RESTRICT,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, instrument_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_campaign_instruments TO authenticated;
GRANT ALL ON public.group_campaign_instruments TO service_role;

ALTER TABLE public.group_campaign_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_instruments_owner_select" ON public.group_campaign_instruments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_campaigns c
      WHERE c.id = campaign_id
        AND (c.professional_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
    )
  );

CREATE POLICY "campaign_instruments_owner_insert" ON public.group_campaign_instruments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_campaigns c
      WHERE c.id = campaign_id AND c.professional_id = auth.uid()
    )
  );

CREATE POLICY "campaign_instruments_owner_delete" ON public.group_campaign_instruments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_campaigns c
      WHERE c.id = campaign_id AND c.professional_id = auth.uid()
    )
  );

ALTER TABLE public.group_responses
  ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.instruments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_campaign_instruments_campaign ON public.group_campaign_instruments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_group_campaign_instruments_instr ON public.group_campaign_instruments(instrument_id);
CREATE INDEX IF NOT EXISTS idx_group_responses_instrument ON public.group_responses(instrument_id);
