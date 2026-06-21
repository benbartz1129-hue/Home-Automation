// /functions/api/govee-devices.js
//
// TEMPORARY SETUP HELPER — visit this URL once in your browser to see your
// Govee devices and their IDs/models, then copy those into timers.js.
// Safe to delete this file afterward; it doesn't expose your key, only
// reads it server-side from the GOVEE_API_KEY environment variable/secret.
//
// GET /api/govee-devices

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

export async function onRequestGet(context) {
  const { env } = context;
  try {
    if (!env.GOVEE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOVEE_API_KEY is not set as an environment variable/secret on this project." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const res = await fetch("https://openapi.api.govee.com/router/api/v1/user/devices", {
      method: "GET",
      headers: {
        "Govee-API-Key": env.GOVEE_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();

    // Simplify the output so it's easy to read in the browser.
    const simplified = (data.data || []).map((d) => ({
      name: d.deviceName,
      device: d.device,
      sku: d.sku,
      type: d.type,
    }));

    return new Response(
      JSON.stringify({ raw_status: res.status, devices: simplified, raw: data }, null, 2),
      { headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch Govee devices", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
}
