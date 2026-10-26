-- First-login terms/privacy acknowledgements and per-request publication confirmations
-- for Calling Card D1-D10. Run in the shared Supabase SQL Editor as project owner.
BEGIN;

CREATE TABLE IF NOT EXISTS public.client_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL REFERENCES public.managed_sites(site_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edit_request_id uuid REFERENCES public.site_edit_requests(id) ON DELETE CASCADE,
  acceptance_type text NOT NULL
    CHECK (acceptance_type IN ('onboarding', 'publication_confirmation')),
  terms_version text NOT NULL
    CHECK (terms_version = '2026-10-26-v1'),
  privacy_notice_version text NOT NULL
    CHECK (privacy_notice_version = '2026-10-26-v1'),
  publication_confirmation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_legal_acceptances_d1_d10_site_check
    CHECK (site_id ~ '^calling-card-d(10|[1-9])$'),
  CONSTRAINT client_legal_acceptances_confirmation_type_check
    CHECK (
      (acceptance_type = 'onboarding' AND NOT publication_confirmation AND edit_request_id IS NULL)
      OR
      (acceptance_type = 'publication_confirmation' AND publication_confirmation AND edit_request_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS client_legal_acceptances_user_site_idx
  ON public.client_legal_acceptances (user_id, site_id, acceptance_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS client_legal_publication_request_unique_idx
  ON public.client_legal_acceptances (edit_request_id)
  WHERE acceptance_type = 'publication_confirmation';

ALTER TABLE public.client_legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.client_legal_acceptances TO authenticated;
GRANT ALL ON public.client_legal_acceptances TO service_role;

DROP POLICY IF EXISTS "Clients can read own legal acknowledgements"
  ON public.client_legal_acceptances;
CREATE POLICY "Clients can read own legal acknowledgements"
  ON public.client_legal_acceptances
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.can_manage_site(site_id)
  );

DROP POLICY IF EXISTS "Clients can record own legal acknowledgements"
  ON public.client_legal_acceptances;
CREATE POLICY "Clients can record own legal acknowledgements"
  ON public.client_legal_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_manage_site(site_id)
    AND terms_version = '2026-10-26-v1'
    AND privacy_notice_version = '2026-10-26-v1'
    AND (
      (acceptance_type = 'onboarding' AND NOT publication_confirmation)
    )
  );

CREATE OR REPLACE FUNCTION public.record_client_legal_acknowledgement(
  target_site_id text,
  target_terms_version text,
  target_privacy_notice_version text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  acknowledgement_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR target_site_id !~ '^calling-card-d(10|[1-9])$'
    OR target_terms_version <> '2026-10-26-v1'
    OR target_privacy_notice_version <> '2026-10-26-v1'
    OR NOT public.can_manage_site(target_site_id) THEN
    RAISE EXCEPTION 'Unable to record this client acknowledgement.';
  END IF;

  INSERT INTO public.client_legal_acceptances (
    site_id, user_id, acceptance_type, terms_version, privacy_notice_version, publication_confirmation
  )
  VALUES (
    target_site_id, (SELECT auth.uid()), 'onboarding',
    target_terms_version, target_privacy_notice_version, false
  )
  RETURNING id INTO acknowledgement_id;

  RETURN acknowledgement_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_client_legal_acknowledgement(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_client_legal_acknowledgement(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_client_edit_request_with_confirmation(
  target_site_id text,
  target_request_type text,
  target_client_email text,
  target_payload jsonb,
  target_fields jsonb,
  target_notes text DEFAULT '',
  target_publication_confirmed boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_id uuid;
  client_user_id uuid := (SELECT auth.uid());
BEGIN
  IF client_user_id IS NULL
    OR target_site_id !~ '^calling-card-d(10|[1-9])$'
    OR target_request_type NOT IN ('profile', 'products')
    OR target_publication_confirmed IS DISTINCT FROM true
    OR lower(coalesce(target_client_email, '')) <> lower(coalesce((SELECT auth.jwt() ->> 'email'), ''))
    OR NOT public.can_manage_site(target_site_id)
    OR NOT EXISTS (
      SELECT 1
      FROM public.client_legal_acceptances AS acknowledgement
      WHERE acknowledgement.site_id = target_site_id
        AND acknowledgement.user_id = client_user_id
        AND acknowledgement.acceptance_type = 'onboarding'
        AND acknowledgement.terms_version = '2026-10-26-v1'
        AND acknowledgement.privacy_notice_version = '2026-10-26-v1'
    ) THEN
    RAISE EXCEPTION 'Confirm the current client terms and provide a valid assigned-site request.';
  END IF;

  INSERT INTO public.site_edit_requests (
    site_id, user_id, client_email, request_type, payload, fields, notes
  )
  VALUES (
    target_site_id, client_user_id, target_client_email, target_request_type,
    target_payload, target_fields, coalesce(target_notes, '')
  )
  RETURNING id INTO request_id;

  INSERT INTO public.client_legal_acceptances (
    site_id, user_id, edit_request_id, acceptance_type, terms_version,
    privacy_notice_version, publication_confirmation
  )
  VALUES (
    target_site_id, client_user_id, request_id, 'publication_confirmation',
    '2026-10-26-v1', '2026-10-26-v1', true
  );

  RETURN request_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_client_edit_request_with_confirmation(text, text, text, jsonb, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_client_edit_request_with_confirmation(text, text, text, jsonb, jsonb, text, boolean) TO authenticated;

COMMIT;

-- If either client document changes, update its version in src/ClientLegal.jsx
-- and the matching version checks in this migration before deploying the client apps.
