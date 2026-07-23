
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Função que faz o expire
CREATE OR REPLACE FUNCTION public.expire_stale_assessments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.assessments
  SET status = 'expired'
  WHERE consumed_at IS NULL
    AND expires_at < now()
    AND status IN ('pending', 'in_progress');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Remove agendamento anterior se existir e reagenda
DO $$
BEGIN
  PERFORM cron.unschedule('expire-stale-assessments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-stale-assessments',
  '*/5 * * * *',
  $$ SELECT public.expire_stale_assessments(); $$
);
