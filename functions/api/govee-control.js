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

// Turns a device on and sets brightness + color (white temp OR full RGB) in
// one go. Govee requires separate capability calls, so we fire them in
// sequence.
//
// colorMode: "white" -> use colorTempK (Kelvin, 2000-9000)
//            "color"  -> use hue (0-360 degrees, full saturation/brightness)
export async function goveeTurnOn(env, device, sku, brightness, colorMode, colorTempK, hue) {
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
  if (colorMode === "color" && hue !== undefined && hue !== null) {
    const rgbInt = hueToRgbInt(hue);
    results.push(
      await sendGoveeCommand(env, device, sku, {
        type: "devices.capabilities.color_setting",
        instance: "colorRgb",
        value: rgbInt,
      })
    );
  } else if (colorTempK) {
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

// Converts a hue (0-360 degrees, full saturation + brightness) to the
// single packed integer Govee's colorRgb capability expects
// (0-16777215, i.e. R*65536 + G*256 + B).
export function hueToRgbInt(hue) {
  const h = ((Number(hue) % 360) + 360) % 360; // normalize to 0-359
  const c = 1; // full saturation
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const R = Math.round(r * 255);
  const G = Math.round(g * 255);
  const B = Math.round(b * 255);
  return R * 65536 + G * 256 + B;
}
