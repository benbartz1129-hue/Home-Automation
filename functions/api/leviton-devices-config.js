// /functions/api/leviton-devices-config.js
//
// Maps your app's button IDs to real Leviton Decora Smart switches.
// Edit this file whenever you add a new switch-controlling button.
//
// How to find switch IDs: temporarily keep functions/api/leviton-devices.js
// deployed (the one-time setup helper) and visit /api/leviton-devices in
// your browser. It returns each switch's id, name, and model. For a
// dimmer's exact minLevel/maxLevel, visit
// /api/leviton-devices?switchId=YOUR_SWITCH_ID for the full record.
//
// `buttonId` must match the `id` field of the button in your app (see the
// button list returned by /api/buttons).
//
// Two device shapes:
//   - Plain on/off switch (e.g. DN15S): { switchId: "..." }
//   - Dimmer (e.g. DN6HD): { switchId: "...", dimmable: true, minLevel: 10, maxLevel: 100 }
//     minLevel/maxLevel come straight from that device's own record — DN6HD
//     units have been observed reporting 10-100, NOT 0-100, so don't assume
//     and instead check via the debug URL above before wiring a new dimmer.
//     If omitted, minLevel defaults to 10 and maxLevel to 100.
//
// Dimmable buttons use the SAME brightness slider already on each button
// card (1-100) — the code clamps that value into this device's real
// min/maxLevel range automatically. Plain switches ignore brightness
// entirely and just turn fully on/off.

export const LEVITON_DEVICES = {
  // Example — replace with your real switch id(s) from /api/leviton-devices:
  // 6: { switchId: "123456" },                                              // plain on/off (DN15S)
  // 7: { switchId: "2598685", dimmable: true, minLevel: 10, maxLevel: 100 }, // dimmer (DN6HD)
};
