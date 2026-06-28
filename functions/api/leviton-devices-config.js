// /functions/api/leviton-devices-config.js
//
// Maps your app's button IDs to real Leviton Decora Smart switches.
// Edit this file whenever you add a new switch-controlling button.
//
// How to find switch IDs: temporarily keep functions/api/leviton-devices.js
// deployed (the one-time setup helper) and visit /api/leviton-devices in
// your browser. It returns each switch's id, name, and model.
//
// `buttonId` must match the `id` field of the button in your app (see the
// button list returned by /api/buttons).
//
// Note: Leviton DN15S is a basic on/off switch — no brightness or color
// control, unlike the Govee bulbs. Buttons mapped here will ignore any
// brightness/color settings and simply turn the switch on or off.

export const LEVITON_DEVICES = {
  // Example — replace with your real switch id(s) from /api/leviton-devices:
  // 6: { switchId: "123456" },
};
