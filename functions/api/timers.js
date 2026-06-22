// /functions/api/timers.js
//
// Shared "which lights are currently on" state, so both users see live status.
// GET  /api/timers   -> { timers: { [buttonId]: { startedAt, endsAt } } }
// POST /api/timers   -> body: { id, action: "start"|"stop"|"adjust", durationMinutes }
//   - "start":  begins a new timer for durationMinutes (0 is treated as stop)
//               and turns the real Govee bulb ON (if this button maps to one)
//   - "stop":   clears the timer and turns the real Govee bulb OFF
//   - "adjust": sets the REMAINING time on an already-running timer to
//               durationMinutes, without resetting startedAt. Used by the
//               slider on an active button, or the custom-minutes input for
//               durations over 30. 0 stops the timer AND turns the bulb off.
//               Max allowed is 180 minutes (3 hours), enforced here
//               server-side regardless of what the client sends.
//
// Note: this only fires the Govee command at the moment of the request. The
// actual auto-off when a timer naturally expires (without anyone touching
// the slider) needs something to "wake up" — see the onRequestGet cleanup
// below, which fires the off command for any timer that has expired since
// the last time anyone loaded the page.

import { GOVEE_DEVICES } from "./govee-devices-config.js";
import { goveeTurnOn, goveeTurnOff, colorNameToKelvin } from "./govee-control.js";

const STORAGE_KEY = "timers";
const BUTTONS_KEY = "buttons";

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

async function readButtons(env) {
  const raw = await env.LIGHTS_KV.get(BUTTONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function fireGoveeOff(env, buttonId) {
  const mapping = GOVEE_DEVICES[buttonId];
  if (!mapping) return; // This button isn't wired to a real bulb yet.
  await goveeTurnOff(env, mapping.device, mapping.sku);
}

async function fireGoveeOn(env, buttonId) {
  const mapping = GOVEE_DEVICES[buttonId];
  if (!mapping) return; // This button isn't wired to a real bulb yet.
  const buttons = await readButtons(env);
  const btn = buttons.find((b) => String(b.id) === String(buttonId));
  const brightness = btn?.brightness || 75;
  const colorMode = btn?.colorMode || "white"; // "white" or "color"
  // Newer buttons store a raw Kelvin value (colorTempK) from the slider.
  // Older buttons (created before the slider existed) only have a named
  // preset like "warm"/"cool" — fall back to that if colorTempK is absent.
  const colorTempK = btn?.colorTempK || colorNameToKelvin(btn?.color);
  const hue = btn?.hue ?? 0;
  await goveeTurnOn(env, mapping.device, mapping.sku, brightness, colorMode, colorTempK, hue);
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const timers = await readTimers(env);
    const now = Date.now();
    // Clean up any expired timers before returning, and turn off the
    // real bulb for each one that just expired.
    let changed = false;
    for (const id of Object.keys(timers)) {
      if (timers[id].endsAt <= now) {
        delete timers[id];
        changed = true;
        await fireGoveeOff(env, id);
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
    const mins = Math.max(0, Math.min(180, Number(durationMinutes) || 0));

    if (action === "start") {
      if (mins <= 0) {
        delete timers[id];
        await fireGoveeOff(env, id);
      } else {
        timers[id] = { startedAt: now, endsAt: now + mins * 60 * 1000 };
        await fireGoveeOn(env, id);
      }
    } else if (action === "stop") {
      delete timers[id];
      await fireGoveeOff(env, id);
    } else if (action === "adjust") {
      if (mins <= 0) {
        delete timers[id];
        await fireGoveeOff(env, id);
      } else if (timers[id]) {
        // Keep the original startedAt, just move the end time.
        // The bulb is already on, so no need to re-send the "on" command.
        timers[id] = { ...timers[id], endsAt: now + mins * 60 * 1000 };
      } else {
        // No existing timer to adjust — treat like a fresh start.
        timers[id] = { startedAt: now, endsAt: now + mins * 60 * 1000 };
        await fireGoveeOn(env, id);
      }
    } else if (action === "live_update") {
      // Brightness/color was just changed on this button. If its light is
      // currently on, immediately re-send the on command with the fresh
      // values so the change is visible right away. If it's off, this is a
      // no-op here — readButtons() in fireGoveeOn always picks up the
      // latest saved brightness/color the NEXT time the light is turned on,
      // since buttons.js is the source of truth for those values.
      if (timers[id]) {
        await fireGoveeOn(env, id);
      }
      // No timer state changes, so nothing to write back to KV.
      return new Response(JSON.stringify({ ok: true, timers }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
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
