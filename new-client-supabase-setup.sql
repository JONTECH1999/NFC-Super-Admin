-- ==============================================================================
-- COMPLETE SUPABASE SETUP SCRIPT FOR NEW CLIENT
-- Run this in your new client's Supabase project: SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create PROFILES table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  showcase_caption text DEFAULT '',
  custom_links jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create PRODUCTS table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 4. Set Access Policies: Public Read, Authenticated Write
-- Profiles Policies
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
CREATE POLICY "Public can view profiles" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can update profiles" ON public.profiles;
CREATE POLICY "Authenticated users can update profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can insert profiles" ON public.profiles;
CREATE POLICY "Authenticated users can insert profiles" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (true);

-- Products Policies
DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products" ON public.products
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
CREATE POLICY "Authenticated users can insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
CREATE POLICY "Authenticated users can update products" ON public.products
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
CREATE POLICY "Authenticated users can delete products" ON public.products
  FOR DELETE TO authenticated USING (true);

-- 5. Insert Initial Default Profile Row for Client
INSERT INTO public.profiles (
  name,
  business,
  role,
  eyebrow,
  phone,
  phone_link,
  email,
  address,
  address_link,
  facebook,
  youtube,
  description,
  profile_image_url,
  site_title,
  theme_mode,
  custom_links
) VALUES (
  'Client Name',
  'Client Business',
  'Business Owner',
  'Your Digital Growth Partner',
  '0912 345 6789',
  '+639123456789',
  'client@example.com',
  'Metro Manila, Philippines',
  '',
  'https://facebook.com',
  'https://youtube.com',
  'Welcome to our digital business card. Contact us for our services.',
  '/aljon-profile.jfif',
  'Client Business - Calling Card',
  'dark',
  '[]'::jsonb
) ON CONFLICT DO NOTHING;

-- 6. Setup Public Storage Bucket for Images
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies for Images Bucket
DROP POLICY IF EXISTS "Public can view images" ON storage.objects;
CREATE POLICY "Public can view images" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');

DROP POLICY IF EXISTS "Authenticated can upload images" ON storage.objects;
CREATE POLICY "Authenticated can upload images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'images');

DROP POLICY IF EXISTS "Authenticated can update images" ON storage.objects;
CREATE POLICY "Authenticated can update images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'images');

DROP POLICY IF EXISTS "Authenticated can delete images" ON storage.objects;
CREATE POLICY "Authenticated can delete images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'images');
