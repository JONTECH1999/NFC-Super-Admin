-- Add seven-day prospect trials and privacy-preserving daily usage summaries.
BEGIN;

ALTER TABLE public.managed_sites
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

CREATE TABLE IF NOT EXISTS public.site_trial_daily_usage (
  site_id text NOT NULL REFERENCES public.managed_sites(site_id) ON DELETE CASCADE,
  visit_date date NOT NULL,
  page_views bigint NOT NULL DEFAULT 0 CHECK (page_views >= 0),
  unique_visitors bigint NOT NULL DEFAULT 0 CHECK (unique_visitors >= 0),
  last_visit_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, visit_date)
);

CREATE TABLE IF NOT EXISTS public.site_trial_daily_visitors (
  site_id text NOT NULL,
  visit_date date NOT NULL,
  visitor_digest text NOT NULL CHECK (visitor_digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (site_id, visit_date, visitor_digest),
  FOREIGN KEY (site_id, visit_date)
    REFERENCES public.site_trial_daily_usage(site_id, visit_date)
    ON DELETE CASCADE
);

ALTER TABLE public.site_trial_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_trial_daily_visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_trial_daily_usage, public.site_trial_daily_visitors
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.site_trial_daily_usage, public.site_trial_daily_visitors
  TO service_role;

CREATE OR REPLACE FUNCTION public.is_managed_site_public(target_site_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce((
    SELECT site.is_active
      AND (
        NOT site.is_trial
        OR (site.trial_ends_at IS NOT NULL AND site.trial_ends_at > now())
      )
    FROM public.managed_sites AS site
    WHERE site.site_id = target_site_id
  ), false);
$function$;
REVOKE ALL ON FUNCTION public.is_managed_site_public(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_managed_site_public(text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_site(target_site_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.site_admins AS site_admin
    JOIN public.managed_sites AS site
      ON site.site_id = site_admin.site_id
    WHERE site_admin.site_id = target_site_id
      AND site_admin.user_id = (SELECT auth.uid())
      AND site.is_active
      AND site.client_enabled
      AND (
        NOT site.is_trial
        OR (site.trial_ends_at IS NOT NULL AND site.trial_ends_at > now())
      )
  ) OR (
    SELECT public.is_super_admin()
  );
$function$;
REVOKE ALL ON FUNCTION public.can_manage_site(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_site(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_managed_sites()
RETURNS TABLE (site_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT site.site_id, site.name
  FROM public.site_admins AS site_admin
  JOIN public.managed_sites AS site ON site.site_id = site_admin.site_id
  WHERE (
      site_admin.user_id = (SELECT auth.uid())
      AND site.is_active
      AND site.client_enabled
      AND (
        NOT site.is_trial
        OR (site.trial_ends_at IS NOT NULL AND site.trial_ends_at > now())
      )
    )
    OR public.is_super_admin()
  ORDER BY site.name;
$function$;
REVOKE ALL ON FUNCTION public.get_my_managed_sites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_managed_sites() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_site_trial_status(target_site_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'is_trial', site.is_trial,
    'is_available', public.is_managed_site_public(site.site_id),
    'trial_ends_at', site.trial_ends_at
  )
  FROM public.managed_sites AS site
  WHERE site.site_id = target_site_id
  UNION ALL
  SELECT jsonb_build_object(
    'is_trial', false,
    'is_available', false,
    'trial_ends_at', null
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.managed_sites AS site
    WHERE site.site_id = target_site_id
  )
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_public_site_trial_status(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_site_trial_status(text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_public_site_view(
  target_site_id text,
  target_visitor_digest text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  visit_day date := (now() AT TIME ZONE 'UTC')::date;
  visitor_added boolean := false;
BEGIN
  IF target_visitor_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'A valid daily visitor digest is required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.managed_sites AS site
    WHERE site.site_id = target_site_id
      AND site.is_trial
      AND public.is_managed_site_public(site.site_id)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.site_trial_daily_usage (site_id, visit_date)
  VALUES (target_site_id, visit_day)
  ON CONFLICT (site_id, visit_date) DO NOTHING;

  INSERT INTO public.site_trial_daily_visitors (site_id, visit_date, visitor_digest)
  VALUES (target_site_id, visit_day, target_visitor_digest)
  ON CONFLICT (site_id, visit_date, visitor_digest) DO NOTHING;
  visitor_added := FOUND;

  INSERT INTO public.site_trial_daily_usage (
    site_id, visit_date, page_views, unique_visitors, last_visit_at
  )
  VALUES (
    target_site_id, visit_day, 1, CASE WHEN visitor_added THEN 1 ELSE 0 END, now()
  )
  ON CONFLICT (site_id, visit_date) DO UPDATE SET
    page_views = public.site_trial_daily_usage.page_views + 1,
    unique_visitors = public.site_trial_daily_usage.unique_visitors
      + CASE WHEN visitor_added THEN 1 ELSE 0 END,
    last_visit_at = now();
END;
$function$;
REVOKE ALL ON FUNCTION public.record_public_site_view(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_site_view(text, text)
  TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view managed site profiles" ON public.site_profiles;
CREATE POLICY "Public can view managed site profiles"
  ON public.site_profiles FOR SELECT TO anon, authenticated
  USING (public.is_managed_site_public(site_id));

DROP POLICY IF EXISTS "Public can view managed site products" ON public.site_products;
CREATE POLICY "Public can view managed site products"
  ON public.site_products FOR SELECT TO anon, authenticated
  USING (public.is_managed_site_public(site_id));

DO $policies$
DECLARE
  site_record record;
  table_name text;
BEGIN
  FOR site_record IN
    SELECT DISTINCT profile_table, products_table
    FROM public.managed_sites
  LOOP
    FOREACH table_name IN ARRAY ARRAY[site_record.profile_table, site_record.products_table]
    LOOP
      IF to_regclass(format('public.%I', table_name)) IS NULL THEN
        CONTINUE;
      END IF;
      EXECUTE format('DROP POLICY IF EXISTS tenant_public_read ON public.%I', table_name);
      EXECUTE format(
        'CREATE POLICY tenant_public_read ON public.%I FOR SELECT TO anon, authenticated USING (public.is_managed_site_public(site_id))',
        table_name
      );
    END LOOP;
  END LOOP;
END;
$policies$;

CREATE OR REPLACE FUNCTION public.provision_managed_site(
  target_site_id text,
  target_name text,
  target_public_url text,
  target_client_email text,
  target_client_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  profile_table text;
  products_table text;
  table_suffix text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service-role access is required to provision a managed site.';
  END IF;
  IF target_site_id IS NULL
    OR length(target_site_id) > 40
    OR target_site_id !~ '^[a-z0-9][a-z0-9-]{1,39}$'
    OR target_site_id = 'main' THEN
    RAISE EXCEPTION 'Site IDs must contain 2-40 lowercase letters, numbers, or hyphens and cannot be main.';
  END IF;
  IF target_name IS NULL OR length(btrim(target_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Site names must contain between 1 and 120 characters.';
  END IF;
  IF target_public_url IS NULL OR target_public_url !~ '^https://' THEN
    RAISE EXCEPTION 'Managed site URLs must use HTTPS.';
  END IF;
  IF target_client_email IS NULL
    OR target_client_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR target_client_user_id IS NULL THEN
    RAISE EXCEPTION 'A valid assigned client account is required.';
  END IF;

  table_suffix := regexp_replace(target_site_id, '^calling-card-', '');
  table_suffix := replace(table_suffix, '-', '_');
  profile_table := 'calling_card_' || table_suffix || '_profiles';
  products_table := 'calling_card_' || table_suffix || '_products';

  INSERT INTO public.managed_sites (
    site_id, name, public_url, client_email, client_user_id,
    profile_table, products_table
  )
  VALUES (
    target_site_id, btrim(target_name), target_public_url,
    lower(btrim(target_client_email)), target_client_user_id,
    profile_table, products_table
  );

  EXECUTE format(
    'CREATE TABLE public.%I (LIKE public.site_profiles INCLUDING ALL)',
    profile_table
  );
  EXECUTE format(
    'CREATE TABLE public.%I (LIKE public.site_products INCLUDING ALL)',
    products_table
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT tenant_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE',
    profile_table
  );
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT tenant_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE',
    products_table
  );
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', profile_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', products_table);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', profile_table);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', products_table);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', profile_table);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', products_table);
  EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', profile_table);
  EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', products_table);
  EXECUTE format(
    'CREATE POLICY tenant_public_read ON public.%I FOR SELECT TO anon, authenticated USING (public.is_managed_site_public(site_id))',
    profile_table
  );
  EXECUTE format(
    'CREATE POLICY tenant_public_read ON public.%I FOR SELECT TO anon, authenticated USING (public.is_managed_site_public(site_id))',
    products_table
  );
  EXECUTE format(
    'INSERT INTO public.%I (site_id) VALUES ($1)',
    profile_table
  ) USING target_site_id;

  INSERT INTO public.site_admins (site_id, user_id)
  VALUES (target_site_id, target_client_user_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.provision_managed_site(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_managed_site(text, text, text, text, uuid)
  TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $jobs$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'pause-expired-prospect-trials',
      'prune-prospect-trial-visitors',
      'prune-prospect-trial-usage'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'pause-expired-prospect-trials',
    '*/15 * * * *',
    $command$
      UPDATE public.managed_sites
      SET is_active = false, updated_at = now()
      WHERE is_trial
        AND is_active
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at <= now();
    $command$
  );
  PERFORM cron.schedule(
    'prune-prospect-trial-visitors',
    '17 3 * * *',
    $command$
      DELETE FROM public.site_trial_daily_visitors
      WHERE visit_date < (now() AT TIME ZONE 'UTC')::date - 35;
    $command$
  );
  PERFORM cron.schedule(
    'prune-prospect-trial-usage',
    '23 3 * * *',
    $command$
      DELETE FROM public.site_trial_daily_usage
      WHERE visit_date < (now() AT TIME ZONE 'UTC')::date - 365;
    $command$
  );
END;
$jobs$;

COMMIT;
