/**
 * Cloudflare Worker — Groq API proxy for the cooking chatbot.
 *
 * Env vars (set in Worker dashboard → Settings → Variables):
 *   GROQ_API_KEY          your Groq key (secret)
 *   ALLOWED_ORIGIN        e.g. "https://a17255.github.io" (no trailing slash)
 *
 * The Worker:
 *  - accepts POST from the allowed origin only
 *  - injects your Groq key server-side (never exposed to browser)
 *  - forwards to Groq and streams the response back
 *  - applies a cheap per-IP rate limit using an in-memory counter
 */

const RATE_LIMIT_PER_MIN = 20;   // max requests per IP per minute
const rateState = new Map();     // ip -> { count, windowStart }

function rateLimited(ip) {
  const now = Date.now();
  const entry = rateState.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    rateState.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_PER_MIN;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';
    const origin  = request.headers.get('Origin') || '';

    if (allowed !== '*' && origin !== allowed) {
      return new Response('Forbidden origin', { status: 403 });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin || allowed) });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin || allowed) } }
      );
    }

    const body = await request.text();

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body,
    });

    const respBody = await groqRes.text();
    return new Response(respBody, {
      status: groqRes.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin || allowed),
      },
    });
  },
};
