# Digital Calling Card Project Documentation

## Project overview

This project is a mobile-friendly digital business card for sharing a business's
contact details, services, work samples, and social pages. It also includes a
gallery of 12 sample card layouts so a visitor can preview designs and open a
full layout.

The current card is the Jontech example. For a new client, replace the sample
business content and images with information the client approves for public
display.

## Project goals

- Give a business one easy-to-share online calling card.
- Let customers call, message, email, find, and follow the business.
- Showcase services and examples of completed work.
- Make the card usable on mobile and installable where supported.
- Provide layout previews that do not interfere with scrolling the gallery.

## Current features

- **Business card:** profile, business details, service highlights, and contact
  links.
- **Direct actions:** call, text, email, location, and social links as
  configured in the card.
- **Social links:** configurable social and custom action buttons displayed in
  a dedicated card on the public page.
- **Payment QR codes:** upload payment QR images such as GCash; payment buttons
  open the selected QR image in a scan-friendly dialog. An optional payment
  destination URL adds a secure external “Proceed to payment” button.
- **QR code:** generates a QR code for the current card URL.
- **Share:** uses the device share dialog where available, with a copy-link
  fallback.
- **Install support:** provides an install prompt or browser-specific install
  instructions where supported.
- **Theme toggle:** switches between light and dark themes and remembers the
  preference in local storage.
- **Design gallery:** `/shop` displays 12 mini previews, each with a “View
  layout” link to open its full example.
- **Progressive Web App support:** includes a web manifest, icons, and service
  worker registration.
- **Super-admin dashboard:** highlights sites needing attention, manually
  tracked payment follow-up, client edit requests, recent admin activity, and
  sites without an assigned client.
- **Connected sites operations:** search, filter, and sort sites by readiness,
  unpaid drafts, pending edit requests, client assignment, and setup issues.
  Draft freshness and pending-request age are derived from database timestamps;
  hosting is explicitly shown as unmonitored until a health-check service is
  configured.
- **Site content drafts:** super admins can edit a site's profile and products
  privately, then review a before-and-after summary in a confirmation modal
  before publishing the saved content to the live database. Super-admin
  publishing is allowed regardless of payment status; approving an edit request
  only updates the private draft.
- **Client edit requests:** assigned clients can submit profile and product
  changes from `/admin` or profile-field requests from `/edit-request.html`.
  In the site editor, super admins compare each requested item with current
  content, approve or reject each item independently, and enter a reason for
  every rejection. Approved items are merged into the private draft; rejected
  values are excluded. Rejection reasons are emailed after the approved draft
  is published (all-rejected requests are emailed immediately because there
  is no accepted draft to publish). Client requests never write directly to
  live profile or product rows.

## Technology and project structure

- **React 18** renders the card and gallery.
- **Vite** serves the development app and builds the site.
- **qrcode.react** renders the QR code.
- **Firebase Hosting** serves each site's production build from `dist`.
- All card URLs are separate Firebase Hosting sites in the same Firebase
  project, and they connect to the same Supabase project. A `site_id` is the
  database label that identifies which site's records a request belongs to.
  Every site uses dedicated profile and product tables, and its table mapping
  is registered on its `managed_sites` row. The super-admin and publishing
  function resolve tables from that registry rather than maintaining per-site
  code branches.
- Edit requests, drafts, and admin activity are shared workflow tables keyed
  by `site_id`. Dedicated content tables have foreign keys back to their
  managed site. Browser roles can read public card content but cannot write
  live content. Assigned clients submit review requests; only the
  super-admin service function can update drafts or publish content.

Each physical tenant table is linked to its `managed_sites` row by a foreign
key. `managed_sites` is the authoritative table registry, and unique indexes
prevent two independent sites from being mapped to the same tenant table.
`site_admins` also has a composite key and a foreign key to managed sites.
Request, assignment, and activity indexes support site-scoped lookups as those
tables grow. Site creation calls a service-role-only database function that
creates the site's profile and product tables, access policies, blank profile,
registry entry, and client assignment in one transaction.

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Card content, links, QR/share/install interactions, and gallery |
| `src/style.css` | Card, gallery, theme, and responsive styles |
| `src/main.jsx` | React entry point and service worker registration |
| `index.html` | Main card page |
| `edit-request.html` | Client-facing profile update request app |
| `index1.html`–`index12.html` | Standalone sample layout pages |
| `public/` | Static images, app icons, manifest, and service worker |
| `vite.config.js` | Configures Vite to build the card, request app, and sample pages |
| `firebase.json` | Separate Firebase Hosting targets; build output is `dist` |

The project is static and uses Supabase for profile and product content. Image
uploads use a site-specific folder in the shared `images` storage bucket.

## Development and deployment

Copy `.env.example` to `.env.local` and set the Supabase project URL and anon
key. These are Vite public variables and are included in the browser build; do
not use a Supabase service-role key here.

For a new database setup, run
[`isolate-calling-card-d1.sql`](./isolate-calling-card-d1.sql) in the existing
Supabase project's SQL Editor if the legacy D1 source tables do not exist yet.
The multi-site migration below copies their data into the current shared
site-scoped tables; it does not delete the source tables.

### Multi-site super-admin access

All managed sites use one Supabase project, but each site is identified by its
own `site_id` and has its own profile and product tables. Firebase Hosting URLs
do not select or isolate database records; the site's build configuration
supplies its `site_id` and table names. The super-admin looks up each site's
registered profile/product table before editing or publishing.

Public profile, product, and image reads remain public because this content is
displayed on the card; do not put private customer information in these tables
or the public image bucket. Browser roles cannot write live profile/product
rows. Clients submit edit requests, and the super-admin reviews and publishes
those changes.

The owner portal is served from `https://superadmin-callingcard.web.app`.
Client accounts use unique email addresses within the shared Supabase Auth
project. When creating or resetting a client login, the owner chooses and
confirms the password; the portal displays it once after a successful change
so it can be delivered securely. Never share the Supabase project-owner
password or put a service-role key in browser code.
The owner can use **Manage card** in the portal to open any site's admin; sign
in there with the super-admin account to edit that site's content.

The managed tenants are:

| Site name | Site ID | Public URL |
| --- | --- | --- |
| Calling Card D1 | `calling-card-d1` | `https://calling-card-d1.web.app` |
| Calling Card D2 | `calling-card-d2` | `https://calling-card-d2.web.app` |
| Calling Card D3 | `calling-card-d3` | `https://calling-card-d3.web.app` |
| Calling Card D4 | `calling-card-d4` | `https://calling-card-d4.web.app` |
| Calling Card D5 | `calling-card-d5` | `https://calling-card-d5.web.app` |
| Calling Card D6 | `calling-card-d6` | `https://calling-card-d6.web.app` |
| Calling Card D7 | `calling-card-d7` | `https://calling-card-d7.web.app` |
| Calling Card D8 | `calling-card-d8` | `https://calling-card-d8.web.app` |
| Calling Card D9 | `calling-card-d9` | `https://calling-card-d9.web.app` |
| Calling Card D10 | `calling-card-d10` | `https://calling-card-d10.web.app` |
| Remo Contacts | `main` | `https://remo-contacts.web.app` |
| Aljon Contacts | `aljon-contacts` | `https://calling-card.web.app` |

Calling Card D1 uses `calling_card_d1_profiles` and
`calling_card_d1_products`; Remo uses `calling_card_remo_profiles` and
`calling_card_remo_products`; Aljon uses `calling_card_aljon_contacts_profiles`
and `calling_card_aljon_contacts_products`. They use the same dedicated-table
pattern as D2–D10. After the multi-site migration, run
[`calling-card-d1-database.sql`](./calling-card-d1-database.sql),
[`remo-contacts-database.sql`](./remo-contacts-database.sql), and
[`aljon-contacts-database.sql`](./aljon-contacts-database.sql) once. These
scripts preserve the shared-table rows while copying them into the dedicated
tables, switch the registry only after the copy succeeds, and retain the
shared rows as a rollback reference. They are safe to rerun and will not
overwrite dedicated content after the registry has switched.
Build and deploy D1 with `npm run deploy:d1`, Remo with `npm run deploy:remo`,
and Aljon with `npm run deploy:aljon`.

Calling Card D2 uses dedicated `calling_card_d2_profiles` and
`calling_card_d2_products` tables. Run
[`calling-card-d2-database.sql`](./calling-card-d2-database.sql) after
`multi-site-super-admin.sql` in the Supabase SQL Editor to create the empty
tables and register the site. Build and deploy it with `npm run deploy:d2`.
The shared super-admin review requests and private-draft workflow continue to
use `site_id = 'calling-card-d2'`.

Calling Card D3 also has dedicated `calling_card_d3_profiles` and
`calling_card_d3_products` tables. Run
[`calling-card-d3-database.sql`](./calling-card-d3-database.sql) after
`multi-site-super-admin.sql` in the Supabase SQL Editor. Build and deploy it
with `npm run deploy:d3`; D3 uses the shared super-admin request/draft workflow
with `site_id = 'calling-card-d3'`.

Calling Card D4 uses dedicated `calling_card_d4_profiles` and
`calling_card_d4_products` tables. Run
[`calling-card-d4-database.sql`](./calling-card-d4-database.sql) after
`multi-site-super-admin.sql` in Supabase SQL Editor. Build and deploy with
`npm run deploy:d4`; requests and drafts use the shared workflow with
`site_id = 'calling-card-d4'`.

Calling Card D5 uses dedicated `calling_card_d5_profiles` and
`calling_card_d5_products` tables. Run
[`calling-card-d5-database.sql`](./calling-card-d5-database.sql) after
`multi-site-super-admin.sql` in Supabase SQL Editor. Build and deploy with
`npm run deploy:d5`; requests and drafts use the shared workflow with
`site_id = 'calling-card-d5'`.

Calling Card D6 uses dedicated `calling_card_d6_profiles` and
`calling_card_d6_products` tables. Run
[`calling-card-d6-database.sql`](./calling-card-d6-database.sql) after
`multi-site-super-admin.sql` in Supabase SQL Editor. Build and deploy with
`npm run deploy:d6`; requests and drafts use the shared workflow with
`site_id = 'calling-card-d6'`.

Calling Card D7 uses dedicated `calling_card_d7_profiles` and
`calling_card_d7_products` tables. Run
[`calling-card-d7-database.sql`](./calling-card-d7-database.sql) after
`multi-site-super-admin.sql` in Supabase SQL Editor. Build and deploy with
`npm run deploy:d7`; requests and drafts use the shared workflow with
`site_id = 'calling-card-d7'`.

Calling Card D8 uses dedicated `calling_card_d8_profiles` and
`calling_card_d8_products` tables. Run
[`calling-card-d8-database.sql`](./calling-card-d8-database.sql) after
`multi-site-super-admin.sql` in Supabase SQL Editor. Build and deploy with
`npm run deploy:d8`; requests and drafts use the shared workflow with
`site_id = 'calling-card-d8'`.

Calling Card D9 uses dedicated `calling_card_d9_profiles` and
`calling_card_d9_products` tables. Run
[`calling-card-d9-database.sql`](./calling-card-d9-database.sql) after
`multi-site-super-admin.sql` in Supabase SQL Editor. Build and deploy with
`npm run deploy:d9`; requests and drafts use the shared workflow with
`site_id = 'calling-card-d9'`.

Calling Card D10 uses dedicated `calling_card_d10_profiles` and
`calling_card_d10_products` tables. Run
[`calling-card-d10-database.sql`](./calling-card-d10-database.sql) after
`multi-site-super-admin.sql` in Supabase SQL Editor. Build and deploy with
`npm run deploy:d10`; requests and drafts use the shared workflow with
`site_id = 'calling-card-d10'`.

Aljon Contacts uses the Remo app template but has its own empty profile,
product list, local cache namespace, and `aljon-contacts/` image-storage path.
Build and deploy it with `npm run deploy:aljon`; this uses its own Firebase
Hosting target and does not deploy to the Remo or Calling Card D1 targets.
Remo and Aljon each use their own dedicated profile/product tables despite
sharing the same app template.

For future sites, use **Add a site** in the super-admin portal so the database
registry, dedicated content tables, blank profile, and client assignment are
created together. Build/deploy that site with its matching `VITE_SITE_ID`,
`VITE_PROFILES_TABLE`, and `VITE_PRODUCTS_TABLE`. Creating tables by copying an
old tenant SQL file bypasses this registry and assignment workflow.

Schema changes to the `site_profiles` or `site_products` table templates do
not automatically alter already-created dedicated tenant tables. When adding
or changing a content column, update all registered dedicated content tables
in the same reviewed SQL migration, and test the portal editor and publish
flow before deployment.

One-time setup:

1. In Supabase SQL Editor, run `secure-client-auth.sql` if it has not already
   been applied. Ensure the legacy D1 source tables exist by running
   [`isolate-calling-card-d1.sql`](./isolate-calling-card-d1.sql) if needed,
   then run [`multi-site-super-admin.sql`](./multi-site-super-admin.sql).
   This migration prepares the shared schema and copies existing D1 and Remo
   data into it as a safe transition source. Then run the D1, Remo, and Aljon
   dedicated-table scripts listed above. They copy the site-specific rows into
   each dedicated table and update each registry mapping without deleting the
   shared source rows. For D2–D10, run each matching
   `calling-card-dN-database.sql` file if its dedicated tables have not
   already been created. Review the sites in the super-admin before any
   cleanup of old tables or shared rows.
   To verify each registry mapping and confirm its tables exist, run:

   ```sql
   SELECT
     site_id,
     name,
     profile_table,
     to_regclass(format('public.%I', profile_table)) IS NOT NULL AS profile_table_exists,
     products_table,
     to_regclass(format('public.%I', products_table)) IS NOT NULL AS products_table_exists
   FROM public.managed_sites
   ORDER BY name;
   ```

2. Create or use your owner account in **Authentication → Users**. Run the
   super-admin assignment query at the end of `multi-site-super-admin.sql`
   with your own account email. Enable MFA on this owner account and disable
   public sign-ups in Supabase Auth settings.
3. From a terminal, install/use the Supabase CLI, log in, and link this
   repository to the correct project:
   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy super-admin-sites --project-ref YOUR_PROJECT_REF
   ```

   The function uses Supabase's server-side service-role environment secret.
   Never prefix that secret with `VITE_`, add it to `.env`, or send it to the
   browser. The function verifies the caller against `super_admins`.
   Rejected-change emails are sent to the site's saved public profile email
   (the **Email** field in the client admin profile). They use SMTP configured
   as Edge Function secrets:

   ```powershell
   npx supabase secrets set SMTP_HOST=YOUR_SMTP_HOST SMTP_PORT=587 SMTP_USER=YOUR_SMTP_USERNAME SMTP_PASS=YOUR_SMTP_PASSWORD SMTP_FROM="Your Business <no-reply@example.com>" --project-ref YOUR_PROJECT_REF
   ```

   Configure these using your SMTP provider's credentials, not the Supabase
   Auth dashboard SMTP settings (those credentials are not exposed to Edge
   Functions). Never put SMTP credentials in frontend environment variables.
4. The `superadmin-callingcard` Firebase Hosting site already exists. Its
   target is configured in `.firebaserc` and `firebase.json`. After the SQL
   migration and Edge Function are ready, publish the portal with:

   ```powershell
   npm run deploy:superadmin
   ```

To test the approval boundary, sign in to `/admin` as an assigned client,
submit a profile or product change, and verify the public card is unchanged.
In the super-admin dashboard, open **Edit requests** and review the payload
and URL checks. **Approve to private draft** still does not change the card;
open **Manage card**, review the before-and-after summary, and explicitly
confirm publishing.
Rejections remain visible to the client with the administrator's reason.
URL validation checks syntax, protocols, and embedded credentials; it does
not verify that an external URL is reachable or that a hosting provider has
configured that domain. Image uploads continue to use the existing public
image bucket, so uploaded file URLs may be accessed directly even before the
request is approved, although the live card does not reference them.

   Share `https://superadmin-callingcard.web.app/edit-request.html` with
   clients. They sign in with their assigned client account, select profile
   fields, and submit a request for review. A request does not change the live
   profile. Payment status is tracked manually per site; it does not block
   super-admin publishing.

   From **Connected sites**, select **Edit site** to work on profile and
   product data. **Save as draft** keeps the live card unchanged. Select
   **Publish to live site**, review the exact before-and-after content in the
   confirmation modal, and confirm to atomically update the public profile and
   products in Supabase; this content publish does not require a Firebase
   rebuild. The confirmation warns when the site has not been marked paid, but
   publishing remains available.

5. To create a client site in the portal, enter its unique site ID (2–40
   lowercase letters, numbers, or hyphens), public HTTPS URL, client's unique
   email, and a password of 12–128 characters. The database provisions that
   site's profile table, product table, blank profile row, and client
   assignment in one transaction. If provisioning fails, the transaction
   leaves no partial site or tables; the server removes the newly created Auth
   account. Confirm the password, then deliver it using a secure channel.

   For IDs such as `calling-card-d11`, build the matching tenant with:

   ```powershell
   npm run build:tenant -- --mode d11
   ```

   For a custom site ID, provide that ID and its generated table names as Vite
   environment variables. Replace hyphens with underscores, remove the
   leading `calling-card-` if present, then use the result between
   `calling_card_` and `_profiles` or `_products`:

   ```powershell
   $env:VITE_SITE_ID = "client-site-id"
   $env:VITE_PROFILES_TABLE = "calling_card_client_site_id_profiles"
   $env:VITE_PRODUCTS_TABLE = "calling_card_client_site_id_products"
   npm run build:tenant
   Remove-Item Env:VITE_SITE_ID
   Remove-Item Env:VITE_PROFILES_TABLE
   Remove-Item Env:VITE_PRODUCTS_TABLE
   ```

   The Firebase Hosting site and target still need to exist and be configured
   before deploying the resulting `dist` build.

The SQL migrations and Edge Function must be deployed before publishing the
super-admin frontend. The browser only provides the interface; all privileged
account creation and site authorization happen on the server or in RLS.

Install dependencies and start the local development server:

```sh
npm install
npm run dev
```

Create and preview a production build:

```sh
npm run build
npm run preview
```

Deploy Calling Card D1 to its own Hosting target:

```sh
npm run deploy:d1
```

`npm run deploy:remo` serves `https://remo-contacts.web.app`; the
`aljon-contacts-hosting` target serves `https://calling-card.web.app`.
Each build mode selects its site's own `site_id` and dedicated data tables.

## Client discovery and content checklist

Collect only information the client wants published. Public page URLs are
enough; do not ask for social account passwords.

### Business identity

- Owner or primary contact name, if they want it shown
- Business name and preferred spelling/capitalization
- Business role/title, if useful
- Short business introduction
- Logo, if available
- Preferred colors, style, or examples of cards they like

### Contact and location

- Public business phone number
- WhatsApp, Viber, or other preferred messaging number
- Business email address
- Shop address, only if customers can visit
- Service area, if work is provided at customer locations
- Preferred contact method and business hours, if they want these displayed

### Sofa and upholstery services

Ask which services they actually offer. Examples to confirm:

- Custom sofa or couch design and creation
- Reupholstery, including fabric or leather replacement
- Sofa repair and restoration
- Frame or structural repair
- Foam, cushion, or padding replacement
- Recliner or other furniture repair
- Pickup, delivery, or on-site assessment

Ask for a brief description of any specialist service and the areas served.
Do not list a service unless the client confirms they provide it.

### Work samples and online pages

- Website URL
- Facebook business page
- Instagram, TikTok, YouTube, or other relevant social pages
- A small selection of finished-work photos
- Before-and-after photos, if available
- Customer testimonials, only with the customer's permission

Confirm the client has permission to publish each photo, logo, testimonial, and
other supplied asset.

### Desired customer action

Agree on the main action the card should encourage:

- Call or message for an estimate
- Request a quote
- Send photos of furniture for an initial assessment
- View the work portfolio
- Visit the showroom or workshop
- Follow a social page

The final card should make the chosen action easy to find.

## Copy-and-send client questionnaire

> Hi! To prepare your digital calling card, please send the details you want
> customers to see:
>
> 1. Your business name and the name/title you want displayed
> 2. A short introduction to your business
> 3. The phone number, messaging number, and email you want customers to use
> 4. Your shop address or the areas you serve
> 5. The sofa or furniture services you offer
> 6. Your website and public social-media page links
> 7. Your logo and a few photos of your work (before-and-after photos are
>    welcome)
> 8. The main action you want customers to take, such as calling, messaging, or
>    requesting a quote
> 9. Any information or photos you do not want displayed
>
> Please send page links, not account passwords. Make sure you have permission
> to share any photos, logos, or testimonials you provide. I’ll confirm the
> finished details with you before publishing.

## Privacy and approval

- Do not request passwords, government ID numbers, payment details, or other
  sensitive personal information for a calling card.
- Avoid publishing a home address; use a public shop address or service area
  only when approved.
- Get the client's approval for all public-facing contact details, service
  claims, links, and assets before launch.
- Keep a clear distinction between the card's public business details and
  private project communications.

## Client delivery checklist

- [ ] Client has approved the business name, description, and services.
- [ ] Phone, messaging, email, address/service area, and links have been tested.
- [ ] Photos and logo are approved for public use.
- [ ] Primary customer action is clear and works on mobile.
- [ ] QR code points to the final public card URL.
- [ ] Card and gallery have been checked on a phone-sized screen.
- [ ] Client has reviewed the live card and approved publication.
