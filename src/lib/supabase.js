import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const requestedSiteId = new URLSearchParams(window.location.search).get("site_id");
const configuredSiteId = import.meta.env.VITE_SITE_ID
  || (import.meta.env.MODE === "remo" ? "main" : "calling-card-d1");
export const siteId = requestedSiteId && /^[a-z0-9][a-z0-9-]{1,39}$/.test(requestedSiteId)
  ? requestedSiteId
  : configuredSiteId;
const tableSuffix = siteId === "main"
  ? "remo"
  : siteId === "aljon-contacts"
    ? "aljon_contacts"
    : siteId.replace(/^calling-card-/, "").replace(/-/g, "_");
export const profilesTable = import.meta.env.VITE_PROFILES_TABLE
  || `calling_card_${tableSuffix}_profiles`;
export const productsTable = import.meta.env.VITE_PRODUCTS_TABLE
  || `calling_card_${tableSuffix}_products`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
