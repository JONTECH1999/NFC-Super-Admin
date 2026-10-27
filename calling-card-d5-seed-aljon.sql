-- Seed the empty D5 tables with Aljon Contacts data.
-- This migration refuses to overwrite any existing D5 profile or products.
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
    FROM public.managed_sites
    WHERE site_id = 'calling-card-d5'
      AND profile_table = 'calling_card_d5_profiles'
      AND products_table = 'calling_card_d5_products'
  ) THEN
    RAISE EXCEPTION 'D5 is missing or is not mapped to its expected tables.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.calling_card_aljon_contacts_profiles
    WHERE site_id = 'aljon-contacts'
  ) THEN
    RAISE EXCEPTION 'Aljon Contacts source profile is missing; no data was copied.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calling_card_d5_profiles
    WHERE site_id = 'calling-card-d5'
      AND (
        name <> ''
        OR business <> ''
        OR role <> ''
        OR eyebrow <> ''
        OR phone <> ''
        OR phone_link <> ''
        OR email <> ''
        OR address <> ''
        OR address_link <> ''
        OR facebook <> ''
        OR youtube <> ''
        OR description <> ''
        OR profile_image_url <> ''
        OR site_title <> ''
        OR site_icon_url <> ''
        OR custom_qr_url <> ''
        OR custom_links <> '[]'::jsonb
      )
  ) THEN
    RAISE EXCEPTION 'D5 already has profile data; refusing to overwrite it.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.calling_card_d5_products
    WHERE site_id = 'calling-card-d5'
  ) THEN
    RAISE EXCEPTION 'D5 already has products; refusing to overwrite them.';
  END IF;
END;
$validate$;

INSERT INTO public.calling_card_d5_profiles (
  site_id, id, name, business, role, eyebrow, phone, phone_link, email,
  address, address_link, facebook, youtube, description, profile_image_url,
  site_title, site_icon_url, theme_mode, custom_qr_url, custom_links,
  created_at, updated_at
)
SELECT
  'calling-card-d5', id, name, business, role, eyebrow, phone, phone_link, email,
  address, address_link, facebook, youtube, description, profile_image_url,
  site_title, site_icon_url, theme_mode, custom_qr_url, custom_links,
  now(), now()
FROM public.calling_card_aljon_contacts_profiles
WHERE site_id = 'aljon-contacts'
ON CONFLICT (site_id) DO UPDATE SET
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
  updated_at = now();

INSERT INTO public.calling_card_d5_products (
  id, site_id, name, description, price, image_url, alt, gallery,
  is_featured, sort_order, created_at, updated_at
)
SELECT
  product.id, 'calling-card-d5', product.name, product.description,
  product.price, product.image_url, product.alt, product.gallery,
  product.is_featured, product.sort_order, now(), now()
FROM public.calling_card_aljon_contacts_products AS product
WHERE product.site_id = 'aljon-contacts';

INSERT INTO public.site_admins (site_id, user_id)
SELECT 'calling-card-d5', source_admin.user_id
FROM public.site_admins AS source_admin
WHERE source_admin.site_id = 'aljon-contacts'
ON CONFLICT (site_id, user_id) DO NOTHING;

COMMIT;
