DO $migration$
DECLARE
  v_function_oid oid;
  v_definition text;
  v_needle text;
  v_replacement text;
BEGIN
  SELECT p.oid
    INTO v_function_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'validate_doc_record'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION 'Could not find private.validate_doc_record()';
  END IF;

  v_definition := pg_get_functiondef(v_function_oid);
  v_needle := $needle$and not exists (select 1 from public.docs i
        where i.path = 'ideas/' || entry.key and private.can_view_community(i.data->>'cid')) then$needle$;
  v_replacement := $replacement$and not exists (
          select 1
          from public.docs i
          join public.docs c on c.path = 'communities/' || (i.data->>'cid')
          where i.path = 'ideas/' || entry.key
            and coalesce(c.data->>'arch', 'false') <> 'true'
            and private.can_view_community(i.data->>'cid')
        ) then$replacement$;

  IF strpos(v_definition, v_replacement) > 0 THEN
    RAISE NOTICE 'Archived-community vote guard has already been installed';
  ELSE
    IF strpos(v_definition, v_needle) = 0 THEN
      RAISE EXCEPTION 'Expected vote visibility condition was not found; refusing to modify function';
    END IF;
    v_definition := replace(v_definition, v_needle, v_replacement);
    EXECUTE v_definition;
  END IF;
END
$migration$;

WITH vote_maps AS (
  SELECT v.path,
         jsonb_set(
           v.data,
           '{ideas}',
           coalesce((
             SELECT jsonb_object_agg(
               e.key,
               CASE
                 WHEN e.value = 'true'::jsonb
                   AND coalesce(c.data->>'arch', 'false') = 'true'
                 THEN 'false'::jsonb
                 ELSE e.value
               END
             )
             FROM jsonb_each(coalesce(v.data->'ideas', '{}'::jsonb)) e
             LEFT JOIN public.docs i ON i.path = 'ideas/' || e.key
             LEFT JOIN public.docs c ON c.path = 'communities/' || (i.data->>'cid')
           ), '{}'::jsonb),
           true
         ) AS cleaned_data
  FROM public.docs v
  WHERE v.path ~ '^votes/[^/]+$'
    AND EXISTS (
      SELECT 1
      FROM jsonb_each(coalesce(v.data->'ideas', '{}'::jsonb)) e
      JOIN public.docs i ON i.path = 'ideas/' || e.key
      JOIN public.docs c ON c.path = 'communities/' || (i.data->>'cid')
      WHERE e.value = 'true'::jsonb
        AND coalesce(c.data->>'arch', 'false') = 'true'
    )
)
UPDATE public.docs v
SET data = vote_maps.cleaned_data
FROM vote_maps
WHERE v.path = vote_maps.path
  AND v.data IS DISTINCT FROM vote_maps.cleaned_data;