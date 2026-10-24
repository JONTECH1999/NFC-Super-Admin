-- Shared multi-site data and super-admin access.
-- Run in the Supabase SQL Editor as the project owner after secure-client-auth.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.managed_sites (
  site_id text PRIMARY KEY CHECK (site_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text NOT NULL,
  public_url text NOT NULL DEFAULT '',
  client_email text NOT NULL DEFAULT '',
  client_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  client_enabled boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.managed_sites
  ADD COLUMN IF NOT EXISTS client_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.managed_sites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.managed_sites FROM anon, authenticated;
GRANT ALL ON public.managed_sites TO service_role;

CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.super_admins FROM anon, authenticated;
GRANT ALL ON public.super_admins TO service_role;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins AS super_admin
    WHERE super_admin.user_id = (SELECT auth.uid())
  );
$function$;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_site(target_site_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins AS super_admin
    WHERE super_admin.user_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1
    FROM public.site_admins AS site_admin
    JOIN public.managed_sites AS site
      ON site.site_id = site_admin.site_id
    WHERE site_admin.site_id = target_site_id
      AND site_admin.user_id = (SELECT auth.uid())
      AND site.is_active
      AND site.client_enabled
  );
$function$;
REVOKE ALL ON FUNCTION public.can_manage_site(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_site(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.site_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL UNIQUE REFERENCES public.managed_sites(site_id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  business text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  eyebrow text DEFAULT '',
  phone text DEFAULT '',
  phone_link text DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  address_link text DEFAULT '',
  facebook text DEFAULT '',
  youtube text DEFAULT '',
  description text DEFAULT '',
  profile_image_url text DEFAULT '',
  site_title text DEFAULT '',
  site_icon_url text DEFAULT '',
  theme_mode text DEFAULT 'dark',
  custom_qr_url text DEFAULT '',
  custom_links jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.site_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL REFERENCES public.managed_sites(site_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  price text DEFAULT '',
  image_url text DEFAULT '',
  alt text DEFAULT '',
  gallery jsonb DEFAULT '[]'::jsonb,
  is_featured boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_products_site_sort_idx
  ON public.site_products (site_id, sort_order);

ALTER TABLE public.calling_card_d1_profiles
  ADD COLUMN IF NOT EXISTS custom_qr_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_links jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_qr_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_links jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.calling_card_d1_products
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.site_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_profiles, public.site_products FROM anon, authenticated;
GRANT ALL ON public.site_profiles, public.site_products TO service_role;
GRANT SELECT ON public.site_profiles, public.site_products TO anon, authenticated;
GRANT UPDATE ON public.site_profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_products TO authenticated;
GRANT ALL ON public.site_admins TO service_role;

DROP POLICY IF EXISTS "Public can view managed site profiles" ON public.site_profiles;
CREATE POLICY "Public can view managed site profiles"
  ON public.site_profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Assigned clients can update their profile" ON public.site_profiles;
CREATE POLICY "Assigned clients can update their profile"
  ON public.site_profiles FOR UPDATE TO authenticated
  USING (public.can_manage_site(site_id))
  WITH CHECK (public.can_manage_site(site_id));

DROP POLICY IF EXISTS "Public can view managed site products" ON public.site_products;
CREATE POLICY "Public can view managed site products"
  ON public.site_products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Assigned clients can insert site products" ON public.site_products;
CREATE POLICY "Assigned clients can insert site products"
  ON public.site_products FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_site(site_id));
DROP POLICY IF EXISTS "Assigned clients can update site products" ON public.site_products;
CREATE POLICY "Assigned clients can update site products"
  ON public.site_products FOR UPDATE TO authenticated
  USING (public.can_manage_site(site_id))
  WITH CHECK (public.can_manage_site(site_id));
DROP POLICY IF EXISTS "Assigned clients can delete site products" ON public.site_products;
CREATE POLICY "Assigned clients can delete site products"
  ON public.site_products FOR DELETE TO authenticated
  USING (public.can_manage_site(site_id));

INSERT INTO public.managed_sites (site_id, name, public_url)
VALUES ('calling-card-d1', 'Calling Card D1', 'https://calling-card-d1.web.app')
ON CONFLICT (site_id) DO NOTHING;
INSERT INTO public.managed_sites (site_id, name, public_url)
VALUES ('main', 'Remo Contacts', 'https://remo-contacts.web.app')
ON CONFLICT (site_id) DO NOTHING;

UPDATE public.managed_sites AS site
SET client_user_id = assignment.user_id,
    client_email = auth_user.email
FROM public.site_admins AS assignment
JOIN auth.users AS auth_user ON auth_user.id = assignment.user_id
WHERE assignment.site_id = site.site_id
  AND site.client_user_id IS NULL;

INSERT INTO public.site_profiles (
  site_id, id, name, business, role, eyebrow, phone, phone_link, email, address,
  address_link, facebook, youtube, description, profile_image_url, site_title,
  site_icon_url, theme_mode, custom_qr_url, custom_links, created_at, updated_at
)
SELECT
  'calling-card-d1', id, name, business, role, eyebrow, phone, phone_link, email,
  address, address_link, facebook, youtube, description, profile_image_url,
  site_title, site_icon_url, theme_mode, custom_qr_url, custom_links, created_at, updated_at
FROM public.calling_card_d1_profiles
ON CONFLICT (site_id) DO NOTHING;

INSERT INTO public.site_profiles (
  site_id, id, name, business, role, eyebrow, phone, phone_link, email, address,
  address_link, facebook, youtube, description, profile_image_url, site_title,
  site_icon_url, theme_mode, custom_qr_url, custom_links, created_at, updated_at
)
SELECT
  'main', id, name, business, role, eyebrow, phone, phone_link, email,
  address, address_link, facebook, youtube, description, profile_image_url,
  site_title, site_icon_url, theme_mode, custom_qr_url, custom_links, created_at, updated_at
FROM public.profiles
ORDER BY created_at
LIMIT 1
ON CONFLICT (site_id) DO NOTHING;

INSERT INTO public.site_products (
  id, site_id, name, description, price, image_url, alt, gallery, is_featured,
  sort_order, created_at, updated_at
)
SELECT id, 'calling-card-d1', name, description, price, image_url, alt, gallery,
       is_featured, sort_order, created_at, updated_at
FROM public.calling_card_d1_products
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_products (
  id, site_id, name, description, price, image_url, alt, gallery, is_featured,
  sort_order, created_at, updated_at
)
SELECT id, 'main', name, description, price, image_url, alt, gallery,
       is_featured, sort_order, created_at, updated_at
FROM public.products
ON CONFLICT (id) DO NOTHING;

-- Replace the earlier fixed-table policies with tenant-aware rules.
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
REVOKE INSERT, UPDATE, DELETE ON public.calling_card_d1_profiles,
  public.calling_card_d1_products, public.profiles, public.products
  FROM anon, authenticated;

COMMIT;

-- Add your own account as super admin after running this migration:
-- INSERT INTO public.super_admins (user_id)
-- SELECT id FROM auth.users
-- WHERE lower(email) = lower('YOUR_EMAIL')
-- ON CONFLICT DO NOTHING;
