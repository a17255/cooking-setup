# Cloudflare Worker — Groq Proxy Setup

A tiny serverless proxy so the cooking chatbot works for everyone without exposing your Groq API key.

---

## 5-minute setup (web dashboard, no CLI needed)

### Step 1 — Sign up for Cloudflare (free)
https://dash.cloudflare.com/sign-up

### Step 2 — Create a Worker
1. In the Cloudflare dashboard, click **Workers & Pages** in the left sidebar
2. Click **Create application** → **Create Worker**
3. Name it: `cooking-proxy` (or any name you want)
4. Click **Deploy** (use the default "Hello World" code for now)

### Step 3 — Paste the real code
1. After deploy, click **Edit code**
2. **Delete everything** in the editor
3. Open `worker.js` in this folder, copy the entire contents
4. Paste into the Cloudflare editor
5. Click **Save and deploy**

### Step 4 — Add environment variables
1. Back in your Worker page, click **Settings** → **Variables**
2. Under **Environment Variables**, click **Add variable**:
   - **Variable name:** `GROQ_API_KEY`
   - **Value:** your Groq key (starts with `gsk_...`)
   - **Type:** click "Encrypt" to make it a secret
   - Click **Save**
3. Click **Add variable** again:
   - **Variable name:** `ALLOWED_ORIGIN`
   - **Value:** `https://a17255.github.io`
   - (keep as plain text, not encrypted)
   - Click **Save**
4. Click **Deploy** to apply the variables

### Step 5 — Copy your Worker URL
At the top of the Worker page you'll see your URL, something like:
```
https://cooking-proxy.YOURUSERNAME.workers.dev
```

**Paste this URL into the chat** with Claude — I'll wire it into `meal-assistant.js`.

---

## What the Worker does

- Accepts POST requests from your GitHub Pages origin only
- Injects your Groq API key server-side (never visible to browsers)
- Forwards to Groq's API
- Returns Groq's response unchanged
- Simple IP-based rate limit (20 req/min per visitor) to prevent abuse

## Free tier
Cloudflare Workers free tier gives you **100,000 requests/day**. Far more than Groq's limit (6,000/day for llama-3.3-70b), so Cloudflare won't be the bottleneck.

## If you ever want to rotate the Groq key
1. Generate a new key at https://console.groq.com/keys
2. Settings → Variables → edit `GROQ_API_KEY`
3. Delete the old key at Groq
