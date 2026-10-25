-- Create dedicated profile and product tables for calling-card-d3.
-- Run after multi-site-super-admin.sql in the shared Supabase project.
BEGIN;

INSERT INTO public.managed_sites (site_id, name, public_url)
VALUES ('calling-card-d3', 'Calling Card D3', 'https://calling-card-d3.web.app')
ON CONFLICT (site_id) DO UPDATE
SET name = EXCLUDED.name,
    public_url = EXCLUDED.public_url,
    updated_at = now();

UPDATE public.managed_sites
SET profile_table = 'calling_card_d3_profiles',
    products_table = 'calling_card_d3_products'
WHERE site_id = 'calling-card-d3';

CREATE TABLE IF NOT EXISTS public.calling_card_d3_profiles (
  LIKE public.site_profiles INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS public.calling_card_d3_products (
  LIKE public.site_products INCLUDING ALL
);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d3_profiles_site_id_fkey'
      AND conrelid = 'public.calling_card_d3_profiles'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d3_profiles
      ADD CONSTRAINT calling_card_d3_profiles_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d3_products_site_id_fkey'
      AND conrelid = 'public.calling_card_d3_products'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d3_products
      ADD CONSTRAINT calling_card_d3_products_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS calling_card_d3_products_site_sort_idx
  ON public.calling_card_d3_products (site_id, sort_order);

ALTER TABLE public.calling_card_d3_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_card_d3_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calling_card_d3_profiles, public.calling_card_d3_products
  FROM anon, authenticated;
GRANT ALL ON public.calling_card_d3_profiles, public.calling_card_d3_products
  TO service_role;
GRANT SELECT ON public.calling_card_d3_profiles, public.calling_card_d3_products
  TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view calling card d3 profiles"
  ON public.calling_card_d3_profiles;
CREATE POLICY "Public can view calling card d3 profiles"
  ON public.calling_card_d3_profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can view calling card d3 products"
  ON public.calling_card_d3_products;
CREATE POLICY "Public can view calling card d3 products"
  ON public.calling_card_d3_products FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.calling_card_d3_profiles (site_id)
VALUES ('calling-card-d3')
ON CONFLICT (site_id) DO NOTHING;

COMMIT;
