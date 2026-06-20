// /functions/api/timers.js
//
// Shared "which lights are currently on" state, so both users see live status.
// GET  /api/timers   -> { timers: { [buttonId]: { startedAt, endsAt } } }
// POST /api/timers   -> body: { id, action: "start"|"stop", durationMinutes }

const STORAGE_KEY = "timers";

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

async function readTimers(env) {
  const raw = await env.LIGHTS_KV.get(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const timers = await readTimers(env);
    const now = Date.now();
    // Clean up any expired timers before returning
    let changed = false;
    for (const id of Object.keys(timers)) {
      if (timers[id].endsAt <= now) {
        delete timers[id];
        changed = true;
      }
    }
    if (changed) await env.LIGHTS_KV.put(STORAGE_KEY, JSON.stringify(timers));
    return new Response(JSON.stringify({ timers }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to load timers", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    const { id, action, durationMinutes } = body;
    if (!id || !action) {
      return new Response(JSON.stringify({ error: "Expected { id, action }" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    const timers = await readTimers(env);
    if (action === "start") {
      const now = Date.now();
      timers[id] = { startedAt: now, endsAt: now + (durationMinutes || 15) * 60 * 1000 };
    } else if (action === "stop") {
      delete timers[id];
    }
    await env.LIGHTS_KV.put(STORAGE_KEY, JSON.stringify(timers));
    return new Response(JSON.stringify({ ok: true, timers }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to save timer", detail: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}
