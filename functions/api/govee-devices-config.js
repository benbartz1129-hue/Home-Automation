// /functions/api/govee-devices-config.js
//
// Maps your app's button IDs to real Govee devices.
// Edit this file whenever you add a new bulb-controlling button.
//
// How to find new IDs: temporarily redeploy functions/api/govee-devices.js
// (the one-time setup helper) and visit /api/govee-devices in your browser.
//
// `buttonId` must match the `id` field of the button in your app (see the
// button list returned by /api/buttons). Multiple buttons CAN point to the
// same device (e.g. "Bedtime dim" and "Reading" can both control Char's bulb
// at different brightness/duration).

export const GOVEE_DEVICES = {
  // Char's Light
  1: { device: "DB:39:60:74:F4:B8:CB:3A", sku: "H6006" },
  // Beau's Light
  2: { device: "7C:0E:60:74:F4:DB:17:5E", sku: "H6006" },

  // Add more here as you create more buttons, e.g.:
  // 3: { device: "DB:39:60:74:F4:B8:CB:3A", sku: "H6006" }, // another Char button
  // 4: { device: "7C:0E:60:74:F4:DB:17:5E", sku: "H6006" }, // another Beau button
};
