// /functions/api/timers.js
//
// Shared "which lights are currently on" state, so both users see live status.
// GET  /api/timers   -> { timers: { [buttonId]: { startedAt, endsAt } } }
// POST /api/timers   -> body: { id, action: "start"|"stop"|"adjust", durationMinutes }
//   - "start":  begins a new timer for durationMinutes (0 is treated as stop)
//   - "stop":   clears the timer (light off)
//   - "adjust": sets the REMAINING time on an already-running timer to
//               durationMinutes, without resetting startedAt. Used by the
//               slider on an active button. 0 stops the timer.

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
    const now = Date.now();
    const mins = Math.max(0, Math.min(30, Number(durationMinutes) || 0));

    if (action === "start") {
      if (mins <= 0) {
        delete timers[id];
      } else {
        timers[id] = { startedAt: now, endsAt: now + mins * 60 * 1000 };
      }
    } else if (action === "stop") {
      delete timers[id];
    } else if (action === "adjust") {
      if (mins <= 0) {
        delete timers[id];
      } else if (timers[id]) {
        // Keep the original startedAt, just move the end time.
        timers[id] = { ...timers[id], endsAt: now + mins * 60 * 1000 };
      } else {
        // No existing timer to adjust — treat like a fresh start.
        timers[id] = { startedAt: now, endsAt: now + mins * 60 * 1000 };
      }
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
