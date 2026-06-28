// /functions/api/leviton-devices.js
//
// TEMPORARY SETUP HELPER — visit this URL once in your browser to see your
// Leviton switches and their IDs, then copy those into
// leviton-devices-config.js. Safe to delete this file afterward.
//
// GET /api/leviton-devices

const LEVITON_ROOT = "https://my.leviton.com/api";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

async function callApi(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["authorization"] = token;
  const res = await fetch(LEVITON_ROOT + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = null; }
  }
  return { ok: res.ok, status: res.status, data };
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    if (!env.LEVITON_EMAIL || !env.LEVITON_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "LEVITON_EMAIL/LEVITON_PASSWORD not set as environment variables/secrets on this project." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    // 1. Log in
    const login = await callApi("/Person/login", {
      method: "POST",
      body: {
        email: env.LEVITON_EMAIL,
        password: env.LEVITON_PASSWORD,
        clientId: "levdb-echo-proto",
        registeredVia: "myLeviton",
      },
    });
    if (!login.ok || !login.data || !login.data.id) {
      return new Response(
        JSON.stringify({ step: "login", status: login.status, data: login.data }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
    const token = login.data.id;
    const userId = login.data.userId;

    // 2. Get residential permissions for this user
    const perms = await callApi(`/Person/${userId}/residentialPermissions`, { token });
    if (!perms.ok) {
      return new Response(
        JSON.stringify({ step: "residentialPermissions", status: perms.status, data: perms.data }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const allSwitches = [];
    const debugResidences = [];

    for (const perm of perms.data || []) {
      let residenceIds = [];

      if (perm.residentialAccountId) {
        const residences = await callApi(`/ResidentialAccounts/${perm.residentialAccountId}/residences`, { token });
        if (residences.ok && Array.isArray(residences.data)) {
          residenceIds = residences.data.map((r) => r.id);
        }
      } else if (perm.residenceId) {
        residenceIds = [perm.residenceId];
      }

      for (const residenceId of residenceIds) {
        debugResidences.push(residenceId);
        const switches = await callApi(`/Residences/${residenceId}/iotSwitches`, { token });
        if (switches.ok && Array.isArray(switches.data)) {
          for (const sw of switches.data) {
            allSwitches.push({
              id: sw.id,
              name: sw.name,
              model: sw.model,
              power: sw.power,
              residenceId,
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ switches: allSwitches, residences: debugResidences }, null, 2),
      { headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch Leviton devices", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}
