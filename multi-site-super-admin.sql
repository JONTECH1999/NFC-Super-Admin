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
ALTER TABLE public.managed_sites
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'none'
  CHECK (payment_status IN ('none', 'awaiting_payment', 'paid'));
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
    SELECT 1
    FROM public.site_admins AS site_admin
    JOIN public.managed_sites AS site
      ON site.site_id = site_admin.site_id
    WHERE site_admin.site_id = target_site_id
      AND site_admin.user_id = (SELECT auth.uid())
      AND site.is_active
      AND site.client_enabled
  ) OR (
    SELECT public.is_super_admin()
  );
$function$;
REVOKE ALL ON FUNCTION public.can_manage_site(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_site(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_managed_sites()
RETURNS TABLE (site_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT site.site_id, site.name
  FROM public.site_admins AS site_admin
  JOIN public.managed_sites AS site ON site.site_id = site_admin.site_id
  WHERE (
      site_admin.user_id = (SELECT auth.uid())
      AND site.is_active
      AND site.client_enabled
    )
    OR public.is_super_admin()
  ORDER BY site.name;
$function$;
REVOKE ALL ON FUNCTION public.get_my_managed_sites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_managed_sites() TO authenticated;

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
REVOKE INSERT, UPDATE, DELETE ON public.site_profiles, public.site_products FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.site_admins TO service_role;

DROP POLICY IF EXISTS "Public can view managed site profiles" ON public.site_profiles;
CREATE POLICY "Public can view managed site profiles"
  ON public.site_profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Assigned clients can update their profile" ON public.site_profiles;
DROP POLICY IF EXISTS "Clients can submit profile changes for approval" ON public.site_profiles;

DROP POLICY IF EXISTS "Public can view managed site products" ON public.site_products;
CREATE POLICY "Public can view managed site products"
  ON public.site_products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Assigned clients can insert site products" ON public.site_products;
DROP POLICY IF EXISTS "Assigned clients can update site products" ON public.site_products;
DROP POLICY IF EXISTS "Assigned clients can delete site products" ON public.site_products;

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

CREATE TABLE IF NOT EXISTS public.site_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL REFERENCES public.managed_sites(site_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_email text NOT NULL DEFAULT '',
  request_type text NOT NULL DEFAULT 'profile',
  fields jsonb NOT NULL CHECK (
    jsonb_typeof(fields) = 'object'
    AND fields <> '{}'::jsonb
    AND fields - ARRAY[
      'name', 'business', 'role', 'phone', 'email', 'address',
      'facebook', 'youtube', 'description', 'eyebrow', 'phone_link',
      'address_link', 'profile_image_url', 'site_title', 'site_icon_url',
      'theme_mode', 'custom_qr_url', 'custom_links', 'products'
    ] = '{}'::jsonb
  ),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  rejection_reason text NOT NULL DEFAULT '' CHECK (length(rejection_reason) <= 2000),
  review_decisions jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_status text NOT NULL DEFAULT 'not_required',
  email_error text NOT NULL DEFAULT '' CHECK (length(email_error) <= 2000)
);
ALTER TABLE public.site_edit_requests
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'profile',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS review_decisions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS email_error text NOT NULL DEFAULT '';
ALTER TABLE public.site_edit_requests
  DROP CONSTRAINT IF EXISTS site_edit_requests_fields_check,
  ADD CONSTRAINT site_edit_requests_fields_check CHECK (
    jsonb_typeof(fields) = 'object'
    AND fields <> '{}'::jsonb
    AND fields - ARRAY[
      'name', 'business', 'role', 'phone', 'email', 'address',
      'facebook', 'youtube', 'description', 'eyebrow', 'phone_link',
      'address_link', 'profile_image_url', 'site_title', 'site_icon_url',
      'theme_mode', 'custom_qr_url', 'custom_links', 'products'
    ] = '{}'::jsonb
  ),
  DROP CONSTRAINT IF EXISTS site_edit_requests_status_check,
  ADD CONSTRAINT site_edit_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  DROP CONSTRAINT IF EXISTS site_edit_requests_request_type_check,
  ADD CONSTRAINT site_edit_requests_request_type_check
    CHECK (request_type IN ('profile', 'products')),
  DROP CONSTRAINT IF EXISTS site_edit_requests_payload_check,
  ADD CONSTRAINT site_edit_requests_payload_check CHECK (
    octet_length(payload::text) <= 524288
    AND CASE
      WHEN request_type = 'profile' THEN
        jsonb_typeof(payload) = 'object'
        AND payload - ARRAY[
          'name', 'business', 'role', 'phone', 'email', 'address',
          'facebook', 'youtube', 'description', 'eyebrow', 'phone_link',
          'address_link', 'profile_image_url', 'site_title', 'site_icon_url',
          'theme_mode', 'custom_qr_url', 'custom_links'
        ] = '{}'::jsonb
      WHEN request_type = 'products' AND jsonb_typeof(payload) = 'array' THEN
        jsonb_array_length(payload) <= 100
      ELSE false
    END
  ),
  DROP CONSTRAINT IF EXISTS site_edit_requests_review_decisions_check,
  ADD CONSTRAINT site_edit_requests_review_decisions_check
    CHECK (jsonb_typeof(review_decisions) = 'object'),
  DROP CONSTRAINT IF EXISTS site_edit_requests_email_status_check,
  ADD CONSTRAINT site_edit_requests_email_status_check
    CHECK (email_status IN ('not_required', 'pending', 'sending', 'sent', 'failed'));
CREATE INDEX IF NOT EXISTS site_edit_requests_status_created_idx
  ON public.site_edit_requests (status, created_at DESC);
ALTER TABLE public.site_edit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_edit_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.site_edit_requests TO authenticated;
GRANT ALL ON public.site_edit_requests TO service_role;
DROP POLICY IF EXISTS "Clients can view their own edit requests" ON public.site_edit_requests;
CREATE POLICY "Clients can view their own edit requests"
  ON public.site_edit_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Assigned clients can submit edit requests" ON public.site_edit_requests;
CREATE POLICY "Assigned clients can submit edit requests"
  ON public.site_edit_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND lower(client_email) = lower((SELECT auth.jwt() ->> 'email'))
    AND (
      EXISTS (
        SELECT 1
        FROM public.get_my_managed_sites() AS assigned_site
        WHERE assigned_site.site_id = site_edit_requests.site_id
      )
      OR public.is_super_admin()
    )
  );

CREATE OR REPLACE FUNCTION public.get_pending_site_request_summary()
RETURNS TABLE (
  site_id text,
  pending_request_count bigint,
  oldest_pending_request_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT request.site_id, count(*), min(request.created_at)
  FROM public.site_edit_requests AS request
  WHERE request.status = 'pending'
  GROUP BY request.site_id;
$function$;
REVOKE ALL ON FUNCTION public.get_pending_site_request_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_site_request_summary() TO service_role;

CREATE TABLE IF NOT EXISTS public.super_admin_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text REFERENCES public.managed_sites(site_id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS super_admin_activity_created_idx
  ON public.super_admin_activity (created_at DESC);
ALTER TABLE public.super_admin_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.super_admin_activity FROM anon, authenticated;
GRANT ALL ON public.super_admin_activity TO service_role;

CREATE TABLE IF NOT EXISTS public.site_content_drafts (
  site_id text PRIMARY KEY REFERENCES public.managed_sites(site_id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
  products jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(products) = 'array'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
ALTER TABLE public.site_content_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_content_drafts FROM anon, authenticated;
GRANT ALL ON public.site_content_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.publish_site_content_draft(
  target_site_id text,
  actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  draft public.site_content_drafts%ROWTYPE;
  profile_table text;
  products_table text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins AS admin
    WHERE admin.user_id = actor_user_id
  ) THEN
    RAISE EXCEPTION 'Super-admin access is required to publish site content.';
  END IF;

  PERFORM 1
  FROM public.managed_sites AS site
  WHERE site.site_id = target_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Site not found.';
  END IF;

  SELECT content_draft.*
  INTO draft
  FROM public.site_content_drafts AS content_draft
  WHERE content_draft.site_id = target_site_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save a draft before publishing.';
  END IF;

  profile_table := CASE
    WHEN target_site_id = 'calling-card-d2' THEN 'calling_card_d2_profiles'
    WHEN target_site_id = 'calling-card-d3' THEN 'calling_card_d3_profiles'
    WHEN target_site_id = 'calling-card-d4' THEN 'calling_card_d4_profiles'
    WHEN target_site_id = 'calling-card-d5' THEN 'calling_card_d5_profiles'
    WHEN target_site_id = 'calling-card-d6' THEN 'calling_card_d6_profiles'
    WHEN target_site_id = 'calling-card-d7' THEN 'calling_card_d7_profiles'
    WHEN target_site_id = 'calling-card-d8' THEN 'calling_card_d8_profiles'
    WHEN target_site_id = 'calling-card-d9' THEN 'calling_card_d9_profiles'
    WHEN target_site_id = 'calling-card-d10' THEN 'calling_card_d10_profiles'
    ELSE 'site_profiles'
  END;
  products_table := CASE
    WHEN target_site_id = 'calling-card-d2' THEN 'calling_card_d2_products'
    WHEN target_site_id = 'calling-card-d3' THEN 'calling_card_d3_products'
    WHEN target_site_id = 'calling-card-d4' THEN 'calling_card_d4_products'
    WHEN target_site_id = 'calling-card-d5' THEN 'calling_card_d5_products'
    WHEN target_site_id = 'calling-card-d6' THEN 'calling_card_d6_products'
    WHEN target_site_id = 'calling-card-d7' THEN 'calling_card_d7_products'
    WHEN target_site_id = 'calling-card-d8' THEN 'calling_card_d8_products'
    WHEN target_site_id = 'calling-card-d9' THEN 'calling_card_d9_products'
    WHEN target_site_id = 'calling-card-d10' THEN 'calling_card_d10_products'
    ELSE 'site_products'
  END;

  EXECUTE format($query$
    INSERT INTO public.%I (
      site_id, id, name, business, role, eyebrow, phone, phone_link, email,
      address, address_link, facebook, youtube, description, profile_image_url,
      site_title, site_icon_url, theme_mode, custom_qr_url, custom_links, updated_at
    )
    VALUES (
      $1,
      coalesce(nullif($2->>'id', '')::uuid, gen_random_uuid()),
      coalesce($2->>'name', ''),
      coalesce($2->>'business', ''),
      coalesce($2->>'role', ''),
      coalesce($2->>'eyebrow', ''),
      coalesce($2->>'phone', ''),
      coalesce($2->>'phone_link', ''),
      coalesce($2->>'email', ''),
      coalesce($2->>'address', ''),
      coalesce($2->>'address_link', ''),
      coalesce($2->>'facebook', ''),
      coalesce($2->>'youtube', ''),
      coalesce($2->>'description', ''),
      coalesce($2->>'profile_image_url', ''),
      coalesce($2->>'site_title', ''),
      coalesce($2->>'site_icon_url', ''),
      coalesce($2->>'theme_mode', 'dark'),
      coalesce($2->>'custom_qr_url', ''),
      coalesce($2->'custom_links', '[]'::jsonb),
      now()
    )
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
      updated_at = now()
  $query$, profile_table)
  USING target_site_id, draft.profile;

  EXECUTE format('DELETE FROM public.%I WHERE site_id = $1', products_table)
  USING target_site_id;

  EXECUTE format($query$
    INSERT INTO public.%I (
      id, site_id, name, description, price, image_url, alt, gallery,
      is_featured, sort_order, created_at, updated_at
    )
    SELECT
      coalesce(product.id, gen_random_uuid()),
      $1,
      product.name,
      coalesce(product.description, ''),
      coalesce(product.price, ''),
      coalesce(product.image_url, ''),
      coalesce(product.alt, ''),
      coalesce(product.gallery, '[]'::jsonb),
      coalesce(product.is_featured, true),
      coalesce(product.sort_order, item.ord::integer - 1),
      now(),
      now()
    FROM jsonb_array_elements($2) WITH ORDINALITY AS item(value, ord)
    CROSS JOIN LATERAL jsonb_to_record(item.value) AS product(
      id uuid,
      name text,
      description text,
      price text,
      image_url text,
      alt text,
      gallery jsonb,
      is_featured boolean,
      sort_order integer
    )
  $query$, products_table)
  USING target_site_id, draft.products;

  UPDATE public.site_content_drafts
  SET published_at = now()
  WHERE site_id = target_site_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.publish_site_content_draft(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_site_content_draft(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_site_edit_request(
  target_request_id uuid,
  actor_user_id uuid,
  next_profile jsonb,
  next_products jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_site_id text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins AS admin
    WHERE admin.user_id = actor_user_id
  ) THEN
    RAISE EXCEPTION 'Super-admin access is required to approve edit requests.';
  END IF;

  SELECT request.site_id
  INTO request_site_id
  FROM public.site_edit_requests AS request
  WHERE request.id = target_request_id
    AND request.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This edit request is no longer pending.';
  END IF;

  INSERT INTO public.site_content_drafts (
    site_id, profile, products, updated_by, updated_at, published_at
  )
  VALUES (
    request_site_id, next_profile, next_products, actor_user_id, now(), NULL
  )
  ON CONFLICT (site_id) DO UPDATE SET
    profile = EXCLUDED.profile,
    products = EXCLUDED.products,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at,
    published_at = NULL;

  UPDATE public.site_edit_requests
  SET status = 'approved',
      reviewed_at = now(),
      rejection_reason = ''
  WHERE id = target_request_id
    AND status = 'pending';
END;
$function$;
REVOKE ALL ON FUNCTION public.approve_site_edit_request(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_site_edit_request(uuid, uuid, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.review_site_edit_request(
  target_request_id uuid,
  actor_user_id uuid,
  next_profile jsonb,
  next_products jsonb,
  decisions jsonb,
  save_content_draft boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_site_id text;
  final_status text;
  has_rejections boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.super_admins AS admin
    WHERE admin.user_id = actor_user_id
  ) THEN
    RAISE EXCEPTION 'Super-admin access is required to review edit requests.';
  END IF;
  IF jsonb_typeof(decisions) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Review decisions must be an object.';
  END IF;

  SELECT request.site_id
  INTO request_site_id
  FROM public.site_edit_requests AS request
  WHERE request.id = target_request_id
    AND request.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This edit request is no longer pending.';
  END IF;

  has_rejections := EXISTS (
    SELECT 1
    FROM jsonb_each(decisions) AS item(path, decision)
    WHERE item.decision->>'decision' = 'reject'
  );
  final_status := CASE WHEN save_content_draft THEN 'approved' ELSE 'rejected' END;

  IF save_content_draft THEN
    INSERT INTO public.site_content_drafts (
      site_id, profile, products, updated_by, updated_at, published_at
    )
    VALUES (
      request_site_id, next_profile, next_products, actor_user_id, now(), NULL
    )
    ON CONFLICT (site_id) DO UPDATE SET
      profile = EXCLUDED.profile,
      products = EXCLUDED.products,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at,
      published_at = NULL;
  END IF;

  UPDATE public.site_edit_requests
  SET status = final_status,
      reviewed_at = now(),
      rejection_reason = '',
      review_decisions = decisions,
      email_status = CASE WHEN has_rejections THEN 'pending' ELSE 'not_required' END,
      email_error = ''
  WHERE id = target_request_id
    AND status = 'pending';
  RETURN final_status;
END;
$function$;
REVOKE ALL ON FUNCTION public.review_site_edit_request(uuid, uuid, jsonb, jsonb, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_site_edit_request(uuid, uuid, jsonb, jsonb, jsonb, boolean) TO service_role;

COMMIT;

-- Add your own account as super admin after running this migration:
-- INSERT INTO public.super_admins (user_id)
-- SELECT id FROM auth.users
-- WHERE lower(email) = lower('YOUR_EMAIL')
-- ON CONFLICT DO NOTHING;
