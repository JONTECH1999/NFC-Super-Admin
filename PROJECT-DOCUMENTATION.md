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

## Technology and project structure

- **React 18** renders the card and gallery.
- **Vite** serves the development app and builds the site.
- **qrcode.react** renders the QR code.
- **Firebase Hosting** serves each site's production build from `dist`.
- Managed sites share the Supabase project but store profile and product data
  in tenant-scoped tables keyed by `site_id`; admin changes are restricted to
  the selected site by row-level security.

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Card content, links, QR/share/install interactions, and gallery |
| `src/style.css` | Card, gallery, theme, and responsive styles |
| `src/main.jsx` | React entry point and service worker registration |
| `index.html` | Main card page |
| `index1.html`–`index12.html` | Standalone sample layout pages |
| `public/` | Static images, app icons, manifest, and service worker |
| `vite.config.js` | Configures Vite to build all 13 HTML entry points |
| `firebase.json` | Separate Firebase Hosting targets; build output is `dist` |

The project is static and uses Supabase for profile and product content. Image
uploads use a site-specific folder in the shared `images` storage bucket.

## Development and deployment

Copy `.env.example` to `.env.local` and set the Supabase project URL and anon
key. These are Vite public variables and are included in the browser build; do
not use a Supabase service-role key here.

Before deploying this site for the first time, run
[`isolate-calling-card-d1.sql`](./isolate-calling-card-d1.sql) in the existing
Supabase project's SQL Editor. It creates dedicated tables using the existing
tables' schema, grants public read access, restricts writes to accounts
assigned to this site, and creates an empty profile row. It does not copy or
modify the other site's business data.

### Multi-site super-admin access

All managed public sites use `site_profiles` and `site_products` in one
Supabase project, with a `site_id` on each row. Row Level Security checks each
client's site assignment for every write. Public profile, product, and image
reads remain public because this content is displayed on the card; do not put
private customer information in these tables or the public image bucket.

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
| Remo Contacts | `main` | `https://remo-contacts.web.app` |
| Aljon Contacts | `aljon-contacts` | `https://calling-card.web.app` |

Aljon Contacts uses the Remo app template but has its own empty profile,
product list, local cache namespace, and `aljon-contacts/` image-storage path.
Build and deploy it with `npm run deploy:aljon`; this uses its own Firebase
Hosting target and does not deploy to the Remo or Calling Card D1 targets.

One-time setup:

1. In Supabase SQL Editor, run `secure-client-auth.sql` if it has not already
   been applied, then run
   [`multi-site-super-admin.sql`](./multi-site-super-admin.sql). The migration
   copies the existing `calling-card-d1` and `main` profile/product data into
   the new site-scoped tables. Review the copied data before removing any old
   tables; the migration does not drop the legacy tables.
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
4. The `superadmin-callingcard` Firebase Hosting site already exists. Its
   target is configured in `.firebaserc` and `firebase.json`. After the SQL
   migration and Edge Function are ready, publish the portal with:

   ```powershell
   npm run deploy:superadmin
   ```

5. To create a client site in the portal, enter its unique site ID, public
   HTTPS URL, client's unique email, and a password of 12–128 characters.
   Confirm the password, then deliver it using a secure channel. Build each
   client's website with that same ID as `VITE_SITE_ID`; this ensures it only
   loads that site's rows:

   ```powershell
   $env:VITE_SITE_ID = "client-site-id"
   npm run build
   Remove-Item Env:VITE_SITE_ID
   ```

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

Deploy only this site's Hosting target:

```sh
npm run deploy:main
```

The `calling-card` Hosting target is mapped to the `calling-card-d1` site in
the `digital-callingcard` project. Its public URL is
`https://calling-card-d1.web.app`.

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
