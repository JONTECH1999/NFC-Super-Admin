-- Move Calling Card D1 onto its own registered profile and product tables.
-- Run after multi-site-super-admin.sql; this preserves the shared-table data
-- until it has been copied and mapped successfully.
BEGIN;

ALTER TABLE public.calling_card_d1_profiles
  ADD COLUMN IF NOT EXISTS site_id text;
ALTER TABLE public.calling_card_d1_profiles
  ADD COLUMN IF NOT EXISTS custom_qr_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS custom_links jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE public.calling_card_d1_profiles
SET site_id = 'calling-card-d1'
WHERE site_id IS NULL;
ALTER TABLE public.calling_card_d1_profiles
  ALTER COLUMN site_id SET NOT NULL;

ALTER TABLE public.calling_card_d1_products
  ADD COLUMN IF NOT EXISTS site_id text;
ALTER TABLE public.calling_card_d1_products
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE public.calling_card_d1_products
SET site_id = 'calling-card-d1'
WHERE site_id IS NULL;
ALTER TABLE public.calling_card_d1_products
  ALTER COLUMN site_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS calling_card_d1_profiles_site_id_key
  ON public.calling_card_d1_profiles (site_id);
CREATE INDEX IF NOT EXISTS calling_card_d1_products_site_sort_idx
  ON public.calling_card_d1_products (site_id, sort_order);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d1_profiles_site_id_fkey'
      AND conrelid = 'public.calling_card_d1_profiles'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d1_profiles
      ADD CONSTRAINT calling_card_d1_profiles_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d1_products_site_id_fkey'
      AND conrelid = 'public.calling_card_d1_products'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d1_products
      ADD CONSTRAINT calling_card_d1_products_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id)
      ON DELETE CASCADE;
  END IF;
END;
$constraints$;

DO $cutover$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.managed_sites
    WHERE site_id = 'calling-card-d1'
      AND profile_table = 'site_profiles'
      AND products_table = 'site_products'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.site_profiles
      WHERE site_id = 'calling-card-d1'
    ) THEN
      RAISE EXCEPTION 'Calling Card D1 source profile is missing from site_profiles; no cutover was performed.';
    END IF;

    INSERT INTO public.calling_card_d1_profiles (
      site_id, id, name, business, role, eyebrow, phone, phone_link, email,
      address, address_link, facebook, youtube, description, profile_image_url,
      site_title, site_icon_url, theme_mode, custom_qr_url, custom_links,
      created_at, updated_at
    )
    SELECT
      site_id, id, name, business, role, eyebrow, phone, phone_link, email,
      address, address_link, facebook, youtube, description, profile_image_url,
      site_title, site_icon_url, theme_mode, custom_qr_url, custom_links,
      created_at, updated_at
    FROM public.site_profiles
    WHERE site_id = 'calling-card-d1'
    ON CONFLICT (site_id) DO UPDATE SET
      id = EXCLUDED.id,
      name = EXCLUDED.name,
      business = EXCLUDED.business,
      role = EXCLUDED.role,
      eyebrow = EXCLUDED.eyebrow,
      phone = EXCLUDED.phone,
      phone_link = EXCLUDED.phone_link,
      email = EXCLUDED.email,
      address = EXCLUDED.address,
      address_link = EXCLUDED.address_link,
      facebook = EXCLUDED.facebook,
      youtube = EXCLUDED.youtube,
      description = EXCLUDED.description,
      profile_image_url = EXCLUDED.profile_image_url,
      site_title = EXCLUDED.site_title,
      site_icon_url = EXCLUDED.site_icon_url,
      theme_mode = EXCLUDED.theme_mode,
      custom_qr_url = EXCLUDED.custom_qr_url,
      custom_links = EXCLUDED.custom_links,
      updated_at = EXCLUDED.updated_at;

    DELETE FROM public.calling_card_d1_products
    WHERE site_id = 'calling-card-d1';
    INSERT INTO public.calling_card_d1_products (
      id, site_id, name, description, price, image_url, alt, gallery,
      is_featured, sort_order, created_at, updated_at
    )
    SELECT
      id, site_id, name, description, price, image_url, alt, gallery,
      is_featured, sort_order, created_at, updated_at
    FROM public.site_products
    WHERE site_id = 'calling-card-d1';

    UPDATE public.managed_sites
    SET profile_table = 'calling_card_d1_profiles',
        products_table = 'calling_card_d1_products',
        updated_at = now()
    WHERE site_id = 'calling-card-d1';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.managed_sites
    WHERE site_id = 'calling-card-d1'
      AND profile_table = 'calling_card_d1_profiles'
      AND products_table = 'calling_card_d1_products'
  ) THEN
    RAISE EXCEPTION 'Calling Card D1 is missing or has an unexpected table mapping.';
  END IF;
END;
$cutover$;

ALTER TABLE public.calling_card_d1_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_card_d1_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calling_card_d1_profiles, public.calling_card_d1_products
  FROM anon, authenticated;
GRANT ALL ON public.calling_card_d1_profiles, public.calling_card_d1_products
  TO service_role;
GRANT SELECT ON public.calling_card_d1_profiles, public.calling_card_d1_products
  TO anon, authenticated;

DO $policies$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('calling_card_d1_profiles', 'calling_card_d1_products')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      existing_policy.policyname,
      existing_policy.tablename
    );
  END LOOP;
END;
$policies$;

DROP POLICY IF EXISTS tenant_public_read ON public.calling_card_d1_profiles;
CREATE POLICY tenant_public_read
  ON public.calling_card_d1_profiles
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tenant_public_read ON public.calling_card_d1_products;
CREATE POLICY tenant_public_read
  ON public.calling_card_d1_products
  FOR SELECT TO anon, authenticated USING (true);

COMMIT;
