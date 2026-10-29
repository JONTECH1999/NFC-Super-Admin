import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
import nodemailer from "npm:nodemailer@6.9.16";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const allowedOrigin = Deno.env.get("SUPER_ADMIN_ORIGIN") || "https://superadmin-callingcard.web.app";
if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase URL, anon key, and service-role key are required.");
}

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (origin === allowedOrigin || origin.startsWith("http://localhost:")) return true;
  try {
    return new URL(origin).protocol === "https:";
  } catch {
    return false;
  }
}

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function isValidClientPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

function invalid(message: string, origin: string | null) {
  return jsonResponse({ error: message }, 400, origin);
}

const editableProfileFields = new Set([
  "name", "business", "role", "eyebrow", "phone", "phone_link", "email",
  "address", "address_link", "facebook", "youtube", "description",
  "profile_image_url", "site_title", "site_icon_url", "theme_mode",
  "custom_qr_url", "custom_links",
]);

function isAllowedDataTable(tableName: unknown, kind: "profiles" | "products") {
  if (typeof tableName !== "string") return false;
  const sharedTable = kind === "profiles" ? "site_profiles" : "site_products";
  return tableName === sharedTable
    || new RegExp(`^calling_card_[a-z0-9_]+_${kind}$`).test(tableName);
}

async function getSiteDataTables(
  serviceClient: ReturnType<typeof createClient>,
  siteId: string,
) {
  const { data, error } = await serviceClient
    .from("managed_sites")
    .select("profile_table, products_table")
    .eq("site_id", siteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No managed site exists for "${siteId}".`);
  if (!isAllowedDataTable(data.profile_table, "profiles")
    || !isAllowedDataTable(data.products_table, "products")) {
    throw new Error(`Managed site "${siteId}" has invalid profile or product table configuration.`);
  }
  return {
    profileTable: data.profile_table,
    productsTable: data.products_table,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSafeWebUrl(value: string) {
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function validateDraftLinks(profile: Record<string, unknown>, products: Record<string, unknown>[]) {
  for (const field of ["address_link", "facebook", "youtube", "profile_image_url", "site_icon_url", "custom_qr_url"]) {
    const value = profile[field];
    if (typeof value === "string" && value.trim() && !parseSafeWebUrl(value.trim())) {
      return `"${field}" must be a valid HTTP or HTTPS URL without embedded credentials.`;
    }
  }
  if (typeof profile.phone_link === "string" && profile.phone_link.trim()) {
    const value = profile.phone_link.trim();
    if (!/^tel:\+?[\d\s().-]{3,80}$/i.test(value)
      && !/^\+?[\d\s().-]{3,80}$/.test(value)) {
      return '"phone_link" must be a valid telephone link.';
    }
  }
  if (profile.custom_links !== undefined) {
    if (!Array.isArray(profile.custom_links)) return "Profile custom links must be a list.";
    for (const link of profile.custom_links) {
      if (!isObject(link)) return "Each custom link must be an object.";
      for (const field of ["qr_image_url", "payment_url"]) {
        const value = link[field];
        if (typeof value === "string" && value.trim() && !parseSafeWebUrl(value.trim())) {
          return `Custom-link "${field}" must be a valid HTTP or HTTPS URL without embedded credentials.`;
        }
      }
      if (typeof link.url === "string" && link.url.trim()) {
        const value = link.url.trim();
        const isPhoneNumber = link.icon === "fa-solid fa-phone"
          && /^\+?[\d\s().-]{3,80}$/.test(value);
        if (!isPhoneNumber
          && !parseSafeWebUrl(value)
          && !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)
          && !/^tel:\+?[\d\s().-]{3,80}$/i.test(value)
          && !/^sms:\+?[\d\s().-]{3,80}$/i.test(value)) {
          return "Custom-link destinations must use a valid HTTP(S), email, telephone, or SMS link.";
        }
      }
    }
  }
  for (const product of products) {
    for (const field of ["image_url"]) {
      const value = product[field];
      if (typeof value === "string" && value.trim() && !parseSafeWebUrl(value.trim())) {
        return `Product "${field}" must be a valid HTTP or HTTPS URL without embedded credentials.`;
      }
    }
    if (product.gallery !== undefined) {
      if (!Array.isArray(product.gallery)) return "Product galleries must be lists.";
      for (const image of product.gallery) {
        if (typeof image !== "string" || !parseSafeWebUrl(image.trim())) {
          return "Every product gallery image must be a valid HTTP or HTTPS URL.";
        }
      }
    }
  }
  return null;
}

function validateDraft(profile: unknown, products: unknown) {
  if (!isObject(profile) || !Array.isArray(products) || products.length > 100) {
    return "A profile object and no more than 100 products are required.";
  }
  if (Object.keys(profile).some((key) => !editableProfileFields.has(key))) {
    return "The profile contains an unsupported field.";
  }
  for (const [key, value] of Object.entries(profile)) {
    if (key === "custom_links") {
      if (!Array.isArray(value) || value.length > 100) return "Profile custom links must be a list of no more than 100 items.";
      for (const link of value) {
        if (!isObject(link)) return "Each custom link must be an object.";
        for (const field of ["id", "type", "label", "url", "icon", "qr_image_url", "payment_url"]) {
          if (link[field] !== undefined
            && (typeof link[field] !== "string" || link[field].length > 2000)) {
            return `Custom-link field "${field}" must be text within the allowed length.`;
          }
        }
        if (link.type === "payment") {
          if (!String(link.label || "").trim() || !String(link.qr_image_url || "").trim()) {
            return "Each payment button needs a label and QR image URL.";
          }
        } else if (!String(link.label || "").trim() || !String(link.url || "").trim()) {
          return "Each social or action button needs a label and destination URL.";
        }
      }
      continue;
    }
    if (typeof value !== "string" || value.length > (key === "description" ? 10000 : 2000)) {
      return `Profile field "${key}" must be text within the allowed length.`;
    }
  }
  for (const product of products) {
    if (!isObject(product) || typeof product.name !== "string" || !product.name.trim() || product.name.length > 200) {
      return "Every product needs a name of up to 200 characters.";
    }
    if (product.id !== undefined && product.id !== null
      && (typeof product.id !== "string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id))) {
      return "Product IDs must be valid UUIDs.";
    }
    for (const field of ["description", "price", "image_url", "alt"]) {
      if (product[field] !== undefined && (typeof product[field] !== "string" || product[field].length > 10000)) {
        return `Product field "${field}" must be text within the allowed length.`;
      }
    }
    if (product.gallery !== undefined
      && (!Array.isArray(product.gallery) || product.gallery.length > 100)) {
      return "Product galleries must be lists of no more than 100 images.";
    }
    if (product.is_featured !== undefined && typeof product.is_featured !== "boolean") {
      return "Product featured status must be true or false.";
    }
    if (product.sort_order !== undefined
      && (!Number.isInteger(product.sort_order) || product.sort_order < 0 || product.sort_order > 10000)) {
      return "Product sort order must be a whole number between 0 and 10,000.";
    }
  }
  const productIds = products.map((product) => isObject(product) && typeof product.id === "string" ? product.id : "").filter(Boolean);
  if (new Set(productIds).size !== productIds.length) return "Product IDs must be unique.";
  return validateDraftLinks(profile, products);
}

function validateProductRequestIds(request: Record<string, unknown>) {
  if (request.request_type !== "products") return null;
  const proposed = Array.isArray(request.payload)
    ? request.payload
    : isObject(request.payload) && Array.isArray(request.payload.products)
      ? request.payload.products
      : null;
  if (!proposed) return "The submitted product list is invalid.";
  const ids: string[] = [];
  for (const product of proposed) {
    if (!isObject(product) || typeof product.id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id)) {
      return "Each requested product must have a valid product ID.";
    }
    ids.push(product.id);
  }
  if (new Set(ids).size !== ids.length) return "Requested product IDs must be unique.";
  return null;
}

const productReviewFields = ["name", "description", "price", "image_url", "alt", "gallery", "is_featured"] as const;
const profileFieldLabels: Record<string, string> = {
  name: "Name",
  business: "Business",
  role: "Role or title",
  eyebrow: "Short label",
  description: "Description",
  phone: "Phone",
  phone_link: "Phone link",
  email: "Public email",
  address: "Address",
  address_link: "Address / map link",
  facebook: "Facebook URL",
  youtube: "YouTube URL",
  site_title: "Browser tab title",
  site_icon_url: "Site icon URL",
  profile_image_url: "Profile image URL",
  custom_qr_url: "Custom QR image URL",
  theme_mode: "Theme",
  custom_links: "Custom links and payment buttons",
};

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function customLinkIdentity(link: unknown, index: number) {
  return isObject(link) && link.id !== undefined && link.id !== null && String(link.id)
    ? `id:${String(link.id)}`
    : `index:${index}`;
}

function buildRequestChanges(
  request: Record<string, unknown>,
  profile: Record<string, unknown>,
  products: Record<string, unknown>[],
  includeUnchanged = false,
) {
  const changes: Array<Record<string, unknown>> = [];
  if (request.request_type === "profile") {
    const patch = isObject(request.payload) && Object.keys(request.payload).length
      ? request.payload
      : isObject(request.fields) ? request.fields : {};
    for (const [field, value] of Object.entries(patch)) {
      if (!editableProfileFields.has(field)) continue;
      if (field === "custom_links") {
        const oldLinks = Array.isArray(profile.custom_links) ? profile.custom_links : [];
        const newLinks = Array.isArray(value) ? value : [];
        const oldByIdentity = new Map(oldLinks.map((link, index) => [customLinkIdentity(link, index), { link, index }]));
        const newByIdentity = new Map(newLinks.map((link, index) => [customLinkIdentity(link, index), { link, index }]));
        const identities = [
          ...newLinks.map((link, index) => customLinkIdentity(link, index)),
          ...oldLinks.map((link, index) => customLinkIdentity(link, index)),
        ].filter((identity, index, all) => all.indexOf(identity) === index);
        for (const identity of identities) {
          const previous = oldByIdentity.get(identity);
          const requested = newByIdentity.get(identity);
          if (stableValue(previous?.link ?? null) === stableValue(requested?.link ?? null)) continue;
          const item = requested?.link ?? previous?.link;
          const label = isObject(item) && typeof item.label === "string" && item.label.trim()
            ? item.label.trim()
            : "Untitled button";
          const typeLabel = isObject(item) && item.type === "payment" ? "Payment method" : "Social button";
          changes.push({
            key: `profile:custom_link:${encodeURIComponent(identity)}`,
            label: `${typeLabel}: ${label}`,
            old_value: previous?.link ?? null,
            new_value: requested?.link ?? null,
            old_index: previous?.index ?? null,
            new_index: requested?.index ?? null,
          });
        }
        continue;
      }
      const previous = profile[field] ?? null;
      if (!includeUnchanged && stableValue(previous) === stableValue(value)) continue;
      changes.push({
        key: `profile:${field}`,
        label: profileFieldLabels[field] || field,
        old_value: previous,
        new_value: value,
      });
    }
    return changes;
  }

  const proposed = Array.isArray(request.payload)
    ? request.payload
    : isObject(request.payload) && Array.isArray(request.payload.products)
      ? request.payload.products
      : [];
  const oldById = new Map(products.map((product) => [String(product.id), product]));
  const newById = new Map(proposed.filter(isObject).map((product) => [String(product.id), product]));

  for (const product of proposed.filter(isObject)) {
    const id = String(product.id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
    const previous = oldById.get(id);
    if (!previous) {
      const newProduct = Object.fromEntries(
        Object.entries(product).filter(([key]) => ["id", ...productReviewFields].includes(key)),
      );
      changes.push({ key: `product:${id}:create`, label: `Add product: ${String(product.name || "Unnamed")}`, old_value: null, new_value: newProduct });
      continue;
    }
    for (const field of productReviewFields) {
      const oldValue = previous[field] ?? null;
      const newValue = product[field] ?? null;
      if (!includeUnchanged && stableValue(oldValue) === stableValue(newValue)) continue;
      changes.push({
        key: `product:${id}:${field}`,
        label: `${String(previous.name || product.name || "Product")} · ${field.replaceAll("_", " ")}`,
        old_value: oldValue,
        new_value: newValue,
      });
    }
  }
  for (const product of products) {
    const id = String(product.id || "");
    if (id && !newById.has(id)) {
      changes.push({
        key: `product:${id}:delete`,
        label: `Remove product: ${String(product.name || id)}`,
        old_value: product,
        new_value: null,
      });
    }
  }
  return changes;
}

function getLatestRequestChanges(
  requests: Record<string, unknown>[],
  profile: Record<string, unknown>,
  products: Record<string, unknown>[],
) {
  const latestRequestByKey = new Map<string, Record<string, unknown>>();
  for (const request of requests) {
    const requestId = String(request.id);
    const createdAt = String(request.created_at || "");
    for (const change of buildRequestChanges(request, profile, products, true)) {
      const key = String(change.key);
      const latest = latestRequestByKey.get(key);
      const latestDate = String(latest?.created_at || "");
      const latestId = String(latest?.id || "");
      if (!latest || createdAt > latestDate || (createdAt === latestDate && requestId > latestId)) {
        latestRequestByKey.set(key, request);
      }
    }
  }

  return new Map(requests.map((request) => {
    const requestId = String(request.id);
    const changes = buildRequestChanges(request, profile, products).filter((change) => (
      String(latestRequestByKey.get(String(change.key))?.id || "") === requestId
    ));
    return [requestId, changes];
  }));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function formatDecisionValue(value: unknown) {
  return value === null || value === undefined
    ? "—"
    : typeof value === "string" ? value : JSON.stringify(value, null, 2) || String(value);
}

async function sendRejectedChangeEmails(
  serviceClient: ReturnType<typeof createClient>,
  siteId: string,
  publishedAt: string | null = null,
) {
  const { data: requests, error: requestError } = await serviceClient
    .from("site_edit_requests")
    .select("id, status, reviewed_at, review_decisions")
    .eq("site_id", siteId)
    .in("status", ["approved", "rejected"])
    .in("email_status", ["pending", "failed"])
    .order("reviewed_at", { ascending: true })
    .limit(100);
  if (requestError) throw requestError;

  const eligibleRequests = (requests || []).filter((request) => (
    request.status === "rejected"
    || (
      request.status === "approved"
      && publishedAt
      && request.reviewed_at
      && new Date(request.reviewed_at) <= new Date(publishedAt)
    )
  ));
  const { profileTable } = await getSiteDataTables(serviceClient, siteId);
  const { data: siteProfile, error: profileError } = await serviceClient
    .from(profileTable)
    .select("email")
    .eq("site_id", siteId)
    .maybeSingle();
  if (profileError) throw profileError;
  const recipient = siteProfile?.email?.trim() || "";
  const host = Deno.env.get("SMTP_HOST");
  const portValue = Number(Deno.env.get("SMTP_PORT") || "587");
  const username = Deno.env.get("SMTP_USER");
  const password = Deno.env.get("SMTP_PASS");
  const from = Deno.env.get("SMTP_FROM");
  if (!host || !Number.isInteger(portValue) || portValue < 1 || portValue > 65535 || !username || !password || !from) {
    const message = "SMTP secrets are not fully configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).";
    for (const request of eligibleRequests) {
      const { error } = await serviceClient.from("site_edit_requests")
        .update({ email_status: "failed", email_error: message })
        .eq("id", request.id);
      if (error) throw error;
    }
    return { sent: 0, failed: requests?.length || 0, warning: message };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: portValue,
    secure: portValue === 465,
    auth: { user: username, pass: password },
  });
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const request of eligibleRequests) {
    const rejected = Object.values(isObject(request.review_decisions) ? request.review_decisions : {})
      .filter((item): item is Record<string, unknown> => isObject(item) && item.decision === "reject");
    if (rejected.length === 0) {
      const { error } = await serviceClient.from("site_edit_requests")
        .update({ email_status: "not_required", email_error: "" })
        .eq("id", request.id);
      if (error) throw error;
      continue;
    }
    const { data: claimed, error: claimError } = await serviceClient.from("site_edit_requests")
      .update({ email_status: "sending", email_error: "" })
      .eq("id", request.id)
      .in("email_status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    if (!recipient) {
      const message = "The site's saved profile email is empty. Add an email in the client admin profile before retrying.";
      const { error } = await serviceClient.from("site_edit_requests")
        .update({ email_status: "failed", email_error: message.slice(0, 1900) })
        .eq("id", request.id);
      if (error) throw error;
      failed++;
      errors.push(message);
      continue;
    }

    const plainRows = rejected.map((item) => [
      String(item.label || "Requested change"),
      `Current data: ${formatDecisionValue(item.old_value)}`,
      `Requested data: ${formatDecisionValue(item.new_value)}`,
      `Reason: ${String(item.reason || "Not approved")}`,
    ].join("\n"));
    const htmlRows = rejected.map((item) => (
      `<li><strong>${escapeHtml(String(item.label || "Requested change"))}</strong><br><strong>Current data:</strong><pre>${escapeHtml(formatDecisionValue(item.old_value))}</pre><strong>Requested data:</strong><pre>${escapeHtml(formatDecisionValue(item.new_value))}</pre><strong>Reason:</strong> ${escapeHtml(String(item.reason || "Not approved"))}</li>`
    ));
    try {
      await transporter.sendMail({
        from,
        to: recipient,
        subject: "Update about your requested card changes",
        text: `Some requested changes were not published:\n\n${plainRows.join("\n\n")}`,
        html: `<p>Some requested changes were not published:</p><ul>${htmlRows.join("")}</ul>`,
      });
      const { error } = await serviceClient.from("site_edit_requests")
        .update({ email_status: "sent", email_error: "" })
        .eq("id", request.id);
      if (error) throw error;
      sent++;
    } catch (mailError) {
      const message = mailError instanceof Error ? mailError.message.slice(0, 1900) : "SMTP delivery failed.";
      console.error("Rejected-change email delivery failed:", message);
      const { error } = await serviceClient.from("site_edit_requests")
        .update({ email_status: "failed", email_error: message })
        .eq("id", request.id);
      if (error) throw error;
      failed++;
      errors.push(message);
    }
  }
  return { sent, failed, warning: errors[0] || "" };
}

async function deleteCreatedUser(
  deleteUser: (userId: string) => Promise<{ error: { message: string } | null }>,
  userId: string,
) {
  const { error } = await deleteUser(userId);
  if (error) {
    console.error("Could not clean up a partially created client account:", error.message);
    return false;
  }
  return true;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      return new Response(null, { status: 403 });
    }
    const headers = new Headers(corsHeaders);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response("ok", { headers });
  }
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed." }, 403, null);
  }
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, origin);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({ error: "Sign in as a super administrator." }, 401, origin);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userResult.user) {
    return jsonResponse({ error: "Your session is invalid or expired." }, 401, origin);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const recordActivity = async (siteId: string | null, action: string, description: string) => {
    const { error } = await serviceClient.from("super_admin_activity").insert({
      site_id: siteId,
      actor_user_id: userResult.user.id,
      actor_email: userResult.user.email || "",
      action,
      description,
    });
    if (error) throw error;
  };

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400, origin);
  }

  if (body.action === "complete_client_password_change") {
    if (!userResult.user.app_metadata.force_password_change) {
      return jsonResponse({ error: "Change the temporary password before continuing." }, 403, origin);
    }
    const newPassword = typeof body.new_password === "string" ? body.new_password : "";
    if (newPassword.length < 12 || newPassword.length > 128) {
      return jsonResponse({ error: "Choose a new password between 12 and 128 characters." }, 400, origin);
    }
    const { data: assignment, error: assignmentError } = await serviceClient
      .from("site_admins")
      .select("site_id")
      .eq("user_id", userResult.user.id)
      .limit(1)
      .maybeSingle();
    if (assignmentError) {
      console.error("Client assignment lookup failed:", assignmentError.message);
      return jsonResponse({ error: "Unable to verify site assignment." }, 500, origin);
    }
    if (!assignment) return jsonResponse({ error: "No site is assigned to this account." }, 403, origin);
    const { error } = await serviceClient.auth.admin.updateUserById(userResult.user.id, {
      password: newPassword,
      app_metadata: {
        ...userResult.user.app_metadata,
        force_password_change: false,
      },
    });
    if (error) {
      console.error("Unable to clear temporary-password status:", error.message);
      return jsonResponse({ error: "Password updated, but the account status could not be refreshed." }, 500, origin);
    }
    return jsonResponse({ ok: true }, 200, origin);
  }

  const { data: admin, error: adminError } = await serviceClient
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userResult.user.id)
    .maybeSingle();
  if (adminError) {
    console.error("Super-admin authorization lookup failed:", adminError.message);
    return jsonResponse({ error: "Unable to verify super-admin access." }, 500, origin);
  }
  if (!admin) return jsonResponse({ error: "Super-admin access is required." }, 403, origin);

  try {
    if (body.action === "review_edit_request") {
      const requestId = String(body.request_id || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
        || !isObject(body.decisions)) {
        return invalid("A valid request ID and per-item decisions are required.", origin);
      }
      const { data: editRequest, error: requestError } = await serviceClient
        .from("site_edit_requests")
        .select("id, site_id, user_id, client_email, request_type, fields, payload, notes, status, created_at")
        .eq("id", requestId)
        .maybeSingle();
      if (requestError) throw requestError;
      if (!editRequest) return jsonResponse({ error: "Edit request not found." }, 404, origin);
      if (editRequest.status !== "pending") return invalid("This edit request is no longer pending.", origin);
      if (/^calling-card-d(?:[1-9]|10)$/.test(editRequest.site_id)) {
        const { data: publicationConfirmation, error: confirmationError } = await serviceClient
          .from("client_legal_acceptances")
          .select("id")
          .eq("edit_request_id", requestId)
          .eq("site_id", editRequest.site_id)
          .eq("user_id", editRequest.user_id)
          .eq("acceptance_type", "publication_confirmation")
          .eq("terms_version", "2026-10-26-v1")
          .eq("privacy_notice_version", "2026-10-26-v1")
          .eq("publication_confirmation", true)
          .limit(1)
          .maybeSingle();
        if (confirmationError) throw confirmationError;
        if (!publicationConfirmation) {
          return invalid("The client must confirm authorization and public display before this request can be reviewed.", origin);
        }
      }
      const productRequestError = validateProductRequestIds(editRequest);
      if (productRequestError) return invalid(productRequestError, origin);
      const { profileTable, productsTable } = await getSiteDataTables(serviceClient, editRequest.site_id);

      const [draftResult, profileResult, productsResult] = await Promise.all([
        serviceClient.from("site_content_drafts")
          .select("profile, products")
          .eq("site_id", editRequest.site_id)
          .maybeSingle(),
        serviceClient.from(profileTable)
          .select("*")
          .eq("site_id", editRequest.site_id)
          .maybeSingle(),
        serviceClient.from(productsTable)
          .select("id, name, description, price, image_url, alt, gallery, is_featured, sort_order")
          .eq("site_id", editRequest.site_id)
          .order("sort_order"),
      ]);
      if (draftResult.error) throw draftResult.error;
      if (profileResult.error) throw profileResult.error;
      if (productsResult.error) throw productsResult.error;

      const baseProfile = draftResult.data?.profile ?? Object.fromEntries(
        Object.entries(profileResult.data || {}).filter(([key]) => editableProfileFields.has(key)),
      );
      let profile = isObject(baseProfile) ? { ...baseProfile } : {};
      let products = (draftResult.data?.products ?? productsResult.data ?? []).map((product) => ({ ...product }));
      const { data: siteRequests, error: siteRequestsError } = await serviceClient
        .from("site_edit_requests")
        .select("id, request_type, fields, payload, created_at")
        .eq("site_id", editRequest.site_id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (siteRequestsError) throw siteRequestsError;
      const requestChanges = getLatestRequestChanges(siteRequests || [], profile, products);
      const changes = requestChanges.get(requestId) || [];
      const decisions = body.decisions;
      if (changes.length === 0) {
        if (Object.keys(decisions).length > 0) {
          return invalid("This request no longer contains changes from the current content. Refresh and review again.", origin);
        }
        const { data: completed, error } = await serviceClient.from("site_edit_requests")
          .update({ status: "completed", reviewed_at: new Date().toISOString(), email_status: "not_required" })
          .eq("id", requestId)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!completed) return invalid("This edit request is no longer pending.", origin);
        await recordActivity(editRequest.site_id, "edit_request_closed", "Closed an edit request because its requested values already match current content.");
        return jsonResponse({ ok: true, status: "completed", approved_count: 0, rejected_count: 0, email_sent: 0, email_warning: "" }, 200, origin);
      }
      const requestedKeys = Object.keys(decisions);
      const validKeys = new Set(changes.map((change) => String(change.key)));
      if (requestedKeys.length !== changes.length || requestedKeys.some((key) => !validKeys.has(key))) {
        return invalid("Submit a decision for every requested change. The site data may have changed; refresh and review again.", origin);
      }
      const accepted: Array<Record<string, unknown>> = [];
      const normalizedDecisions: Record<string, {
        decision: string;
        reason: string;
        label: string;
        old_value: unknown;
        new_value: unknown;
      }> = {};
      for (const change of changes) {
        const key = String(change.key);
        const submitted = decisions[key];
        if (!isObject(submitted) || !["approve", "reject"].includes(String(submitted.decision))) {
          return invalid(`Choose approve or reject for "${String(change.label)}".`, origin);
        }
        const reason = typeof submitted.reason === "string" ? submitted.reason.trim() : "";
        if (submitted.decision === "reject" && (!reason || reason.length > 2000)) {
          return invalid(`Enter a rejection reason (up to 2,000 characters) for "${String(change.label)}".`, origin);
        }
        normalizedDecisions[key] = {
          decision: String(submitted.decision),
          reason,
          label: String(change.label),
          old_value: change.old_value,
          new_value: change.new_value,
        };
        if (submitted.decision === "approve") accepted.push(change);
      }

      for (const change of accepted) {
        const key = String(change.key);
        if (key.startsWith("profile:custom_link:")) {
          const identity = decodeURIComponent(key.slice("profile:custom_link:".length));
          const links = Array.isArray(profile.custom_links) ? [...profile.custom_links] : [];
          const oldLink = change.old_value;
          const existingIndex = links.findIndex((link, index) => (
            (oldLink !== null && stableValue(link) === stableValue(oldLink))
            || customLinkIdentity(link, index) === identity
          ));
          if (change.new_value === null) {
            if (existingIndex >= 0) links.splice(existingIndex, 1);
          } else {
            const newLink = change.new_value;
            if (!isObject(newLink)) return invalid("The requested social or payment button is invalid.", origin);
            if (existingIndex >= 0) {
              links[existingIndex] = newLink;
            } else {
              const requestedIndex = Number.isInteger(change.new_index) ? Number(change.new_index) : links.length;
              links.splice(Math.min(Math.max(requestedIndex, 0), links.length), 0, newLink);
            }
          }
          profile.custom_links = links;
          continue;
        }
        if (key.startsWith("profile:")) {
          const field = key.slice("profile:".length);
          if (!editableProfileFields.has(field)) return invalid("The request contains an unsupported profile field.", origin);
          profile[field] = change.new_value;
          continue;
        }
        const match = key.match(/^product:([0-9a-f-]{36}):(create|delete|[a-z_]+)$/i);
        if (!match) return invalid("The request contains an unsupported product change.", origin);
        const [, productId, field] = match;
        if (field === "create") {
          if (!isObject(change.new_value)) return invalid("The requested product is invalid.", origin);
          products.push(change.new_value);
        } else if (field === "delete") {
          products = products.filter((product) => product.id !== productId);
        } else {
          if (!productReviewFields.includes(field as typeof productReviewFields[number])) {
            return invalid("The request contains an unsupported product field.", origin);
          }
          products = products.map((product) => product.id === productId
            ? { ...product, [field]: change.new_value }
            : product);
        }
      }
      const saveContentDraft = accepted.length > 0;
      if (saveContentDraft) {
        const validationError = validateDraft(profile, products);
        if (validationError) return invalid(validationError, origin);
      }

      const { data: reviewStatus, error: reviewError } = await serviceClient.rpc("review_site_edit_request", {
        target_request_id: requestId,
        actor_user_id: userResult.user.id,
        next_profile: profile,
        next_products: products,
        decisions: normalizedDecisions,
        save_content_draft: saveContentDraft,
      });
      if (reviewError) {
        if (reviewError.message.includes("no longer pending")) return invalid(reviewError.message, origin);
        throw reviewError;
      }
      await recordActivity(
        editRequest.site_id,
        "edit_request_reviewed",
        `Reviewed ${editRequest.client_email}'s request: ${accepted.length} change(s) approved to draft and ${changes.length - accepted.length} rejected.`,
      );
      let emailResult = { sent: 0, failed: 0, warning: "" };
      if (!saveContentDraft) {
        emailResult = await sendRejectedChangeEmails(serviceClient, editRequest.site_id);
      }
      return jsonResponse({
        ok: true,
        status: reviewStatus,
        approved_count: accepted.length,
        rejected_count: changes.length - accepted.length,
        email_sent: emailResult.sent,
        email_warning: emailResult.warning,
      }, 200, origin);
    }

    if (body.action === "retry_rejection_emails") {
      const siteId = String(body.site_id || "").trim();
      if (!siteId) return invalid("A site ID is required.", origin);
      const { data: site, error: siteError } = await serviceClient.from("managed_sites")
        .select("site_id")
        .eq("site_id", siteId)
        .maybeSingle();
      if (siteError) throw siteError;
      if (!site) return jsonResponse({ error: "Site not found." }, 404, origin);
      const { data: draft, error: draftError } = await serviceClient
        .from("site_content_drafts")
        .select("published_at")
        .eq("site_id", siteId)
        .maybeSingle();
      if (draftError) throw draftError;
      const result = await sendRejectedChangeEmails(serviceClient, siteId, draft?.published_at || null);
      return jsonResponse({ ok: true, ...result }, 200, origin);
    }

    if (body.action === "list_sites") {
      const { data: sites, error } = await serviceClient
        .from("managed_sites")
        .select("site_id, name, public_url, client_email, client_user_id, client_enabled, is_active, payment_status, profile_table, products_table, created_at, is_trial, trial_started_at, trial_ends_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const managedSites = sites || [];
      const profileTableNames = [...new Set(managedSites.map((site) => site.profile_table))];
      for (const tableName of profileTableNames) {
        if (!isAllowedDataTable(tableName, "profiles")) {
          throw new Error("A managed site has invalid profile table configuration.");
        }
      }
      const usageStart = new Date();
      usageStart.setUTCDate(usageStart.getUTCDate() - 6);
      const [profileResults, draftsResult, requestsResult, usageResult] = await Promise.all([
        Promise.all(profileTableNames.map(async (tableName) => {
          const { data, error: profileError } = await serviceClient.from(tableName)
            .select("site_id, name, business, phone, email, address, profile_image_url")
            .limit(5000);
          if (profileError) throw profileError;
          return data || [];
        })),
        serviceClient.from("site_content_drafts")
          .select("site_id, updated_at, published_at")
          .limit(5000),
        serviceClient.rpc("get_pending_site_request_summary"),
        serviceClient.from("site_trial_daily_usage")
          .select("site_id, visit_date, page_views, unique_visitors, last_visit_at")
          .gte("visit_date", usageStart.toISOString().slice(0, 10))
          .order("visit_date", { ascending: false })
          .limit(5000),
      ]);
      if (draftsResult.error) throw draftsResult.error;
      if (requestsResult.error) throw requestsResult.error;
      if (usageResult.error) throw usageResult.error;

      const profilesBySite = new Map([
        ...profileResults.flat(),
      ].map((profile) => [profile.site_id, profile]));
      const draftsBySite = new Map((draftsResult.data || []).map((draft) => [draft.site_id, draft]));
      const requestsBySite = new Map((requestsResult.data || []).map((request) => [
        request.site_id,
        { count: Number(request.pending_request_count), oldest_at: request.oldest_pending_request_at },
      ]));
      const usageBySite = new Map();
      for (const usage of usageResult.data || []) {
        const totals = usageBySite.get(usage.site_id) || {
          page_views: 0,
          unique_visitors: 0,
          last_visit_at: null,
        };
        totals.page_views += Number(usage.page_views || 0);
        totals.unique_visitors += Number(usage.unique_visitors || 0);
        if (!totals.last_visit_at || usage.last_visit_at > totals.last_visit_at) {
          totals.last_visit_at = usage.last_visit_at;
        }
        usageBySite.set(usage.site_id, totals);
      }

      const enrichedSites = (sites || []).map((site) => {
        const profile = profilesBySite.get(site.site_id);
        const draft = draftsBySite.get(site.site_id);
        const trialExpired = site.is_trial
          && (!site.trial_ends_at || new Date(site.trial_ends_at) <= new Date());
        const pendingRequests = requestsBySite.get(site.site_id) || { count: 0, oldest_at: null };
        const missingConfiguration = [];
        if (!site.public_url?.trim()) missingConfiguration.push("Public URL");
        else {
          try {
            if (new URL(site.public_url).protocol !== "https:") missingConfiguration.push("HTTPS URL");
          } catch {
            missingConfiguration.push("Valid public URL");
          }
        }
        if (!profile) {
          missingConfiguration.push("Profile");
        } else {
          if (!profile.name?.trim()) missingConfiguration.push("Contact name");
          if (!profile.business?.trim()) missingConfiguration.push("Business name");
        }
        const hasUnpublishedDraft = Boolean(
          draft && (!draft.published_at || draft.updated_at > draft.published_at),
        );
        return {
          ...site,
          is_active: site.is_active && !trialExpired,
          trial_expired: trialExpired,
          has_unpublished_draft: hasUnpublishedDraft,
          draft_updated_at: draft?.updated_at || null,
          published_at: draft?.published_at || null,
          pending_request_count: pendingRequests.count,
          oldest_pending_request_at: pendingRequests.oldest_at,
          usage_last_7_days: usageBySite.get(site.site_id) || {
            page_views: 0,
            unique_visitors: 0,
            last_visit_at: null,
          },
          missing_configuration: missingConfiguration,
          hosting_health: "not_monitored",
        };
      });
      return jsonResponse({ sites: enrichedSites }, 200, origin);
    }

    if (body.action === "get_site_editor") {
      const siteId = String(body.site_id || "").trim();
      if (!siteId) return invalid("A site ID is required.", origin);
      const { data: site, error: siteError } = await serviceClient.from("managed_sites")
        .select("site_id, name, payment_status, profile_table, products_table")
        .eq("site_id", siteId)
        .maybeSingle();
      if (siteError) throw siteError;
      if (!site) return jsonResponse({ error: "Site not found." }, 404, origin);
      if (!isAllowedDataTable(site.profile_table, "profiles")
        || !isAllowedDataTable(site.products_table, "products")) {
        throw new Error(`Managed site "${siteId}" has invalid profile or product table configuration.`);
      }
      const [
        profileResult,
        productsResult,
        draftResult,
        requestsResult,
        emailFollowupsResult,
      ] = await Promise.all([
        serviceClient.from(site.profile_table)
          .select("*")
          .eq("site_id", siteId)
          .maybeSingle(),
        serviceClient.from(site.products_table)
          .select("id, name, description, price, image_url, alt, gallery, is_featured, sort_order")
          .eq("site_id", siteId)
          .order("sort_order"),
        serviceClient.from("site_content_drafts")
          .select("profile, products, updated_at, published_at")
          .eq("site_id", siteId)
          .maybeSingle(),
        serviceClient.from("site_edit_requests")
          .select("id, site_id, client_email, request_type, fields, payload, notes, status, created_at, review_decisions, email_status, email_error")
          .eq("site_id", siteId)
          .order("created_at", { ascending: false })
          .limit(1000),
        serviceClient.from("site_edit_requests")
          .select("id, client_email, status, email_status, email_error, reviewed_at")
          .eq("site_id", siteId)
          .in("status", ["approved", "rejected"])
          .in("email_status", ["pending", "failed"])
          .order("reviewed_at", { ascending: false })
          .limit(50),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (productsResult.error) throw productsResult.error;
      if (draftResult.error) throw draftResult.error;
      if (requestsResult.error) throw requestsResult.error;
      if (emailFollowupsResult.error) throw emailFollowupsResult.error;
      const currentProfile = draftResult.data?.profile ?? profileResult.data ?? {};
      const currentProducts = draftResult.data?.products ?? productsResult.data ?? [];
      const reviewableChanges = getLatestRequestChanges(requestsResult.data || [], currentProfile, currentProducts);
      return jsonResponse({
        site: {
          site_id: site.site_id,
          name: site.name,
          payment_status: site.payment_status,
        },
        profile: currentProfile,
        products: currentProducts,
        live_profile: profileResult.data || {},
        live_products: productsResult.data || [],
        requests: (requestsResult.data || [])
          .filter((request) => request.status === "pending")
          .map((request) => ({
            ...request,
            changes: reviewableChanges.get(String(request.id)) || [],
          })),
        email_followups: (emailFollowupsResult.data || []).filter((request) => (
          request.status === "rejected"
          || (
            draftResult.data?.published_at
            && request.reviewed_at
            && new Date(request.reviewed_at) <= new Date(draftResult.data.published_at)
          )
        )),
        has_draft: Boolean(draftResult.data),
        draft_updated_at: draftResult.data?.updated_at || null,
        published_at: draftResult.data?.published_at || null,
      }, 200, origin);
    }

    if (body.action === "save_site_draft") {
      const siteId = String(body.site_id || "").trim();
      if (!siteId) return invalid("A site ID is required.", origin);
      const validationError = validateDraft(body.profile, body.products);
      if (validationError) return invalid(validationError, origin);
      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("site_id")
        .eq("site_id", siteId)
        .maybeSingle();
      if (siteError) throw siteError;
      if (!site) return jsonResponse({ error: "Site not found." }, 404, origin);
      const editableProfile = Object.fromEntries(
        Object.entries(body.profile as Record<string, unknown>)
          .filter(([key]) => editableProfileFields.has(key)),
      );
      const { data: draft, error } = await serviceClient
        .from("site_content_drafts")
        .upsert({
          site_id: siteId,
          profile: editableProfile,
          products: body.products as Record<string, unknown>[],
          updated_by: userResult.user.id,
          updated_at: new Date().toISOString(),
          published_at: null,
        }, { onConflict: "site_id" })
        .select("updated_at")
        .single();
      if (error) throw error;
      await recordActivity(siteId, "content_draft_saved", "Saved a private profile and product draft.");
      return jsonResponse({ ok: true, draft_updated_at: draft.updated_at }, 200, origin);
    }

    if (body.action === "publish_site_draft") {
      const siteId = String(body.site_id || "").trim();
      if (!siteId) return invalid("A site ID is required.", origin);
      const { error } = await serviceClient.rpc("publish_site_content_draft", {
        target_site_id: siteId,
        actor_user_id: userResult.user.id,
      });
      if (error) {
        if (error.message.includes("Save a draft")) return invalid(error.message, origin);
        if (error.message.includes("Site not found")) return jsonResponse({ error: error.message }, 404, origin);
        throw error;
      }
      await recordActivity(siteId, "content_published", "Published the saved profile and product draft to the live card.");
      const { data: publishedDraft, error: publishedDraftError } = await serviceClient
        .from("site_content_drafts")
        .select("published_at")
        .eq("site_id", siteId)
        .maybeSingle();
      if (publishedDraftError) throw publishedDraftError;
      const emailResult = await sendRejectedChangeEmails(serviceClient, siteId, publishedDraft?.published_at || null);
      return jsonResponse({
        ok: true,
        published_at: new Date().toISOString(),
        rejection_emails_sent: emailResult.sent,
        rejection_email_warning: emailResult.warning,
      }, 200, origin);
    }

    if (body.action === "get_dashboard_data") {
      const [activityResult, requestsResult] = await Promise.all([
        serviceClient
          .from("super_admin_activity")
          .select("id, site_id, actor_email, action, description, created_at")
          .order("created_at", { ascending: false })
          .limit(12),
        serviceClient
          .from("site_edit_requests")
          .select("id, site_id, client_email, request_type, fields, payload, notes, status, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (activityResult.error) throw activityResult.error;
      if (requestsResult.error) throw requestsResult.error;
      return jsonResponse({
        activity: activityResult.data || [],
        requests: requestsResult.data || [],
      }, 200, origin);
    }

    if (body.action === "create_site") {
      const siteId = String(body.site_id || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const isTrial = body.is_trial === true;
      const trialDays = Number(body.trial_days);
      const publicUrl = isTrial
        ? `https://calling-card-d10.web.app/?site_id=${encodeURIComponent(siteId)}`
        : String(body.public_url || "").trim();
      const email = String(body.client_email || "").trim().toLowerCase();
      const password = body.password;
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(siteId) || siteId === "main") {
        return invalid("Use a site ID with 2–40 lowercase letters, numbers, or hyphens. The main site ID is reserved.", origin);
      }
      if (!name || name.length > 120) return invalid("Enter a site name up to 120 characters.", origin);
      if (isTrial && (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 30)) {
        return invalid("Choose a trial length between 1 and 30 days.", origin);
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(publicUrl);
      } catch {
        return invalid("Enter a valid public site URL.", origin);
      }
      if (parsedUrl.protocol !== "https:") return invalid("Site URLs must use HTTPS.", origin);
      if (parsedUrl.username || parsedUrl.password) return invalid("Site URLs cannot contain a username or password.", origin);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid("Enter a valid client email address.", origin);
      if (!isValidClientPassword(password)) return invalid("Choose a client password between 12 and 128 characters.", origin);
      const { data: existingSite, error: existingSiteError } = await serviceClient
        .from("managed_sites")
        .select("site_id")
        .eq("site_id", siteId)
        .maybeSingle();
      if (existingSiteError) throw existingSiteError;
      if (existingSite) return invalid("That site ID already exists.", origin);

      const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { force_password_change: false },
      });
      if (createUserError) {
        return jsonResponse({ error: `Could not create client login: ${createUserError.message}` }, 400, origin);
      }

      const userId = createdUser.user.id;
      const { error: siteError } = await serviceClient.rpc("provision_managed_site", {
        target_site_id: siteId,
        target_name: name,
        target_public_url: parsedUrl.toString(),
        target_client_email: email,
        target_client_user_id: userId,
      });
      if (siteError) {
        const userCleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), userId);
        if (!userCleanupSucceeded) {
          console.error("Could not remove client account after site provisioning failed:", siteError.message);
          return jsonResponse({ error: "Site setup failed and the new client login could not be removed. Contact the system administrator." }, 500, origin);
        }
        return jsonResponse({
          error: siteError.code === "23505"
            ? "That site ID or generated table name is already registered. Choose a different site ID."
            : "Could not provision the site's isolated database tables and client assignment.",
        }, 400, origin);
      }

      let trialStartedAt: string | null = null;
      let trialEndsAt: string | null = null;
      if (isTrial) {
        const startedAt = new Date();
        const endsAt = new Date(startedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const { data: updatedSite, error: trialError } = await serviceClient
          .from("managed_sites")
          .update({
            is_trial: true,
            trial_started_at: startedAt.toISOString(),
            trial_ends_at: endsAt.toISOString(),
          })
          .eq("site_id", siteId)
          .select("site_id")
          .maybeSingle();
        if (trialError || !updatedSite) {
          const { error: siteCleanupError } = await serviceClient
            .from("managed_sites")
            .delete()
            .eq("site_id", siteId);
          const userCleanupSucceeded = await deleteCreatedUser(
            (id) => serviceClient.auth.admin.deleteUser(id),
            userId,
          );
          if (siteCleanupError || !userCleanupSucceeded) {
            console.error("Could not fully roll back prospect trial creation:", siteCleanupError?.message || "Client user cleanup failed.");
            return jsonResponse({
              error: "Trial setup failed and cleanup was incomplete. Contact the system administrator before creating this site again.",
            }, 500, origin);
          }
          if (trialError) throw trialError;
          return invalid("Trial setup failed because the new site could not be updated.", origin);
        }
        trialStartedAt = startedAt.toISOString();
        trialEndsAt = endsAt.toISOString();
      }

      await recordActivity(
        siteId,
        isTrial ? "prospect_trial_created" : "site_created",
        isTrial
          ? `Created a ${trialDays}-day prospect preview for ${name}; assigned client access to ${email}.`
          : `Created ${name} and assigned client access to ${email}.`,
      );
      const tableSuffix = siteId.replace(/^calling-card-/, "").replace(/-/g, "_");
      return jsonResponse({
        site: {
          site_id: siteId,
          name,
          public_url: parsedUrl.toString(),
          client_email: email,
          client_user_id: userId,
          client_enabled: true,
          is_active: true,
          is_trial: isTrial,
          trial_started_at: trialStartedAt,
          trial_ends_at: trialEndsAt,
          profile_table: `calling_card_${tableSuffix}_profiles`,
          products_table: `calling_card_${tableSuffix}_products`,
        },
      }, 201, origin);
    }

    if (body.action === "assign_client") {
      const siteId = String(body.site_id || "").trim();
      const email = String(body.client_email || "").trim().toLowerCase();
      const password = body.password;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return invalid("Enter a valid client email address.", origin);
      if (!isValidClientPassword(password)) return invalid("Choose a client password between 12 and 128 characters.", origin);
      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("site_id, name, public_url, client_user_id")
        .eq("site_id", siteId)
        .single();
      if (siteError) return jsonResponse({ error: "Site not found." }, 404, origin);
      if (site.client_user_id) return invalid("Revoke the current client login before assigning another one.", origin);

      const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { force_password_change: false },
      });
      if (createUserError) {
        return jsonResponse({ error: `Could not create client login: ${createUserError.message}` }, 400, origin);
      }
      const userId = createdUser.user.id;
      const { error: assignmentError } = await serviceClient.from("site_admins").insert({ site_id: siteId, user_id: userId });
      if (assignmentError) {
        const cleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), userId);
        if (!cleanupSucceeded) return jsonResponse({ error: "Login assignment failed and the account could not be removed. Contact the system administrator." }, 500, origin);
        throw assignmentError;
      }
      const { data: updatedSite, error: siteUpdateError } = await serviceClient.from("managed_sites").update({
        client_email: email,
        client_user_id: userId,
        updated_at: new Date().toISOString(),
      }).eq("site_id", siteId).is("client_user_id", null).select("site_id").maybeSingle();
      if (siteUpdateError || !updatedSite) {
        const { error: assignmentCleanupError } = await serviceClient
          .from("site_admins")
          .delete()
          .eq("site_id", siteId)
          .eq("user_id", userId);
        const cleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), userId);
        if (assignmentCleanupError || !cleanupSucceeded) {
          console.error("Could not fully roll back client assignment:", assignmentCleanupError?.message || "Client user cleanup failed.");
          return jsonResponse({ error: "Login assignment failed and cleanup was incomplete. Contact the system administrator." }, 500, origin);
        }
        if (siteUpdateError) throw siteUpdateError;
        return invalid("A client login was assigned to this site by another request. Refresh and try again.", origin);
      }
      await recordActivity(siteId, "client_assigned", `Assigned client access to ${email}.`);
      return jsonResponse({ site: { ...site, client_email: email, client_user_id: userId } }, 201, origin);
    }

    if (body.action === "set_site_active") {
      const siteId = String(body.site_id || "").trim();
      const active = body.is_active;
      if (!siteId || typeof active !== "boolean") return invalid("A site ID and active status are required.", origin);
      if (active) {
        const { data: site, error: siteError } = await serviceClient
          .from("managed_sites")
          .select("is_trial, trial_ends_at")
          .eq("site_id", siteId)
          .maybeSingle();
        if (siteError) throw siteError;
        if (!site) return jsonResponse({ error: "Site not found." }, 404, origin);
        if (site.is_trial && (!site.trial_ends_at || new Date(site.trial_ends_at) <= new Date())) {
          return invalid("This trial has expired. Extend the trial before activating the site.", origin);
        }
      }
      const { data: updatedSite, error } = await serviceClient
        .from("managed_sites")
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq("site_id", siteId)
        .select("site_id")
        .maybeSingle();
      if (error) throw error;
      if (!updatedSite) return jsonResponse({ error: "Site not found." }, 404, origin);
      await recordActivity(siteId, "site_status_changed", `Set site availability to ${active ? "active" : "paused"}.`);
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (body.action === "start_trial") {
      const siteId = String(body.site_id || "").trim();
      const trialDays = Number(body.trial_days);
      if (!siteId || !Number.isInteger(trialDays) || trialDays < 1 || trialDays > 30) {
        return invalid("Choose a trial length between 1 and 30 days.", origin);
      }
      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("name, is_trial, is_active")
        .eq("site_id", siteId)
        .maybeSingle();
      if (siteError) throw siteError;
      if (!site) return jsonResponse({ error: "Site not found." }, 404, origin);
      if (site.is_trial) return invalid("This site is already on a trial.", origin);
      if (!site.is_active) return invalid("Activate this site before starting a trial.", origin);

      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      const { data: updatedSite, error: updateError } = await serviceClient
        .from("managed_sites")
        .update({
          is_trial: true,
          trial_started_at: startedAt.toISOString(),
          trial_ends_at: endsAt.toISOString(),
          updated_at: startedAt.toISOString(),
        })
        .eq("site_id", siteId)
        .eq("is_trial", false)
        .eq("is_active", true)
        .select("site_id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedSite) return invalid("The site changed before the trial could start. Refresh and try again.", origin);
      await recordActivity(siteId, "prospect_trial_created", `Started a ${trialDays}-day trial for existing site ${site.name}.`);
      return jsonResponse({ ok: true, trial_started_at: startedAt.toISOString(), trial_ends_at: endsAt.toISOString() }, 200, origin);
    }

    if (body.action === "extend_trial") {
      const siteId = String(body.site_id || "").trim();
      const trialDays = Number(body.trial_days);
      if (!siteId || !Number.isInteger(trialDays) || trialDays < 1 || trialDays > 30) {
        return invalid("Choose a trial extension between 1 and 30 days.", origin);
      }
      const { data: site, error } = await serviceClient
        .from("managed_sites")
        .select("name, is_trial, trial_ends_at")
        .eq("site_id", siteId)
        .maybeSingle();
      if (error) throw error;
      if (!site) return jsonResponse({ error: "Site not found." }, 404, origin);
      if (!site.is_trial) return invalid("This site is no longer a trial.", origin);
      const baseTime = site.trial_ends_at && new Date(site.trial_ends_at) > new Date()
        ? new Date(site.trial_ends_at)
        : new Date();
      const nextEnd = new Date(baseTime.getTime() + trialDays * 24 * 60 * 60 * 1000);
      const { error: updateError } = await serviceClient
        .from("managed_sites")
        .update({
          trial_ends_at: nextEnd.toISOString(),
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("site_id", siteId);
      if (updateError) throw updateError;
      await recordActivity(siteId, "prospect_trial_extended", `Extended ${site.name}'s preview by ${trialDays} days.`);
      return jsonResponse({ ok: true, trial_ends_at: nextEnd.toISOString() }, 200, origin);
    }

    if (body.action === "set_payment_status") {
      const siteId = String(body.site_id || "").trim();
      const paymentStatus = body.payment_status;
      if (!siteId || !["none", "awaiting_payment", "paid"].includes(String(paymentStatus))) {
        return invalid("A site ID and valid payment status are required.", origin);
      }
      const { data: currentSite, error: currentSiteError } = await serviceClient
        .from("managed_sites")
        .select("name, is_trial")
        .eq("site_id", siteId)
        .maybeSingle();
      if (currentSiteError) throw currentSiteError;
      if (!currentSite) return jsonResponse({ error: "Site not found." }, 404, origin);
      const siteChanges = paymentStatus === "paid" && currentSite.is_trial
        ? {
          payment_status: paymentStatus,
          is_trial: false,
          trial_started_at: null,
          trial_ends_at: null,
          is_active: true,
          updated_at: new Date().toISOString(),
        }
        : { payment_status: paymentStatus, updated_at: new Date().toISOString() };
      const { data: site, error } = await serviceClient
        .from("managed_sites")
        .update(siteChanges)
        .eq("site_id", siteId)
        .select("name")
        .maybeSingle();
      if (error) throw error;
      if (!site) return jsonResponse({ error: "Site not found." }, 404, origin);
      const descriptions = {
        none: "Cleared payment follow-up",
        awaiting_payment: "Marked as awaiting payment before publishing",
        paid: "Marked payment as received",
      };
      await recordActivity(siteId, "payment_status_changed", `${descriptions[String(paymentStatus) as keyof typeof descriptions]} for ${site.name}.`);
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (body.action === "reset_client_password") {
      const siteId = String(body.site_id || "").trim();
      const password = body.password;
      if (!isValidClientPassword(password)) return invalid("Choose a client password between 12 and 128 characters.", origin);
      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("client_user_id, name")
        .eq("site_id", siteId)
        .single();
      if (siteError || !site?.client_user_id) return invalid("No client login is assigned to this site.", origin);
      const { data: userData, error: getUserError } = await serviceClient.auth.admin.getUserById(site.client_user_id);
      if (getUserError) throw getUserError;
      const { error } = await serviceClient.auth.admin.updateUserById(site.client_user_id, {
        password,
        app_metadata: {
          ...userData.user.app_metadata,
          force_password_change: false,
        },
      });
      if (error) throw error;
      await recordActivity(siteId, "client_password_reset", `Reset the client login password for ${site.name}.`);
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (body.action === "replace_client_login") {
      const siteId = String(body.site_id || "").trim();
      const email = String(body.client_email || "").trim().toLowerCase();
      const password = body.password;
      if (!siteId) return invalid("A site ID is required.", origin);
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return invalid("Enter a valid client email address.", origin);
      }
      if (!isValidClientPassword(password)) return invalid("Choose a client password between 12 and 128 characters.", origin);

      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("client_user_id, client_email, name")
        .eq("site_id", siteId)
        .maybeSingle();
      if (siteError) throw siteError;
      if (!site?.client_user_id) return invalid("No client login is assigned to this site.", origin);
      if (site.client_email.trim().toLowerCase() === email) {
        return invalid("Enter a different email address from the current client login.", origin);
      }

      const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { force_password_change: false },
      });
      if (createUserError) {
        return jsonResponse({ error: `Could not create the replacement client login: ${createUserError.message}` }, 400, origin);
      }
      const newUserId = createdUser.user.id;

      const { error: assignmentError } = await serviceClient.from("site_admins").insert({
        site_id: siteId,
        user_id: newUserId,
      });
      if (assignmentError) {
        const cleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), newUserId);
        if (!cleanupSucceeded) {
          console.error("Could not remove replacement account after assignment failed:", assignmentError.message);
          return jsonResponse({ error: "Login assignment failed and the new account could not be removed. Contact the system administrator." }, 500, origin);
        }
        throw assignmentError;
      }

      const { data: updatedSite, error: siteUpdateError } = await serviceClient
        .from("managed_sites")
        .update({
          client_email: email,
          client_user_id: newUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("site_id", siteId)
        .eq("client_user_id", site.client_user_id)
        .select("site_id")
        .maybeSingle();
      if (siteUpdateError || !updatedSite) {
        const { error: assignmentCleanupError } = await serviceClient.from("site_admins")
          .delete()
          .eq("site_id", siteId)
          .eq("user_id", newUserId);
        const cleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), newUserId);
        if (assignmentCleanupError || !cleanupSucceeded) {
          console.error("Replacement login rollback failed:", assignmentCleanupError?.message || "Client user cleanup failed.");
          return jsonResponse({ error: "Login assignment failed and cleanup was incomplete. Contact the system administrator." }, 500, origin);
        }
        if (siteUpdateError) throw siteUpdateError;
        return invalid("The client assignment changed while this request was processing. Refresh and try again.", origin);
      }

      const { error: oldAssignmentError } = await serviceClient.from("site_admins")
        .delete()
        .eq("site_id", siteId)
        .eq("user_id", site.client_user_id);
      if (oldAssignmentError) {
        const { error: siteRollbackError } = await serviceClient.from("managed_sites")
          .update({
            client_email: site.client_email,
            client_user_id: site.client_user_id,
            updated_at: new Date().toISOString(),
          })
          .eq("site_id", siteId)
          .eq("client_user_id", newUserId);
        const { error: assignmentCleanupError } = await serviceClient.from("site_admins")
          .delete()
          .eq("site_id", siteId)
          .eq("user_id", newUserId);
        const cleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), newUserId);
        if (siteRollbackError || assignmentCleanupError || !cleanupSucceeded) {
          console.error("Replacement login rollback failed:", siteRollbackError?.message || assignmentCleanupError?.message || "Client user cleanup failed.");
          return jsonResponse({ error: "The new login was created but the old site access could not be safely removed or rolled back. Contact the system administrator." }, 500, origin);
        }
        throw oldAssignmentError;
      }

      await recordActivity(siteId, "client_login_replaced", `Replaced the site client login with ${email}; the previous account remains available for other sites.`);
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (body.action === "restore_client") {
      const siteId = String(body.site_id || "").trim();
      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("client_user_id, client_enabled")
        .eq("site_id", siteId)
        .single();
      if (siteError) return jsonResponse({ error: "Site not found." }, 404, origin);
      if (!site.client_user_id) return invalid("Create a client login for this site first.", origin);
      const { error: assignmentError } = await serviceClient
        .from("site_admins")
        .upsert({ site_id: siteId, user_id: site.client_user_id }, { onConflict: "site_id,user_id", ignoreDuplicates: true });
      if (assignmentError) throw assignmentError;
      const { data: updatedSite, error } = await serviceClient
        .from("managed_sites")
        .update({ client_enabled: true, updated_at: new Date().toISOString() })
        .eq("site_id", siteId)
        .select("site_id")
        .maybeSingle();
      if (error) throw error;
      if (!updatedSite) return jsonResponse({ error: "Site not found." }, 404, origin);
      await recordActivity(siteId, "client_access_restored", "Restored client access.");
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (body.action === "revoke_client") {
      const siteId = String(body.site_id || "").trim();
      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("client_user_id")
        .eq("site_id", siteId)
        .single();
      if (siteError) return jsonResponse({ error: "Site not found." }, 404, origin);
      if (!site.client_user_id) return invalid("No client login is assigned to this site.", origin);
      const { error: assignmentError } = await serviceClient
        .from("site_admins")
        .delete()
        .eq("site_id", siteId)
        .eq("user_id", site.client_user_id);
      if (assignmentError) throw assignmentError;
      const { data: updatedSite, error } = await serviceClient
        .from("managed_sites")
        .update({ client_enabled: false, updated_at: new Date().toISOString() })
        .eq("site_id", siteId)
        .select("site_id")
        .maybeSingle();
      if (error) throw error;
      if (!updatedSite) return jsonResponse({ error: "Site not found." }, 404, origin);
      await recordActivity(siteId, "client_access_revoked", "Revoked client access.");
      return jsonResponse({ ok: true }, 200, origin);
    }

    
    if (body.action === "digi_chat") {
      const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicApiKey) {
        return jsonResponse({ error: "Anthropic API key is not configured in Supabase Secrets." }, 500, origin);
      }

      const prompt = String(body.prompt || "").trim();
      const chatHistory = Array.isArray(body.history) ? body.history : [];
      const userContext = isObject(body.current_context) ? body.current_context : {};
      if (!prompt) return invalid("Message prompt is required.", origin);

      // Fetch fresh system snapshot for DIGI including templates
      const { data: allSites } = await serviceClient
        .from("managed_sites")
        .select("site_id, name, is_active, is_trial, trial_started_at, trial_ends_at, payment_status, client_email, profile_table, products_table");

      const usageStart = new Date();
      usageStart.setUTCDate(usageStart.getUTCDate() - 6);
      const { data: usageData } = await serviceClient
        .from("site_trial_daily_usage")
        .select("site_id, page_views, unique_visitors")
        .gte("visit_date", usageStart.toISOString().slice(0, 10));

      const { data: pendingRequests } = await serviceClient
        .from("site_edit_requests")
        .select("id, site_id, client_email, request_type, status, created_at")
        .eq("status", "pending");

      const systemContext = {
        registered_sites: (allSites || []).map((s: { site_id: string; name: string; is_active: boolean; is_trial: boolean; profile_table: string }) => ({
          site_id: s.site_id,
          name: s.name,
          is_active: s.is_active,
          is_trial: s.is_trial,
          table: s.profile_table
        })),
        pending_edit_requests: (pendingRequests || []).map((r: { site_id: string; client_email: string; request_type: string; created_at: string }) => ({
          site_id: r.site_id,
          client: r.client_email,
          type: r.request_type,
          created_at: r.created_at
        })),
        recent_trial_views: (usageData || []).reduce((acc: { views: number; visitors: number }, u: { page_views: number; unique_visitors: number }) => {
          acc.views = (acc.views || 0) + Number(u.page_views || 0);
          acc.visitors = (acc.visitors || 0) + Number(u.unique_visitors || 0);
          return acc;
        }, { views: 0, visitors: 0 })
      };

      const systemPrompt = `You are DIGI, the dedicated AI assistant for Digiworld (handling Digipen NFC, Digi Card NFC, and digital calling cards).
You live inside the Super Admin control center.

CURRENT SCREEN & CONTEXT OF THE USER:
${JSON.stringify(userContext, null, 2)}
IMPORTANT: If the user is currently editing a site (e.g. userContext.editing_site_id is "${userContext.editing_site_id || ''}") and says things like "put a name aljon", "change phone to 0912...", "update description", or "empty this site", THEY ARE REFERRING TO THE CURRENT SITE THEY ARE EDITING (${userContext.editing_site_id || 'none currently open'})! You DO NOT need to ask them which site or where to put it—apply it directly to userContext.editing_site_id!

DATABASE FIRST:
All site data lives in the database. When the user asks about a site (like "Aljon Contacts" or "calling-card-d4"), DO NOT fetch external website URLs via HTTP. Use the "get_site_details" or "copy_site_content" tool to inspect and copy database records directly!

You have full tools to:
1. "get_site_details": Read any site's current live profile, products, and custom links from the database.
2. "copy_site_content": Copy all profile info, products, social buttons, and payment methods from one site (e.g. aljon-contacts) directly into another site's draft (e.g. calling-card-d4).
3. "clear_site_data": Clear or reset a site's draft completely back to empty (clears all profile fields, social links, payment QR buttons, and products). Use this immediately when the user asks to "clear", "empty", or "reset" a site or template!
4. "update_site_draft": Update specific profile fields for any site.
5. Report platform stats, trials, and active sites.

Live registered sites:
${JSON.stringify(systemContext, null, 2)}

When the user asks to copy details from Aljon Contacts to calling-card-d4, call "copy_site_content".
When the user asks to clear, reset, or empty calling-card-d4 (or the currently open site), call "clear_site_data" directly!`;

      const tools = [
        {
          name: "get_site_details",
          description: "Read the full database profile and products of any site using its site_id (e.g. aljon-contacts, calling-card-d4)",
          input_schema: {
            type: "object",
            properties: {
              site_id: { type: "string", description: "The site_id to inspect" }
            },
            required: ["site_id"]
          }
        },
        {
          name: "clear_site_data",
          description: "Completely clear and empty all data (profile, social links, buttons, payment methods, and products) from a site draft or reset it back to empty.",
          input_schema: {
            type: "object",
            properties: {
              site_id: { type: "string", description: "The site_id to clear, e.g. calling-card-d4" }
            },
            required: ["site_id"]
          }
        },
        {
          name: "copy_site_content",
          description: "Copy full profile details, links, social buttons, and products from one site to another site draft",
          input_schema: {
            type: "object",
            properties: {
              from_site_id: { type: "string", description: "Source site_id, e.g. aljon-contacts" },
              to_site_id: { type: "string", description: "Destination site_id, e.g. calling-card-d4" }
            },
            required: ["from_site_id", "to_site_id"]
          }
        },
        {
          name: "update_site_draft",
          description: "Update the draft profile fields of any registered site or template in the database",
          input_schema: {
            type: "object",
            properties: {
              site_id: { type: "string", description: "The site_id to update, e.g. calling-card-d4" },
              name: { type: "string", description: "Person name / contact person" },
              business: { type: "string", description: "Business name" },
              role: { type: "string", description: "Role or title" },
              phone: { type: "string", description: "Phone number" },
              email: { type: "string", description: "Public email" },
              address: { type: "string", description: "Physical address" },
              description: { type: "string", description: "Business bio / description" },
              facebook: { type: "string", description: "Facebook URL" },
              eyebrow: { type: "string", description: "Tagline or category" }
            },
            required: ["site_id"]
          }
        }
      ];

      const messages: Array<{ role: string; content: any }> = [
        ...chatHistory.slice(-6).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt }
      ];

      // Initial Call
      let claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-5-5",
          max_tokens: 1024,
          system: systemPrompt,
          tools,
          messages
        })
      });

      if (!claudeResponse.ok) {
        const errText = await claudeResponse.text();
        return jsonResponse({ error: "Anthropic error: " + errText }, 502, origin);
      }

      let claudeData = await claudeResponse.json();

      // Handle tool calls in a loop (up to 3 turns)
      let turns = 0;
      let lastUpdatedSiteId: string | null = null;
      while (claudeData.stop_reason === "tool_use" && turns < 3) {
        turns++;
        const toolUseBlock = claudeData.content?.find((c: { type: string }) => c.type === "tool_use");
        if (!toolUseBlock) break;

        let toolResultText = "";
        if (toolUseBlock.name === "get_site_details") {
          try {
            const sid = String(toolUseBlock.input?.site_id || "").toLowerCase().trim();
            const target = (allSites || []).find((s: { site_id: string }) => s.site_id === sid);
            if (!target) {
              toolResultText = "Site not found in managed_sites.";
            } else {
              const { data: prof } = await serviceClient.from(target.profile_table).select("*").maybeSingle();
              const { data: prods } = await serviceClient.from(target.products_table).select("*");
              const { data: draft } = await serviceClient.from("site_content_drafts").select("*").eq("site_id", sid).maybeSingle();
              toolResultText = JSON.stringify({
                profile: draft?.profile || prof || {},
                products: draft?.products || prods || []
              });
            }
          } catch (e) {
            toolResultText = "Error getting site details: " + String(e);
          }
        } else if (toolUseBlock.name === "clear_site_data") {
          try {
            const sid = String(toolUseBlock.input?.site_id || userContext.editing_site_id || "").toLowerCase().trim();
            const target = (allSites || []).find((s: { site_id: string }) => s.site_id === sid);
            if (!target) {
              toolResultText = `Site ${sid} was not found in managed sites.`;
            } else {
              const emptyProfile = {
                name: "",
                business: "",
                role: "",
                eyebrow: "",
                phone: "",
                phone_link: "",
                email: "",
                address: "",
                address_link: "",
                facebook: "",
                youtube: "",
                description: "",
                profile_image_url: "",
                site_title: "",
                site_icon_url: "",
                theme_mode: "pitch-black",
                custom_qr_url: "",
                custom_links: []
              };
              const emptyProducts: any[] = [];
              const nowIso = new Date().toISOString();

              const { error: clearErr } = await serviceClient
                .from("site_content_drafts")
                .upsert({
                  site_id: sid,
                  profile: emptyProfile,
                  products: emptyProducts,
                  updated_by: userResult.user.id,
                  updated_at: nowIso,
                  published_at: null
                }, { onConflict: "site_id" });

              if (clearErr) throw clearErr;
              lastUpdatedSiteId = sid;
              await recordActivity(sid, "digi_content_cleared", `DIGI AI cleared all draft data for ${sid}.`);
              toolResultText = `Successfully cleared all data (profile details, social links, buttons, payment QR codes, and products) from ${sid}. The draft is now completely empty.`;
            }
          } catch (err) {
            toolResultText = "Error clearing site data: " + String(err);
          }
        } else if (toolUseBlock.name === "copy_site_content") {
          try {
            const fromId = String(toolUseBlock.input?.from_site_id || "").toLowerCase().trim();
            const toId = String(toolUseBlock.input?.to_site_id || userContext.editing_site_id || "").toLowerCase().trim();

            const fromSite = (allSites || []).find((s: { site_id: string }) => s.site_id === fromId);
            const toSite = (allSites || []).find((s: { site_id: string }) => s.site_id === toId);

            if (!fromSite || !toSite) {
              toolResultText = `Could not find site: ${!fromSite ? fromId : toId} in managed sites.`;
            } else {
              // Fetch source profile & products
              const { data: sourceProf } = await serviceClient.from(fromSite.profile_table).select("*").maybeSingle();
              const { data: sourceProds } = await serviceClient.from(fromSite.products_table).select("*");
              const { data: sourceDraft } = await serviceClient.from("site_content_drafts").select("*").eq("site_id", fromId).maybeSingle();

              const rawProfile = sourceDraft?.profile || sourceProf || {};
              const rawProducts = sourceDraft?.products || sourceProds || [];

              // Strip system keys and ensure only valid editable fields
              const finalProfile = Object.fromEntries(
                Object.entries(rawProfile).filter(([k]) => editableProfileFields.has(k))
              );

              // Normalize products
              const finalProducts = (Array.isArray(rawProducts) ? rawProducts : []).map((p: any) => ({
                id: p.id,
                name: p.name || "",
                price: p.price || "",
                description: p.description || "",
                image_url: p.image_url || "",
                alt: p.alt || "",
                gallery: Array.isArray(p.gallery) ? p.gallery : [],
                is_featured: Boolean(p.is_featured),
                sort_order: p.sort_order || 0
              }));

              const nowIso = new Date().toISOString();
              const { error: copyErr } = await serviceClient
                .from("site_content_drafts")
                .upsert({
                  site_id: toId,
                  profile: finalProfile,
                  products: finalProducts,
                  updated_by: userResult.user.id,
                  updated_at: nowIso,
                  published_at: null
                }, { onConflict: "site_id" });

              if (copyErr) throw copyErr;
              lastUpdatedSiteId = toId;
              await recordActivity(toId, "digi_content_copied", `DIGI AI copied full site content from ${fromId}.`);
              toolResultText = `Successfully copied profile information, products, social buttons, and payment methods from ${fromId} to ${toId}. The draft has been saved on ${toId} and is ready for review and publishing in the editor.`;
            }
          } catch (e) {
            toolResultText = "Error copying site content: " + String(e);
          }
        } else if (toolUseBlock.name === "update_site_draft") {
          try {
            const targetSiteId = String(toolUseBlock.input?.site_id || userContext.editing_site_id || "").toLowerCase().trim();
            const { site_id, ...profileFields } = toolUseBlock.input || {};

            const { data: existingDraft } = await serviceClient
              .from("site_content_drafts")
              .select("profile, products")
              .eq("site_id", targetSiteId)
              .maybeSingle();

            const filteredFields = Object.fromEntries(
              Object.entries(profileFields).filter(([k]) => editableProfileFields.has(k))
            );

            const mergedProfile = { ...(existingDraft?.profile || {}), ...filteredFields };
            const nowIso = new Date().toISOString();
            const { error: saveErr } = await serviceClient
              .from("site_content_drafts")
              .upsert({
                site_id: targetSiteId,
                profile: mergedProfile,
                products: existingDraft?.products || [],
                updated_by: userResult.user.id,
                updated_at: nowIso,
                published_at: null
              }, { onConflict: "site_id" });

            if (saveErr) throw saveErr;
            lastUpdatedSiteId = targetSiteId;
            await recordActivity(targetSiteId, "digi_draft_updated", "DIGI AI updated draft fields.");
            toolResultText = `Successfully updated draft for site ${targetSiteId} with fields: ${Object.keys(filteredFields).join(", ")}. Draft is saved privately.`;
          } catch (updateErr) {
            toolResultText = "Error updating draft: " + String(updateErr);
          }
        }

        messages.push({ role: "assistant", content: claudeData.content });
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUseBlock.id,
              content: toolResultText
            }
          ]
        });

        claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: "claude-haiku-5-5",
            max_tokens: 1024,
            system: systemPrompt,
            tools,
            messages
          })
        });

        if (!claudeResponse.ok) break;
        claudeData = await claudeResponse.json();
      }

      const textBlock = claudeData.content?.find((c: { type: string }) => c.type === "text");
      const reply = textBlock?.text || "I have processed your request.";

      return jsonResponse({ reply, updated_site_id: lastUpdatedSiteId }, 200, origin);
    }

    if (body.action === "set_edit_request_status") {
      const requestId = String(body.request_id || "").trim();
      const status = body.status;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)
        || !["pending", "completed"].includes(String(status))) {
        return invalid("A valid request ID and status are required.", origin);
      }
      const { data: editRequest, error } = await serviceClient
        .from("site_edit_requests")
        .update({ status, reviewed_at: status === "completed" ? new Date().toISOString() : null })
        .eq("id", requestId)
        .select("site_id, client_email")
        .maybeSingle();
      if (error) throw error;
      if (!editRequest) return jsonResponse({ error: "Edit request not found." }, 404, origin);
      await recordActivity(
        editRequest.site_id,
        "edit_request_updated",
        `${status === "completed" ? "Completed" : "Reopened"} an edit request from ${editRequest.client_email}.`,
      );
      return jsonResponse({ ok: true }, 200, origin);
    }

    return invalid("Unknown action.", origin);
  } catch (error) {
    console.error("Super-admin operation failed:", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "The request could not be completed. Check server logs for details." }, 500, origin);
  }
});
