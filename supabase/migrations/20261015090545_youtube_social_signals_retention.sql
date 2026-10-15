-- Public YouTube API data should not remain stored indefinitely. Stored review
-- evidence expires after 29 days; this daily job removes the temporary source
-- video metadata and YouTube-specific rationale while preserving the review.
create extension if not exists pg_cron with schema pg_catalog;

DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname = 'quorlyth-youtube-social-signals-retention'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'quorlyth-youtube-social-signals-retention',
    '17 0 * * *',
    $cleanup$
      UPDATE public.docs
      SET data = data - 'youtubeSignals' - 'youtubeRationale',
          updated_at = now()
      WHERE path LIKE 'reviews/%'
        AND jsonb_typeof(data->'youtubeSignals') = 'object'
        AND COALESCE(NULLIF(data->'youtubeSignals'->>'expiresAt', '')::bigint, 0)
            < (extract(epoch FROM now()) * 1000)::bigint;
    $cleanup$
  );
END
$$;
