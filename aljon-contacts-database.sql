-- Move Aljon Contacts onto its own registered profile and product tables.
-- Run after multi-site-super-admin.sql. Shared-table rows are retained.
BEGIN;

CREATE TABLE IF NOT EXISTS public.calling_card_aljon_contacts_profiles (
  LIKE public.site_profiles INCLUDING ALL
);
CREATE TABLE IF NOT EXISTS public.calling_card_aljon_contacts_products (
  LIKE public.site_products INCLUDING ALL
);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_aljon_contacts_profiles_site_id_fkey'
      AND conrelid = 'public.calling_card_aljon_contacts_profiles'::regclass
  ) THEN
    ALTER TABLE public.calling_card_aljon_contacts_profiles
      ADD CONSTRAINT calling_card_aljon_contacts_profiles_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_aljon_contacts_products_site_id_fkey'
      AND conrelid = 'public.calling_card_aljon_contacts_products'::regclass
  ) THEN
    ALTER TABLE public.calling_card_aljon_contacts_products
      ADD CONSTRAINT calling_card_aljon_contacts_products_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id)
      ON DELETE CASCADE;
  END IF;
END;
$constraints$;

DO $cutover$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.managed_sites
    WHERE site_id = 'aljon-contacts'
      AND profile_table = 'site_profiles'
      AND products_table = 'site_products'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.site_profiles
      WHERE site_id = 'aljon-contacts'
    ) THEN
      RAISE EXCEPTION 'Aljon Contacts source profile is missing from site_profiles; no cutover was performed.';
    END IF;

    INSERT INTO public.calling_card_aljon_contacts_profiles (
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
    WHERE site_id = 'aljon-contacts'
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

    DELETE FROM public.calling_card_aljon_contacts_products
    WHERE site_id = 'aljon-contacts';
    INSERT INTO public.calling_card_aljon_contacts_products (
      id, site_id, name, description, price, image_url, alt, gallery,
      is_featured, sort_order, created_at, updated_at
    )
    SELECT
      id, site_id, name, description, price, image_url, alt, gallery,
      is_featured, sort_order, created_at, updated_at
    FROM public.site_products
    WHERE site_id = 'aljon-contacts';

    UPDATE public.managed_sites
    SET profile_table = 'calling_card_aljon_contacts_profiles',
        products_table = 'calling_card_aljon_contacts_products',
        updated_at = now()
    WHERE site_id = 'aljon-contacts';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.managed_sites
    WHERE site_id = 'aljon-contacts'
      AND profile_table = 'calling_card_aljon_contacts_profiles'
      AND products_table = 'calling_card_aljon_contacts_products'
  ) THEN
    RAISE EXCEPTION 'Aljon Contacts is missing or has an unexpected table mapping.';
  END IF;
END;
$cutover$;

CREATE INDEX IF NOT EXISTS calling_card_aljon_contacts_products_site_sort_idx
  ON public.calling_card_aljon_contacts_products (site_id, sort_order);
ALTER TABLE public.calling_card_aljon_contacts_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_card_aljon_contacts_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calling_card_aljon_contacts_profiles, public.calling_card_aljon_contacts_products
  FROM anon, authenticated;
GRANT ALL ON public.calling_card_aljon_contacts_profiles, public.calling_card_aljon_contacts_products
  TO service_role;
GRANT SELECT ON public.calling_card_aljon_contacts_profiles, public.calling_card_aljon_contacts_products
  TO anon, authenticated;

DROP POLICY IF EXISTS tenant_public_read ON public.calling_card_aljon_contacts_profiles;
CREATE POLICY tenant_public_read
  ON public.calling_card_aljon_contacts_profiles
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS tenant_public_read ON public.calling_card_aljon_contacts_products;
CREATE POLICY tenant_public_read
  ON public.calling_card_aljon_contacts_products
  FOR SELECT TO anon, authenticated USING (true);

COMMIT;
