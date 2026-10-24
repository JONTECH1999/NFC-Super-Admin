-- Secure client access for the calling-card-d1 site.
-- Run in the shared Supabase project's SQL Editor as project owner.
-- Client accounts must already exist in Supabase Auth before assigning them below.
BEGIN;

CREATE TABLE IF NOT EXISTS public.site_admins (
  site_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, user_id)
);

ALTER TABLE public.site_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_admins FROM anon, authenticated;

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
    WHERE site_admin.site_id = target_site_id
      AND site_admin.user_id = (SELECT auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_site(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_site(text) TO authenticated;

ALTER TABLE public.calling_card_d1_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_card_d1_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Remove every previous mutating policy on these tables so an older
-- permissive policy cannot override the new restrictions.
DO $policies$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'calling_card_d1_profiles',
        'calling_card_d1_products',
        'profiles',
        'products'
      )
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  END LOOP;
END;
$policies$;

DROP POLICY IF EXISTS "Authenticated users can update calling card d1 profile"
  ON public.calling_card_d1_profiles;
DROP POLICY IF EXISTS "Authenticated users can insert calling card d1 profile"
  ON public.calling_card_d1_profiles;
DROP POLICY IF EXISTS "Site admins can update calling card d1 profile"
  ON public.calling_card_d1_profiles;
CREATE POLICY "Site admins can update calling card d1 profile"
  ON public.calling_card_d1_profiles
  FOR UPDATE TO authenticated
  USING (public.can_manage_site('calling-card-d1'))
  WITH CHECK (public.can_manage_site('calling-card-d1'));

DROP POLICY IF EXISTS "Authenticated users can insert calling card d1 products"
  ON public.calling_card_d1_products;
DROP POLICY IF EXISTS "Authenticated users can update calling card d1 products"
  ON public.calling_card_d1_products;
DROP POLICY IF EXISTS "Authenticated users can delete calling card d1 products"
  ON public.calling_card_d1_products;
DROP POLICY IF EXISTS "Site admins can insert calling card d1 products"
  ON public.calling_card_d1_products;
DROP POLICY IF EXISTS "Site admins can update calling card d1 products"
  ON public.calling_card_d1_products;
DROP POLICY IF EXISTS "Site admins can delete calling card d1 products"
  ON public.calling_card_d1_products;
CREATE POLICY "Site admins can insert calling card d1 products"
  ON public.calling_card_d1_products
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_site('calling-card-d1'));
CREATE POLICY "Site admins can update calling card d1 products"
  ON public.calling_card_d1_products
  FOR UPDATE TO authenticated
  USING (public.can_manage_site('calling-card-d1'))
  WITH CHECK (public.can_manage_site('calling-card-d1'));
CREATE POLICY "Site admins can delete calling card d1 products"
  ON public.calling_card_d1_products
  FOR DELETE TO authenticated
  USING (public.can_manage_site('calling-card-d1'));

DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
CREATE POLICY "Public can view profiles"
  ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products"
  ON public.products FOR SELECT USING (true);

CREATE POLICY "Site admins can update main profile"
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.can_manage_site('main'))
  WITH CHECK (public.can_manage_site('main'));
CREATE POLICY "Site admins can insert main products"
  ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_site('main'));
CREATE POLICY "Site admins can update main products"
  ON public.products
  FOR UPDATE TO authenticated
  USING (public.can_manage_site('main'))
  WITH CHECK (public.can_manage_site('main'));
CREATE POLICY "Site admins can delete main products"
  ON public.products
  FOR DELETE TO authenticated
  USING (public.can_manage_site('main'));

GRANT SELECT ON public.calling_card_d1_profiles,
                public.calling_card_d1_products TO anon, authenticated;
GRANT SELECT ON public.profiles, public.products TO anon, authenticated;
GRANT UPDATE ON public.calling_card_d1_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.calling_card_d1_products TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.calling_card_d1_profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.calling_card_d1_products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;

-- Storage paths start with the site id, e.g. calling-card-d1/profile/photo.jpg.
DO $storage_policies$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (
        lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%images%'
        OR lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%bucket_id%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  END LOOP;
END;
$storage_policies$;

DROP POLICY IF EXISTS "Site admins can upload site images" ON storage.objects;
DROP POLICY IF EXISTS "Site admins can update site images" ON storage.objects;
DROP POLICY IF EXISTS "Site admins can delete site images" ON storage.objects;
CREATE POLICY "Site admins can upload site images"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND public.can_manage_site((storage.foldername(name))[1])
  );
CREATE POLICY "Site admins can update site images"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'images'
    AND public.can_manage_site((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'images'
    AND public.can_manage_site((storage.foldername(name))[1])
  );
CREATE POLICY "Site admins can delete site images"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'images'
    AND public.can_manage_site((storage.foldername(name))[1])
  );

COMMIT;

-- If the existing owner needs to keep editing public.profiles/public.products,
-- assign their existing Auth account to the main site:
-- INSERT INTO public.site_admins (site_id, user_id)
-- SELECT 'main', id
-- FROM auth.users
-- WHERE lower(email) = lower('OWNER_EMAIL')
-- ON CONFLICT DO NOTHING;
--
-- After inviting the client in Authentication > Users, assign their account:
-- INSERT INTO public.site_admins (site_id, user_id)
-- SELECT 'calling-card-d1', id
-- FROM auth.users
-- WHERE lower(email) = lower('CLIENT_EMAIL')
-- ON CONFLICT DO NOTHING;
