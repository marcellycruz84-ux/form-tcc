
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'professional');
CREATE TYPE public.assessment_status AS ENUM ('pending', 'in_progress', 'completed', 'expired');
CREATE TYPE public.aggregation_kind AS ENUM ('SUM', 'MEAN', 'SUM_BY_DOMAIN');

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  credential TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Own profile upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'professional')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Attach signup trigger AFTER user_roles exists
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PATIENTS (PII encrypted at app layer) ============
-- pii_encrypted: base64 payload (iv + ciphertext + tag) produced by app
-- cpf_hash: HMAC-SHA256(cpf, CPF_HASH_PEPPER) for deterministic lookup
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pii_encrypted TEXT NOT NULL,
  cpf_hash TEXT,
  birth_year INT,
  gender TEXT,
  notes_encrypted TEXT,
  anonymized_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patients_prof ON public.patients(professional_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_cpf_hash ON public.patients(cpf_hash) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prof reads own patients" ON public.patients FOR SELECT TO authenticated USING (professional_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "Prof inserts own patients" ON public.patients FOR INSERT TO authenticated WITH CHECK (professional_id = auth.uid());
CREATE POLICY "Prof updates own patients" ON public.patients FOR UPDATE TO authenticated USING (professional_id = auth.uid());
CREATE POLICY "Prof deletes own patients" ON public.patients FOR DELETE TO authenticated USING (professional_id = auth.uid());
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ INSTRUMENTS ============
CREATE TABLE public.instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.instruments TO authenticated, anon;
GRANT ALL ON public.instruments TO service_role;
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Instruments public read" ON public.instruments FOR SELECT TO authenticated, anon USING (true);

-- ============ DOMAINS ============
CREATE TABLE public.domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(instrument_id, code)
);
GRANT SELECT ON public.domains TO authenticated, anon;
GRANT ALL ON public.domains TO service_role;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Domains public read" ON public.domains FOR SELECT TO authenticated, anon USING (true);

-- ============ QUESTIONS ============
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES public.domains(id) ON DELETE SET NULL,
  ordinal INT NOT NULL,
  text TEXT NOT NULL,
  is_inverted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(instrument_id, ordinal)
);
GRANT SELECT ON public.questions TO authenticated, anon;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions public read" ON public.questions FOR SELECT TO authenticated, anon USING (true);

-- ============ OPTIONS ============
-- Standardized options attached to an instrument (question_id NULL) or per-question
CREATE TABLE public.options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  ordinal INT NOT NULL,
  label TEXT NOT NULL,
  weight NUMERIC NOT NULL
);
CREATE INDEX idx_options_instrument ON public.options(instrument_id);
CREATE INDEX idx_options_question ON public.options(question_id);
GRANT SELECT ON public.options TO authenticated, anon;
GRANT ALL ON public.options TO service_role;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Options public read" ON public.options FOR SELECT TO authenticated, anon USING (true);

-- ============ SCORING RULES ============
CREATE TABLE public.scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL UNIQUE REFERENCES public.instruments(id) ON DELETE CASCADE,
  aggregation public.aggregation_kind NOT NULL,
  min_value NUMERIC NOT NULL DEFAULT 0,
  max_value NUMERIC NOT NULL DEFAULT 0,
  transform JSONB
);
GRANT SELECT ON public.scoring_rules TO authenticated, anon;
GRANT ALL ON public.scoring_rules TO service_role;
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoring rules public read" ON public.scoring_rules FOR SELECT TO authenticated, anon USING (true);

-- ============ CUTOFFS ============
CREATE TABLE public.cutoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES public.domains(id) ON DELETE CASCADE,
  min_score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL,
  classification TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_cutoffs_instrument ON public.cutoffs(instrument_id);
GRANT SELECT ON public.cutoffs TO authenticated, anon;
GRANT ALL ON public.cutoffs TO service_role;
ALTER TABLE public.cutoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cutoffs public read" ON public.cutoffs FOR SELECT TO authenticated, anon USING (true);

-- ============ ASSESSMENTS ============
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES public.instruments(id),
  status public.assessment_status NOT NULL DEFAULT 'pending',
  access_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessments_prof ON public.assessments(professional_id);
CREATE INDEX idx_assessments_patient ON public.assessments(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prof reads own assessments" ON public.assessments FOR SELECT TO authenticated USING (professional_id = auth.uid());
CREATE POLICY "Prof inserts own assessments" ON public.assessments FOR INSERT TO authenticated WITH CHECK (professional_id = auth.uid());
CREATE POLICY "Prof updates own assessments" ON public.assessments FOR UPDATE TO authenticated USING (professional_id = auth.uid());
CREATE POLICY "Prof deletes own assessments" ON public.assessments FOR DELETE TO authenticated USING (professional_id = auth.uid());
CREATE TRIGGER trg_assessments_updated BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ANSWERS ============
CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id),
  option_id UUID NOT NULL REFERENCES public.options(id),
  weight_snapshot NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, question_id)
);
CREATE INDEX idx_answers_assessment ON public.answers(assessment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.answers TO authenticated;
GRANT ALL ON public.answers TO service_role;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prof reads answers of own assessments" ON public.answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND a.professional_id = auth.uid()));

-- ============ RESULTS ============
CREATE TABLE public.assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL UNIQUE REFERENCES public.assessments(id) ON DELETE CASCADE,
  raw_scores JSONB NOT NULL,
  computed JSONB NOT NULL,
  cutoff_hits JSONB NOT NULL,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assessment_results TO authenticated;
GRANT ALL ON public.assessment_results TO service_role;
ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prof reads own results" ON public.assessment_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND a.professional_id = auth.uid()));

-- ============ LGPD CONSENTS ============
CREATE TABLE public.lgpd_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  terms_version TEXT NOT NULL
);
GRANT SELECT ON public.lgpd_consents TO authenticated;
GRANT ALL ON public.lgpd_consents TO service_role;
ALTER TABLE public.lgpd_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prof reads consents of own assessments" ON public.lgpd_consents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND a.professional_id = auth.uid()));

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_actor ON public.audit_logs(actor_user_id);
CREATE INDEX idx_audit_resource ON public.audit_logs(resource_type, resource_id);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own audit read" ON public.audit_logs FOR SELECT TO authenticated USING (actor_user_id = auth.uid());
