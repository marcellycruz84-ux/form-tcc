-- Identificação acadêmica obrigatória dos participantes de questionários em grupo.
ALTER TABLE public.group_responses
  ADD COLUMN IF NOT EXISTS academic_period text;

UPDATE public.group_responses
SET academic_period = 'Não informado'
WHERE academic_period IS NULL OR btrim(academic_period) = '';

ALTER TABLE public.group_responses
  ALTER COLUMN academic_period SET NOT NULL;

ALTER TABLE public.group_responses
  DROP CONSTRAINT IF EXISTS group_responses_academic_period_not_blank;

ALTER TABLE public.group_responses
  ADD CONSTRAINT group_responses_academic_period_not_blank
  CHECK (btrim(academic_period) <> '' AND char_length(academic_period) <= 50);
