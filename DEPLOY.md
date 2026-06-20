# Deploying Home Automation (shared, synced for you + your wife)

This app has two parts:
- `index.html` — the page you and your wife open
- `functions/api/buttons.js` and `functions/api/timers.js` — small serverless
  functions that read/write a shared database (Cloudflare KV) so you both
  see the same buttons and the same on/off state.

Because it's wired to GitHub, every time you push a change, Cloudflare
re-deploys automatically. Your wife never has to do anything except open
the same link.

## 1. Push this folder to GitHub

```bash
cd Home-Automation
git init
git add .
git commit -m "Initial home automation app"
gh repo create Home-Automation --public --source=. --push
# (or create the repo on github.com and `git remote add origin ...` + push)
```

## 2. Connect the repo to Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Pick the `Home-Automation` repo
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `/`
4. Click **Save and Deploy**

You'll get a URL like `https://home-automation.pages.dev`.

## 3. Create the shared KV database

1. Cloudflare dashboard → **Workers & Pages** → **KV** (left sidebar) → **Create namespace**
2. Name it `home_automation_kv`
3. Go back to your Pages project → **Settings** → **Functions** → **KV namespace bindings**
4. Add a binding:
   - Variable name: `LIGHTS_KV`   (must match exactly — this is what the code looks for)
   - KV namespace: `home_automation_kv`
5. **Retry deployment** (Settings → Deployments → ⋯ → Retry) so the binding takes effect

## 4. Test it

- Open the `.pages.dev` URL on your phone
- Add a button
- Open the same URL on your wife's phone (or another browser/incognito window) — the button should appear within ~4 seconds
- Tap a button to "turn it on" — it should show as on for both of you, with a live countdown

## 5. Give it to your wife

- Send her the `.pages.dev` link (or set up a custom domain in Cloudflare → Pages → Custom domains, e.g. `lights.yourdomain.com`)
- She taps **Share → Add to Home Screen** once on her phone
- From then on, any button you add or remove shows up automatically — she never needs to touch GitHub, Cloudflare, or anything technical.

## 6. Connecting it to your actual smart bulbs

Right now this app is the **shared control panel and shared on/off state** —
it does not yet flip physical bulbs. To bridge it to real hardware, the
cleanest option given you already have GitHub/Cloudflare skills:

- **Home Assistant** (recommended if you have it or want it): create an
  automation that polls `GET https://your-site.pages.dev/api/timers` every
  10-30 seconds, and calls `light.turn_on` / `light.turn_off` based on
  what it sees. I can write this automation YAML for you on request.
- **IFTTT**: "If Google Assistant says 'turn on kids lights'" → Webhooks
  action → `POST https://your-site.pages.dev/api/timers` with
  `{"id": 1, "action": "start", "durationMinutes": 30}`.
- **Node-RED**: an `http request` node polling `/api/timers`, wired to
  whatever node controls your specific bulb brand.

Let me know which bulbs/hub you have and I'll write the exact automation.
