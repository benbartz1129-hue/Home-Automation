// /functions/api/leviton-control.js
//
// Helper to control Leviton Decora Smart Wi-Fi switches (e.g. DN15S-1RW via
// the MLWSB bridge) through Leviton's cloud API.
//
// IMPORTANT: This is an UNOFFICIAL integration. There is no public Leviton
// API or API key — this works by logging into the same cloud service the
// My Leviton mobile app uses, with your actual account email/password
// (stored as Cloudflare secrets LEVITON_EMAIL / LEVITON_PASSWORD). It is
// reverse-engineered from the open-source python-decora_wifi project
// (MIT licensed, https://github.com/tlyakhov/python-decora_wifi) and could
// break without warning if Leviton changes their cloud API. Real-world
// reports also show occasional intermittent 502/504 errors from Leviton's
// servers, so this code tolerates and retries on those.
//
// Auth flow:
//   POST /Person/login  { email, password, clientId, registeredVia }
//   -> returns { id: <token>, userId: <id> }
//   Subsequent requests send header: authorization: <token>
//
// Switch control:
//   PUT /IotSwitches/{switchId}  { power: "ON"|"OFF" }
//
// Token caching: Cloudflare Workers are stateless between separate requests
// (no persistent in-memory cache across invocations), so we cache the auth
// token in KV with a short TTL to avoid logging in on every single button
// tap, which would be slow and could trip Leviton's rate limits.

const LEVITON_ROOT = "https://my.leviton.com/api";
const TOKEN_KV_KEY = "leviton_auth_token";
const TOKEN_TTL_SECONDS = 60 * 30; // re-login at most every 30 min

async function leviton_request(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["authorization"] = token;

  const res = await fetch(LEVITON_ROOT + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Leviton's cloud has known intermittent 502/504s unrelated to bad
  // requests. Give it one quick retry before giving up.
  if (res.status === 502 || res.status === 504) {
    const retryRes = await fetch(LEVITON_ROOT + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return finishResponse(retryRes);
  }

  return finishResponse(res);
}

async function finishResponse(res) {
  const text = await res.text();
  let data = null;
  if (text && text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

async function loginToLeviton(env) {
  const { ok, status, data } = await leviton_request("/Person/login", {
    method: "POST",
    body: {
      email: env.LEVITON_EMAIL,
      password: env.LEVITON_PASSWORD,
      clientId: "levdb-echo-proto",
      registeredVia: "myLeviton",
    },
  });
  if (!ok || !data || !data.id) {
    console.error("Leviton login failed", status, data);
    return null;
  }
  return data.id; // this is the auth token
}

// Returns a valid auth token, using a cached one from KV if still fresh,
// otherwise logging in fresh and caching the new token.
async function getLevitonToken(env) {
  try {
    const cached = await env.LIGHTS_KV.get(TOKEN_KV_KEY);
    if (cached) return cached;
  } catch (e) {
    // fall through to a fresh login
  }
  const token = await loginToLeviton(env);
  if (token) {
    try {
      await env.LIGHTS_KV.put(TOKEN_KV_KEY, token, { expirationTtl: TOKEN_TTL_SECONDS });
    } catch (e) {
      // Non-fatal if caching fails; we'll just log in again next time.
    }
  }
  return token;
}

// Calls a Leviton endpoint with a valid token, retrying once with a fresh
// login if the cached token turned out to be expired (401/403).
async function callWithAuth(env, path, options = {}) {
  let token = await getLevitonToken(env);
  if (!token) return { ok: false, status: 401, data: null };

  let result = await leviton_request(path, { ...options, token });

  if (result.status === 401 || result.status === 403) {
    // Cached token was stale — force a fresh login and retry once.
    const freshToken = await loginToLeviton(env);
    if (!freshToken) return result;
    try {
      await env.LIGHTS_KV.put(TOKEN_KV_KEY, freshToken, { expirationTtl: TOKEN_TTL_SECONDS });
    } catch (e) {
      // non-fatal
    }
    result = await leviton_request(path, { ...options, token: freshToken });
  }

  return result;
}

// Turns a Leviton switch on or off.
// switchId is the IotSwitch id (a number/string from Leviton's system, NOT
// the same as a Govee device string — see leviton-devices-config.js).
export async function levitonSetPower(env, switchId, on) {
  if (!env.LEVITON_EMAIL || !env.LEVITON_PASSWORD) {
    console.error("LEVITON_EMAIL/LEVITON_PASSWORD not configured; skipping Leviton command.");
    return { ok: false, error: "missing_credentials" };
  }
  const result = await callWithAuth(env, `/IotSwitches/${switchId}`, {
    method: "PUT",
    body: { power: on ? "ON" : "OFF" },
  });
  if (!result.ok) {
    console.error("Leviton switch command failed", switchId, result.status, result.data);
  }
  return result;
}

// Turns a Leviton DIMMER on with a specific brightness in one request.
// DN6HD (and similar dimmers) expose minLevel/maxLevel on the device itself
// (commonly 10-100, not 0-100 — confirmed by inspecting a real DN6HD via
// /api/leviton-devices?switchId=...). We clamp to that device's own range
// rather than assuming 1-100, since sending a value outside the device's
// configured min/max may be rejected or silently clamped server-side.
export async function levitonSetDimmer(env, switchId, on, brightness, minLevel = 10, maxLevel = 100) {
  if (!env.LEVITON_EMAIL || !env.LEVITON_PASSWORD) {
    console.error("LEVITON_EMAIL/LEVITON_PASSWORD not configured; skipping Leviton command.");
    return { ok: false, error: "missing_credentials" };
  }
  const body = { power: on ? "ON" : "OFF" };
  if (on && brightness !== undefined && brightness !== null) {
    body.brightness = Math.max(minLevel, Math.min(maxLevel, Math.round(brightness)));
  }
  const result = await callWithAuth(env, `/IotSwitches/${switchId}`, {
    method: "PUT",
    body,
  });
  if (!result.ok) {
    console.error("Leviton dimmer command failed", switchId, result.status, result.data);
  }
  return result;
}

export async function levitonTurnOn(env, switchId) {
  return levitonSetPower(env, switchId, true);
}

export async function levitonTurnOff(env, switchId) {
  return levitonSetPower(env, switchId, false);
}
