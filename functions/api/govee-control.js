// /functions/api/govee-control.js
//
// Small helper to send on/off/brightness/color-temp commands to Govee's
// official API. Used by timers.js when a button is tapped or a timer ends.

const GOVEE_CONTROL_URL = "https://openapi.api.govee.com/router/api/v1/device/control";

async function sendGoveeCommand(env, device, sku, capability) {
  if (!env.GOVEE_API_KEY) {
    console.error("GOVEE_API_KEY is not configured; skipping Govee command.");
    return { ok: false, error: "missing_api_key" };
  }
  try {
    const res = await fetch(GOVEE_CONTROL_URL, {
      method: "POST",
      headers: {
        "Govee-API-Key": env.GOVEE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        payload: {
          sku,
          device,
          capability,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Govee command failed", res.status, data);
      return { ok: false, status: res.status, data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("Govee command threw", err);
    return { ok: false, error: String(err) };
  }
}

// Turns a device on and sets brightness + color temperature in one go.
// Govee requires separate capability calls, so we fire them in sequence.
export async function goveeTurnOn(env, device, sku, brightness, colorTempK) {
  const results = [];
  results.push(
    await sendGoveeCommand(env, device, sku, {
      type: "devices.capabilities.on_off",
      instance: "powerSwitch",
      value: 1,
    })
  );
  if (brightness) {
    results.push(
      await sendGoveeCommand(env, device, sku, {
        type: "devices.capabilities.range",
        instance: "brightness",
        value: Math.max(1, Math.min(100, brightness)),
      })
    );
  }
  if (colorTempK) {
    results.push(
      await sendGoveeCommand(env, device, sku, {
        type: "devices.capabilities.color_setting",
        instance: "colorTemperatureK",
        value: Math.max(2000, Math.min(9000, colorTempK)),
      })
    );
  }
  return results;
}

export async function goveeTurnOff(env, device, sku) {
  return sendGoveeCommand(env, device, sku, {
    type: "devices.capabilities.on_off",
    instance: "powerSwitch",
    value: 0,
  });
}

// Maps the app's friendly color names to an approximate Kelvin value.
export function colorNameToKelvin(colorName) {
  switch (colorName) {
    case "warm": return 2700;
    case "soft": return 2200;
    case "cool": return 4500;
    case "daylight": return 6500;
    default: return 2700;
  }
}
