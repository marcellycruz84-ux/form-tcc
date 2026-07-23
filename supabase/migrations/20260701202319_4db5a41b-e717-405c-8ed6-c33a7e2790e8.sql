-- Fase 1: Ativação de instrumentos por profissional + tickets de solicitação

-- Enum de status dos tickets
CREATE TYPE public.ticket_status AS ENUM ('pending', 'in_review', 'delivered', 'rejected');

-- Campo de tempo estimado no instrumento (usado pelo CMS e pela biblioteca)
ALTER TABLE public.instruments ADD COLUMN IF NOT EXISTS estimated_minutes integer;

-- ============================================================
-- professional_instruments: quais instrumentos o profissional ativou
-- ============================================================
CREATE TABLE public.professional_instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, instrument_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_instruments TO authenticated;
GRANT ALL ON public.professional_instruments TO service_role;

ALTER TABLE public.professional_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof reads own instrument prefs"
  ON public.professional_instruments FOR SELECT TO authenticated
  USING (professional_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "prof inserts own instrument prefs"
  ON public.professional_instruments FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "prof updates own instrument prefs"
  ON public.professional_instruments FOR UPDATE TO authenticated
  USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "prof deletes own instrument prefs"
  ON public.professional_instruments FOR DELETE TO authenticated
  USING (professional_id = auth.uid());

CREATE TRIGGER trg_prof_instruments_updated
  BEFORE UPDATE ON public.professional_instruments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial: todos os profissionais existentes recebem todos os instrumentos ativos
INSERT INTO public.professional_instruments (professional_id, instrument_id, is_active)
SELECT ur.user_id, i.id, true
FROM public.user_roles ur
CROSS JOIN public.instruments i
WHERE ur.role = 'professional'
ON CONFLICT DO NOTHING;

-- Trigger: novos profissionais ganham todos os instrumentos ativos
CREATE OR REPLACE FUNCTION public.seed_instruments_for_new_professional()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'professional' THEN
    INSERT INTO public.professional_instruments (professional_id, instrument_id, is_active)
    SELECT NEW.user_id, i.id, true FROM public.instruments i
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_seed_instruments_for_new_prof
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.seed_instruments_for_new_professional();

-- Trigger: novos instrumentos ficam ativos para todos os profissionais existentes
CREATE OR REPLACE FUNCTION public.seed_new_instrument_for_professionals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.professional_instruments (professional_id, instrument_id, is_active)
  SELECT ur.user_id, NEW.id, true FROM public.user_roles ur WHERE ur.role = 'professional'
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_seed_new_instrument_for_profs
  AFTER INSERT ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.seed_new_instrument_for_professionals();

-- ============================================================
-- instrument_requests: tickets do profissional solicitando novos testes
-- ============================================================
CREATE TABLE public.instrument_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument_name text NOT NULL,
  reference text NOT NULL DEFAULT '',
  purpose text NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'pending',
  admin_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instrument_requests TO authenticated;
GRANT ALL ON public.instrument_requests TO service_role;

ALTER TABLE public.instrument_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof reads own tickets or admin reads all"
  ON public.instrument_requests FOR SELECT TO authenticated
  USING (professional_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "prof creates own tickets"
  ON public.instrument_requests FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY "admin updates tickets"
  ON public.instrument_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin deletes tickets"
  ON public.instrument_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_instrument_requests_updated
  BEFORE UPDATE ON public.instrument_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_instrument_requests_status ON public.instrument_requests (status, created_at DESC);
CREATE INDEX idx_instrument_requests_prof ON public.instrument_requests (professional_id, created_at DESC);
