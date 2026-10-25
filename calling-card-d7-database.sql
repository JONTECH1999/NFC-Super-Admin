-- Create dedicated profile and product tables for calling-card-d7.
-- Run after multi-site-super-admin.sql in the shared Supabase project.
BEGIN;

INSERT INTO public.managed_sites (site_id, name, public_url)
VALUES ('calling-card-d7', 'Calling Card D7', 'https://calling-card-d7.web.app')
ON CONFLICT (site_id) DO UPDATE
SET name = EXCLUDED.name,
    public_url = EXCLUDED.public_url,
    updated_at = now();

UPDATE public.managed_sites
SET profile_table = 'calling_card_d7_profiles',
    products_table = 'calling_card_d7_products'
WHERE site_id = 'calling-card-d7';

CREATE TABLE IF NOT EXISTS public.calling_card_d7_profiles (
  LIKE public.site_profiles INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS public.calling_card_d7_products (
  LIKE public.site_products INCLUDING ALL
);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d7_profiles_site_id_fkey'
      AND conrelid = 'public.calling_card_d7_profiles'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d7_profiles
      ADD CONSTRAINT calling_card_d7_profiles_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d7_products_site_id_fkey'
      AND conrelid = 'public.calling_card_d7_products'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d7_products
      ADD CONSTRAINT calling_card_d7_products_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS calling_card_d7_products_site_sort_idx
  ON public.calling_card_d7_products (site_id, sort_order);

ALTER TABLE public.calling_card_d7_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_card_d7_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calling_card_d7_profiles, public.calling_card_d7_products
  FROM anon, authenticated;
GRANT ALL ON public.calling_card_d7_profiles, public.calling_card_d7_products
  TO service_role;
GRANT SELECT ON public.calling_card_d7_profiles, public.calling_card_d7_products
  TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view calling card d7 profiles"
  ON public.calling_card_d7_profiles;
CREATE POLICY "Public can view calling card d7 profiles"
  ON public.calling_card_d7_profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can view calling card d7 products"
  ON public.calling_card_d7_products;
CREATE POLICY "Public can view calling card d7 products"
  ON public.calling_card_d7_products FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.calling_card_d7_profiles (site_id)
VALUES ('calling-card-d7')
ON CONFLICT (site_id) DO NOTHING;

COMMIT;
