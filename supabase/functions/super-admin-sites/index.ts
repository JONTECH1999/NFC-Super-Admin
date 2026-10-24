import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

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
    if (body.action === "list_sites") {
      const { data, error } = await serviceClient
        .from("managed_sites")
        .select("site_id, name, public_url, client_email, client_user_id, client_enabled, is_active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ sites: data || [] }, 200, origin);
    }

    if (body.action === "create_site") {
      const siteId = String(body.site_id || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const publicUrl = String(body.public_url || "").trim();
      const email = String(body.client_email || "").trim().toLowerCase();
      const password = body.password;
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(siteId) || siteId === "main") {
        return invalid("Use a site ID with 2–63 lowercase letters, numbers, or hyphens.", origin);
      }
      if (!name || name.length > 120) return invalid("Enter a site name up to 120 characters.", origin);
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
      const { error: siteError } = await serviceClient.from("managed_sites").insert({
        site_id: siteId,
        name,
        public_url: parsedUrl.toString(),
        client_email: email,
        client_user_id: userId,
      });
      if (siteError) {
        const userCleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), userId);
        if (!userCleanupSucceeded) {
          return jsonResponse({ error: "Site setup failed and the new client login could not be removed. Contact the system administrator." }, 500, origin);
        }
        return jsonResponse({ error: siteError.code === "23505" ? "That site ID already exists." : "Could not save the site." }, 400, origin);
      }

      const { error: profileError } = await serviceClient.from("site_profiles").insert({ site_id: siteId });
      if (profileError) {
        const { error: siteCleanupError } = await serviceClient.from("managed_sites").delete().eq("site_id", siteId);
        const userCleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), userId);
        if (siteCleanupError || !userCleanupSucceeded) {
          console.error("Could not fully roll back site creation:", siteCleanupError?.message || "Client user cleanup failed.");
          return jsonResponse({ error: "Site setup failed and cleanup was incomplete. Contact the system administrator." }, 500, origin);
        }
        throw profileError;
      }
      const { error: assignmentError } = await serviceClient.from("site_admins").insert({
        site_id: siteId,
        user_id: userId,
      });
      if (assignmentError) {
        const { error: siteCleanupError } = await serviceClient.from("managed_sites").delete().eq("site_id", siteId);
        const userCleanupSucceeded = await deleteCreatedUser((id) => serviceClient.auth.admin.deleteUser(id), userId);
        if (siteCleanupError || !userCleanupSucceeded) {
          console.error("Could not fully roll back site creation:", siteCleanupError?.message || "Client user cleanup failed.");
          return jsonResponse({ error: "Site setup failed and cleanup was incomplete. Contact the system administrator." }, 500, origin);
        }
        throw assignmentError;
      }
      return jsonResponse({
        site: { site_id: siteId, name, public_url: parsedUrl.toString(), client_email: email, client_user_id: userId, client_enabled: true, is_active: true },
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
      return jsonResponse({ site: { ...site, client_email: email, client_user_id: userId } }, 201, origin);
    }

    if (body.action === "set_site_active") {
      const siteId = String(body.site_id || "").trim();
      const active = body.is_active;
      if (!siteId || typeof active !== "boolean") return invalid("A site ID and active status are required.", origin);
      const { data: updatedSite, error } = await serviceClient
        .from("managed_sites")
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq("site_id", siteId)
        .select("site_id")
        .maybeSingle();
      if (error) throw error;
      if (!updatedSite) return jsonResponse({ error: "Site not found." }, 404, origin);
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (body.action === "reset_client_password") {
      const siteId = String(body.site_id || "").trim();
      const password = body.password;
      if (!isValidClientPassword(password)) return invalid("Choose a client password between 12 and 128 characters.", origin);
      const { data: site, error: siteError } = await serviceClient
        .from("managed_sites")
        .select("client_user_id")
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
      return jsonResponse({ ok: true }, 200, origin);
    }

    return invalid("Unknown action.", origin);
  } catch (error) {
    console.error("Super-admin operation failed:", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "The request could not be completed. Check server logs for details." }, 500, origin);
  }
});
