import { createClient } from "npm:@supabase/supabase-js@2.45.0";

type Json = Record<string, any>;
const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")
  || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default || ""; } catch { return ""; } })();
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();

const cors = (origin: string | null) => {
  const allowed = origin === "https://quorlyth.vercel.app"
    || origin === "https://quorlyth-ighiledivine77-5079s-projects.vercel.app"
    || /^https:\/\/quorlyth-[a-z0-9-]+-ighiledivine77-5079s-projects\.vercel\.app$/i.test(origin || "");
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "https://quorlyth.vercel.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
function reply(req: Request, status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req.headers.get("origin")), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
const clean = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";
const allowedProviders = new Set(["x", "linkedin", "meta", "pinterest"]);

function tokenExpiry(seconds: unknown) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(Date.now() + value * 1000).toISOString() : null;
}
function basicAuth(clientId: string, clientSecret: string) {
  return "Basic " + btoa(clientId + ":" + clientSecret);
}
function appendLink(text: string, link: string) {
  return link && !text.includes(link) ? text.trim() + "\n\n" + link : text.trim();
}
async function providerConfig(admin: ReturnType<typeof createClient>, provider: string) {
  const { data, error } = await admin.rpc("get_social_oauth_provider_config", { p_provider: provider });
  if (error) throw new Error("Could not load the " + provider + " app configuration.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.client_id || !row?.client_secret) return null;
  return { clientId: String(row.client_id), clientSecret: String(row.client_secret) };
}
async function readConnection(admin: ReturnType<typeof createClient>, userId: string, id: string) {
  const { data, error } = await admin.rpc("get_social_connection_tokens", {
    p_user_id: userId, p_connection_id: id,
  });
  if (error) throw new Error("Could not load the connected account securely.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("This social account is no longer connected. Refresh and try again.");
  return row as Json;
}
async function saveTokens(admin: ReturnType<typeof createClient>, userId: string, row: Json, accessToken: string, refreshToken: string | null, expiresAt: string | null, refreshExpiresAt: string | null) {
  const { error } = await admin.rpc("upsert_social_connection", {
    p_user_id: userId,
    p_provider: row.provider,
    p_provider_account_id: row.provider_account_id,
    p_account_name: row.account_name,
    p_username: row.username,
    p_access_token: accessToken,
    p_refresh_token: refreshToken,
    p_token_expires_at: expiresAt,
    p_refresh_token_expires_at: refreshExpiresAt,
    p_scopes: row.scopes || [],
    p_metadata: row.metadata || {},
  });
  if (error) throw new Error("The refreshed social access token could not be saved securely.");
}
async function refreshIfNeeded(admin: ReturnType<typeof createClient>, userId: string, row: Json) {
  if (!row.token_expires_at || Date.parse(row.token_expires_at) > Date.now() + 90_000) return row;
  if (!row.refresh_token) throw new Error("This " + row.provider + " connection has expired. Reconnect the account in Settings.");
  const configProvider = row.provider === "facebook" || row.provider === "instagram" ? "meta" : row.provider;
  const config = await providerConfig(admin, configProvider);
  if (!config) throw new Error("Reconnect this account after the platform owner configures its OAuth app.");
  let response: Response;
  if (row.provider === "x") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: config.clientId,
    });
    response = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(config.clientId, config.clientSecret) },
      body,
    });
  } else if (row.provider === "linkedin") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
  } else if (row.provider === "pinterest") {
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token });
    response = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth(config.clientId, config.clientSecret) },
      body,
    });
  } else {
    throw new Error("This " + row.provider + " account needs to be reconnected. Its provider does not support this saved token's refresh flow.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error("The " + row.provider + " refresh token is no longer valid. Reconnect the account in Settings.");
  }
  const updated = {
    ...row,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || row.refresh_token,
    token_expires_at: tokenExpiry(payload.expires_in),
    refresh_token_expires_at: tokenExpiry(payload.refresh_token_expires_in) || row.refresh_token_expires_at,
  };
  await saveTokens(admin, userId, updated, updated.access_token, updated.refresh_token, updated.token_expires_at, updated.refresh_token_expires_at);
  return updated;
}
async function publishToProvider(admin: ReturnType<typeof createClient>, userId: string, connectionId: string, body: Json) {
  const original = await readConnection(admin, userId, connectionId);
  const row = await refreshIfNeeded(admin, userId, original);
  const caption = clean(body.text, 10000);
  const link = clean(body.link, 1500);
  const text = appendLink(caption, link);
  if (!text) throw new Error("Write a caption before publishing.");

  if (row.provider === "x") {
    if ([...text].length > 280) throw new Error("This X post exceeds 280 characters. Shorten it before publishing.");
    const response = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: { Authorization: "Bearer " + row.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.data?.id) throw new Error(result?.detail || result?.title || "X did not accept this post. Check the app's write permissions and account limits.");
    return { provider: "x", postId: result.data.id, postUrl: "https://x.com/i/web/status/" + result.data.id, accountName: row.account_name };
  }

  if (row.provider === "linkedin") {
    if ([...text].length > 3000) throw new Error("This LinkedIn post exceeds 3,000 characters. Shorten it before publishing.");
    const author = clean(row.metadata?.authorUrn, 240);
    if (!author) throw new Error("The LinkedIn account identity is missing. Disconnect and reconnect LinkedIn.");
    const response = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + row.access_token,
        "Content-Type": "application/json",
        "Linkedin-Version": Deno.env.get("LINKEDIN_VERSION") || "202610",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        commentary: text,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    const postId = response.headers.get("x-restli-id");
    const error = await response.json().catch(() => ({}));
    if (!response.ok || !postId) throw new Error(error?.message || "LinkedIn did not accept this post. Confirm the Share on LinkedIn product and w_member_social permission.");
    return { provider: "linkedin", postId, postUrl: "https://www.linkedin.com/feed/update/" + encodeURIComponent(postId) + "/", accountName: row.account_name };
  }

  if (row.provider === "facebook") {
    const pageId = row.provider_account_id;
    const form = new URLSearchParams({ message: caption, access_token: row.access_token });
    if (link) form.set("link", link);
    const response = await fetch("https://graph.facebook.com/v26.0/" + encodeURIComponent(pageId) + "/feed", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error(result?.error?.message || "Facebook could not publish to this Page. Check pages_manage_posts access.");
    return { provider: "facebook", postId: result.id, postUrl: "https://www.facebook.com/" + result.id.replace("_", "/posts/"), accountName: row.account_name };
  }

  if (row.provider === "instagram") {
    if ([...caption].length > 2200) throw new Error("Instagram captions can contain up to 2,200 characters. Shorten the caption before publishing.");
    const mediaUrl = clean(body.mediaUrl, 1800);
    if (!mediaUrl) throw new Error("Instagram requires a publicly reachable image URL. Add an image URL before publishing.");
    let parsed: URL;
    try { parsed = new URL(mediaUrl); } catch { throw new Error("Enter a valid HTTPS image URL for Instagram."); }
    if (parsed.protocol !== "https:") throw new Error("Instagram media URLs must use HTTPS.");
    const createForm = new URLSearchParams({ image_url: mediaUrl, caption, access_token: row.access_token });
    const createResponse = await fetch("https://graph.facebook.com/v26.0/" + encodeURIComponent(row.provider_account_id) + "/media", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: createForm,
    });
    const container = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok || !container.id) throw new Error(container?.error?.message || "Instagram could not prepare this image. Use a public JPEG and verify the account is professional.");
    const publishForm = new URLSearchParams({ creation_id: container.id, access_token: row.access_token });
    const publishResponse = await fetch("https://graph.facebook.com/v26.0/" + encodeURIComponent(row.provider_account_id) + "/media_publish", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: publishForm,
    });
    const published = await publishResponse.json().catch(() => ({}));
    if (!publishResponse.ok || !published.id) throw new Error(published?.error?.message || "Instagram could not publish the media container.");
    const permalinkUrl = new URL("https://graph.facebook.com/v26.0/" + encodeURIComponent(published.id));
    permalinkUrl.searchParams.set("fields", "permalink");
    permalinkUrl.searchParams.set("access_token", row.access_token);
    const permalinkResponse = await fetch(permalinkUrl.toString());
    const permalinkData = await permalinkResponse.json().catch(() => ({}));
    const postUrl = permalinkResponse.ok && typeof permalinkData.permalink === "string" ? permalinkData.permalink : undefined;
    return { provider: "instagram", postId: published.id, ...(postUrl ? { postUrl } : {}), accountName: row.account_name };
  }

  if (row.provider === "pinterest") {
    if ([...caption].length > 800) throw new Error("Pinterest Pin descriptions can contain up to 800 characters. Shorten the description before publishing.");
    if ([...link].length > 2048) throw new Error("Pinterest destination links can contain up to 2,048 characters.");
    const mediaUrl = clean(body.mediaUrl, 1800);
    const boardId = clean(body.boardId || row.metadata?.defaultBoardId, 120);
    if (!mediaUrl) throw new Error("Pinterest Pins need a public image URL. Add one before publishing.");
    if (!boardId) throw new Error("Choose a Pinterest board before publishing this Pin.");
    let parsed: URL;
    try { parsed = new URL(mediaUrl); } catch { throw new Error("Enter a valid HTTPS image URL for Pinterest."); }
    if (parsed.protocol !== "https:") throw new Error("Pinterest media URLs must use HTTPS.");
    const response = await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: { Authorization: "Bearer " + row.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: boardId,
        title: clean(body.title, 100),
        description: caption,
        link: link || undefined,
        media_source: { source_type: "image_url", url: mediaUrl },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) throw new Error(result?.message || "Pinterest could not create this Pin. Check the board and pins:write scope.");
    return { provider: "pinterest", postId: result.id, postUrl: "https://www.pinterest.com/pin/" + result.id + "/", accountName: row.account_name };
  }

  throw new Error("Direct publishing is not enabled for this provider yet.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req.headers.get("origin")) });
  if (req.method !== "POST") return reply(req, 405, { error: "Use POST for social account actions." });
  if (!PROJECT_URL || !ANON_KEY || !SERVICE_KEY) return reply(req, 500, { error: "Social publishing is not configured on the server." });

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply(req, 401, { error: "Sign in to manage social accounts." });
  const userClient = createClient(PROJECT_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return reply(req, 401, { error: "Your Quorlyth session has expired. Sign in again." });

  let body: Json;
  try { body = await req.json(); } catch { return reply(req, 400, { error: "Send a valid JSON request." }); }
  const action = clean(body.action, 30);

  try {
    if (action === "list") {
      const { data: rows, error } = await admin.rpc("list_social_connections", { p_user_id: user.id });
      if (error) throw new Error("Could not load your connected social accounts.");
      const providerConfigured: Record<string, boolean> = {};
      for (const provider of ["x", "linkedin", "meta", "pinterest"]) {
        const { data: config, error: configError } = await admin.rpc("get_social_oauth_provider_config", { p_provider: provider });
        const cfg = Array.isArray(config) ? config[0] : config;
        providerConfigured[provider] = !configError && Boolean(cfg?.client_id && cfg?.client_secret);
      }
      return reply(req, 200, { ok: true, connections: rows || [], providerConfigured });
    }

    if (action === "configure") {
      const provider = clean(body.provider, 30);
      const clientId = clean(body.clientId, 300);
      const clientSecret = clean(body.clientSecret, 2000);
      if (!allowedProviders.has(provider)) return reply(req, 400, { error: "Choose a supported OAuth provider." });
      const { data: isOwner, error: roleError } = await userClient.rpc("current_user_is_platform_owner");
      if (roleError || isOwner !== true) return reply(req, 403, { error: "Only the Quorlyth platform owner can configure provider app credentials." });
      const { error } = await admin.rpc("store_social_oauth_provider_config", {
        p_provider: provider, p_client_id: clientId, p_client_secret: clientSecret,
      });
      if (error) throw new Error("Could not save the OAuth app credentials in Supabase Vault.");
      return reply(req, 200, { ok: true, provider, configured: true });
    }

    if (action === "start") {
      const provider = clean(body.provider, 30);
      if (!allowedProviders.has(provider)) return reply(req, 400, { error: "Choose a supported social platform." });
      const { data: configRows, error: configError } = await admin.rpc("get_social_oauth_provider_config", { p_provider: provider });
      if (configError) throw new Error("Could not verify the provider app configuration.");
      const config = Array.isArray(configRows) ? configRows[0] : configRows;
      if (!config?.client_id || !config?.client_secret) return reply(req, 409, { error: "This social app is not configured by the Quorlyth platform owner yet." });

      const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      const stateHashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state)));
      const stateHash = Array.from(stateHashBytes, byte => byte.toString(16).padStart(2, "0")).join("");
      let verifier: string | null = null;
      let challenge: string | null = null;
      if (provider === "x") {
        verifier = Array.from(crypto.getRandomValues(new Uint8Array(48)), byte => byte.toString(16).padStart(2, "0")).join("");
        const challengeBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
        challenge = btoa(String.fromCharCode(...challengeBytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      }
      const callback = PROJECT_URL.replace(/\/+$/g, "") + "/functions/v1/social-oauth-callback";
      const returnTo = "https://quorlyth.vercel.app/settings?tab=social";
      const { error: stateError } = await admin.rpc("create_social_oauth_state", {
        p_state_hash: stateHash,
        p_user_id: user.id,
        p_provider: provider,
        p_pkce_verifier: verifier,
        p_return_to: returnTo,
      });
      if (stateError) throw new Error("Could not start a secure social account authorization. Try again.");

      const scopes: Record<string, string> = {
        x: "tweet.read users.read tweet.write offline.access",
        linkedin: "openid profile email w_member_social",
        meta: "pages_show_list pages_read_engagement pages_manage_posts instagram_basic instagram_content_publish",
        pinterest: "boards:read boards:write pins:read pins:write user_accounts:read",
      };
      const urls: Record<string, string> = {
        x: "https://twitter.com/i/oauth2/authorize",
        linkedin: "https://www.linkedin.com/oauth/v2/authorization",
        meta: "https://www.facebook.com/v26.0/dialog/oauth",
        pinterest: "https://www.pinterest.com/oauth/",
      };
      const authUrl = new URL(urls[provider]);
      authUrl.searchParams.set("client_id", config.client_id);
      authUrl.searchParams.set("redirect_uri", callback);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scopes[provider]);
      authUrl.searchParams.set("state", state);
      if (provider === "x") {
        authUrl.searchParams.set("code_challenge", challenge || "");
        authUrl.searchParams.set("code_challenge_method", "S256");
      }
      return reply(req, 200, { ok: true, authUrl: authUrl.toString() });
    }

    if (action === "disconnect") {
      const connectionId = clean(body.connectionId, 80);
      if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return reply(req, 400, { error: "Choose a valid connected account." });
      const { data, error } = await admin.rpc("delete_social_connection", {
        p_user_id: user.id, p_connection_id: connectionId,
      });
      if (error) throw new Error("Could not disconnect this social account securely.");
      return reply(req, 200, { ok: true, disconnected: data === true });
    }

    if (action === "publish") {
      const connectionId = clean(body.connectionId, 80);
      if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return reply(req, 400, { error: "Choose a valid connected account." });
      const result = await publishToProvider(admin, user.id, connectionId, body);
      return reply(req, 200, { ok: true, ...result });
    }

    return reply(req, 400, { error: "Unknown social account action." });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 450) : "Social account request failed.";
    console.error("Quorlyth social account action failed:", action, message);
    return reply(req, 400, { error: message });
  }
});
