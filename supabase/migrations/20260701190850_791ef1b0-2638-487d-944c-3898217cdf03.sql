ALTER TABLE public.assessment_results
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS assessment_results_unreviewed_idx
  ON public.assessment_results (reviewed_at)
  WHERE reviewed_at IS NULL;