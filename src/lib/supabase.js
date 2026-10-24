import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const requestedSiteId = new URLSearchParams(window.location.search).get("site_id");
const configuredSiteId = import.meta.env.VITE_SITE_ID
  || (import.meta.env.MODE === "remo" ? "main" : "calling-card-d1");
export const siteId = requestedSiteId && /^[a-z0-9][a-z0-9-]{1,62}$/.test(requestedSiteId)
  ? requestedSiteId
  : configuredSiteId;
export const profilesTable = "site_profiles";
export const productsTable = "site_products";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
