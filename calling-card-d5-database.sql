-- Create dedicated profile and product tables for calling-card-d5.
-- Run after multi-site-super-admin.sql in the shared Supabase project.
BEGIN;

INSERT INTO public.managed_sites (site_id, name, public_url)
VALUES ('calling-card-d5', 'Calling Card D5', 'https://calling-card-d5.web.app')
ON CONFLICT (site_id) DO UPDATE
SET name = EXCLUDED.name,
    public_url = EXCLUDED.public_url,
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.calling_card_d5_profiles (
  LIKE public.site_profiles INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS public.calling_card_d5_products (
  LIKE public.site_products INCLUDING ALL
);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d5_profiles_site_id_fkey'
      AND conrelid = 'public.calling_card_d5_profiles'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d5_profiles
      ADD CONSTRAINT calling_card_d5_profiles_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'calling_card_d5_products_site_id_fkey'
      AND conrelid = 'public.calling_card_d5_products'::regclass
  ) THEN
    ALTER TABLE public.calling_card_d5_products
      ADD CONSTRAINT calling_card_d5_products_site_id_fkey
      FOREIGN KEY (site_id) REFERENCES public.managed_sites(site_id) ON DELETE CASCADE;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS calling_card_d5_products_site_sort_idx
  ON public.calling_card_d5_products (site_id, sort_order);

ALTER TABLE public.calling_card_d5_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calling_card_d5_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calling_card_d5_profiles, public.calling_card_d5_products
  FROM anon, authenticated;
GRANT ALL ON public.calling_card_d5_profiles, public.calling_card_d5_products
  TO service_role;
GRANT SELECT ON public.calling_card_d5_profiles, public.calling_card_d5_products
  TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view calling card d5 profiles"
  ON public.calling_card_d5_profiles;
CREATE POLICY "Public can view calling card d5 profiles"
  ON public.calling_card_d5_profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can view calling card d5 products"
  ON public.calling_card_d5_products;
CREATE POLICY "Public can view calling card d5 products"
  ON public.calling_card_d5_products FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.calling_card_d5_profiles (site_id)
VALUES ('calling-card-d5')
ON CONFLICT (site_id) DO NOTHING;

COMMIT;
