// /functions/api/buttons.js
//
// Cloudflare Pages Function — shared backend for the light buttons.
// GET  /api/buttons       -> returns the current shared list of buttons
// POST /api/buttons       -> saves the full list of buttons (body: JSON array)
//
// Requires a KV namespace binding named LIGHTS_KV (set up in Cloudflare dashboard
// or wrangler.toml — see DEPLOY.md).

const STORAGE_KEY = "buttons";

const DEFAULT_BUTTONS = [
  { id: 1, name: "Kids' room", room: "Kids Bedroom", duration: 30, brightness: 75, icon: "ti-bulb", color: "warm" },
  { id: 2, name: "Bedtime dim", room: "Kids Bedroom", duration: 15, brightness: 25, icon: "ti-moon", color: "soft" },
  { id: 3, name: "Reading", room: "Kids Bedroom", duration: 60, brightness: 75, icon: "ti-book", color: "cool" },
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const raw = await env.LIGHTS_KV.get(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : DEFAULT_BUTTONS;
    return new Response(JSON.stringify({ buttons: data }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to load buttons", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    if (!Array.isArray(body.buttons)) {
      return new Response(JSON.stringify({ error: "Expected { buttons: [...] }" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    await env.LIGHTS_KV.put(STORAGE_KEY, JSON.stringify(body.buttons));
    return new Response(JSON.stringify({ ok: true, buttons: body.buttons }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to save buttons", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}
