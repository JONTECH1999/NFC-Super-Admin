-- Create isolated profile and product tables for digital-callingcard01.
-- This seeds the new site once from Aljon Contacts; subsequent runs do not
-- overwrite the new site's content.
BEGIN;

DO $validate$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.managed_sites
    WHERE site_id = 'aljon-contacts'
      AND profile_table = 'calling_card_aljon_contacts_profiles'
      AND products_table = 'calling_card_aljon_contacts_products'
  ) THEN
    RAISE EXCEPTION 'Aljon Contacts is missing or is not mapped to its expected tables.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.calling_card_aljon_contacts_profiles
    WHERE site_id = 'aljon-contacts'
  ) THEN
    RAISE EXCEPTION 'Aljon Contacts source profile is missing; no data was copied.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.site_admins
    WHERE site_id = 'aljon-contacts'
  ) THEN
    RAISE EXCEPTION 'Aljon Contacts has no assigned client admins to grant access to the new site.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.managed_sites
    WHERE site_id = 'digital-callingcard01'
      AND (
        profile_table NOT IN ('site_profiles', 'calling_card_digital_callingcard01_profiles')
        OR products_table NOT IN ('site_products', 'calling_card_digital_callingcard01_products')
      )
  ) THEN
    RAISE EXCEPTION 'digital-callingcard01 is already mapped to unexpected tables.';
  END IF;
END;
$validate$;

CREATE TABLE IF NOT EXISTS public.calling_card_digital_callingcard01_profiles (
  LIKE public.site_profiles INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS public.calling_card_digital_callingcard01_products (
  LIKE public.site_products INCLUDING ALL
);

INSERT INTO public.managed_sites (
  site_id, name, public_url, client_email, client_user_id,
  profile_table, products_table
)
SELECT
  'digital-callingcard01',
  'Digital Calling Card 01',
  'https://digital-callingcard01.web.app',
  source.client_email,
  source.client_user_id,
  'calling_card_digital_callingcard01_profiles',
  'calling_card_digital_callingcard01_products'
FROM public.managed_sites AS source
WHERE source.site_id = 'aljon-contacts'
ON CONFLICT (site_id) DO UPDATE SET
  name = EXCLUDED.name,
  public_url = EXCLUDED.public_url,
  client_email = EXCLUDED.client_email,
  client_user_id = EXCLUDED.client_user_id,
  profile_table = EXCLUDED.profile_table,
  products_table = EXCLUDED.products_table,
  updated_at = now();

INSERT INTO public.site_admins (site_id, user_id)
SELECT 'digital-callingcard01', source_admin.user_id
FROM public.site_admins AS source_admin
WHERE source_admin.site_id = 'aljon-contacts'
ON CONFLICT (site_id, user_id) DO NOTHING;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_digital_callingcard01_profiles_site_id_fkey'
      AND conrelid = 'public.calling_card_digital_callingcard01_profiles'::regclass
  ) THEN
    ALTER TABLE public.calling_card_digital_callingcard01_profiles
      ADD CONSTRAINT calling_card_digital_callingcard01_profiles_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_digital_callingcard01_products_site_id_fkey'
      AND conrelid = 'public.calling_card_digital_callingcard01_products'::regclass
  ) THEN
    ALTER TABLE public.calling_card_digital_callingcard01_products
      ADD CONSTRAINT calling_card_digital_callingcard01_products_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id)
      ON DELETE CASCADE;
  END IF;
END;
$constraints$;

WITH seeded_profile AS (
  INSERT INTO public.calling_card_digital_callingcard01_profiles (
    site_id, id, name, business, role, eyebrow, phone, phone_link, email,
    address, address_link, facebook, youtube, description, profile_image_url,
    site_title, site_icon_url, theme_mode, custom_qr_url, custom_links,
    created_at, updated_at
  )
  SELECT
    'digital-callingcard01', id, name, business, role, eyebrow, phone, phone_link, email,
    address, address_link, facebook, youtube, description, profile_image_url,
    site_title, site_icon_url, theme_mode, custom_qr_url, custom_links,
    now(), now()
  FROM public.calling_card_aljon_contacts_profiles
  WHERE site_id = 'aljon-contacts'
  ON CONFLICT (site_id) DO NOTHING
  RETURNING site_id
)
INSERT INTO public.calling_card_digital_callingcard01_products (
  id, site_id, name, description, price, image_url, alt, gallery,
  is_featured, sort_order, created_at, updated_at
)
SELECT
  product.id, 'digital-callingcard01', product.name, product.description,
  product.price, product.image_url, product.alt, product.gallery,
  product.is_featured, product.sort_order, now(), now()
FROM public.calling_card_aljon_contacts_products AS product
WHERE product.site_id = 'aljon-contacts'
  AND EXISTS (SELECT 1 FROM seeded_profile)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS calling_card_digital_callingcard01_products_site_sort_idx
  ON public.calling_card_digital_callingcard01_products (site_id, sort_order);

ALTER TABLE public.calling_card_digital_callingcard01_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_card_digital_callingcard01_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calling_card_digital_callingcard01_profiles,
  public.calling_card_digital_callingcard01_products FROM anon, authenticated;
GRANT ALL ON public.calling_card_digital_callingcard01_profiles,
  public.calling_card_digital_callingcard01_products TO service_role;
GRANT SELECT ON public.calling_card_digital_callingcard01_profiles,
  public.calling_card_digital_callingcard01_products TO anon, authenticated;

DROP POLICY IF EXISTS tenant_public_read
  ON public.calling_card_digital_callingcard01_profiles;
CREATE POLICY tenant_public_read
  ON public.calling_card_digital_callingcard01_profiles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS tenant_public_read
  ON public.calling_card_digital_callingcard01_products;
CREATE POLICY tenant_public_read
  ON public.calling_card_digital_callingcard01_products
  FOR SELECT TO anon, authenticated USING (true);

COMMIT;
