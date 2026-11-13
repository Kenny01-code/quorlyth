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
  v_needle := $needle$if entry.value = 'true'::jsonb and not exists (select 1 from public.docs i$needle$;
  v_replacement := $replacement$if entry.value = 'true'::jsonb
        and coalesce(old_data->'ideas'->>entry.key, 'false') <> 'true'
        and not exists (select 1 from public.docs i$replacement$;

  IF strpos(v_definition, v_replacement) > 0 THEN
    RAISE NOTICE 'Vote visibility validation has already been patched';
    RETURN;
  END IF;

  IF strpos(v_definition, v_needle) = 0 THEN
    RAISE EXCEPTION 'Expected vote validation condition was not found; refusing to modify function';
  END IF;

  v_definition := replace(v_definition, v_needle, v_replacement);
  EXECUTE v_definition;
END
$migration$;
