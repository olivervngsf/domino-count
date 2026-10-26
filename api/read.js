// Reads domino tiles from a photo with Claude, for the hosted site (outside Claude there is no
// built-in reader). The page sends the same prompt and images it would give Claude's own reader;
// this function adds the API key, which stays on the server (Vercel env var ANTHROPIC_API_KEY).
//   GET  /api/read  -> { ok: true|false }  (is reading set up?)
//   POST /api/read  { prompt, images: [{ type, data(base64) }] } -> the JSON Claude returned
// Cheap model first; the strong one only when the cheap one is unsure about any tile,
// finds nothing, or fails. Most photos never reach the strong model.
const FAST = process.env.READ_MODEL_FAST || 'claude-haiku-5-5';
const STRONG = process.env.READ_MODEL || 'claude-sonnet-5-5';
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_B64 = 4_000_000; // ~3 MB per image after base64; Vercel caps a request at 4.5 MB

const checkOrigin = require('./_origin.js');
const fail = (res, status, code) => res.status(status).json({ code });

function firstJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET') return res.status(200).json({ ok: !!key });
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if (!key) return fail(res, 503, 'not_configured');

  // Only this site's own pages may use the key.

  const { prompt, images } = req.body || {};
  if (typeof prompt !== 'string' || !prompt || prompt.length > 8000) return fail(res, 400, 'bad_request');
  if (!Array.isArray(images) || images.length < 1 || images.length > 2) return fail(res, 400, 'bad_request');
  for (const im of images) {
    if (!im || !TYPES.includes(im.type) || typeof im.data !== 'string' || !im.data || im.data.length > MAX_B64) return fail(res, 400, 'image_rejected');
  }

  const ask = async model => {
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              ...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.type, data: im.data } })),
              { type: 'text', text: prompt + '\nReply with only the JSON object, no other text.' },
            ],
          }],
        }),
      });
    } catch {
      return { code: 'network', status: 502 };
    }
    if (r.status === 429 || r.status === 529) return { code: 'rate_limited', status: 429 };
    if (r.status === 400) return { code: 'image_rejected', status: 400 };
    if (!r.ok) return { code: 'server_error', status: 502 };
    const out = await r.json().catch(() => null);
    const text = (out?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const json = firstJson(text);
    return json ? { json } : { code: 'invalid_json', status: 502 };
  };
  const confident = j => Array.isArray(j?.tiles) && j.tiles.length > 0 && j.tiles.every(t => t && t.sure !== false);

  if (FAST && FAST !== STRONG) {
    const quick = await ask(FAST);
    if (quick.json && confident(quick.json)) { res.setHeader('x-read-model', 'fast'); return res.status(200).json(quick.json); }
    if (quick.code === 'image_rejected') return fail(res, 400, 'image_rejected');
  }
  const full = await ask(STRONG);
  if (!full.json) return fail(res, full.status, full.code);
  res.setHeader('x-read-model', 'strong');
  return res.status(200).json(full.json);
};
