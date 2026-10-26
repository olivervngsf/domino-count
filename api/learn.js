// Saves confirmed photo reads so a small on-phone reader can be trained later.
// Each save is one photo plus the tile ends the player confirmed, in a private Vercel Blob store.
//   GET  /api/learn -> { ok: true|false }  (is saving set up?)
//   POST /api/learn { image: base64 jpeg, tiles: [{ ends, box, sure, fixed }], set } -> { ok: true }
const { put } = require('@vercel/blob');

const MAX_B64 = 1_500_000; // ~1.1 MB jpeg; the page sends a downscaled copy
const fail = (res, status, code) => res.status(status).json({ code });
const num = v => Number.isFinite(+v) ? +v : null;

module.exports = async function handler(req, res) {
  const on = !!process.env.BLOB_READ_WRITE_TOKEN;
  if (req.method === 'GET') return res.status(200).json({ ok: on });
  if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if (!on) return fail(res, 503, 'not_configured');

  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) return fail(res, 403, 'forbidden');
  }

  const { image, tiles, set } = req.body || {};
  if (typeof image !== 'string' || !image || image.length > MAX_B64) return fail(res, 400, 'bad_image');
  if (!Array.isArray(tiles) || tiles.length < 1 || tiles.length > 40) return fail(res, 400, 'bad_request');
  const clean = [];
  for (const t of tiles) {
    const ends = Array.isArray(t?.ends) ? t.ends.map(Number) : [];
    if (ends.length !== 2 || !ends.every(n => Number.isInteger(n) && n >= 0 && n <= 20)) return fail(res, 400, 'bad_request');
    const box = Array.isArray(t.box) && t.box.length === 4 && t.box.every(v => num(v) !== null && v >= 0 && v <= 1) ? t.box.map(Number) : null;
    clean.push({ ends, box, sure: t.sure !== false, fixed: !!t.fixed });
  }

  const buf = Buffer.from(image, 'base64');
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return fail(res, 400, 'bad_image'); // JPEG only

  const day = new Date().toISOString().slice(0, 10);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await put(`train/${day}/${id}.jpg`, buf, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false });
    await put(`train/${day}/${id}.json`, JSON.stringify({ tiles: clean, set: num(set), at: new Date().toISOString() }),
      { access: 'private', contentType: 'application/json', addRandomSuffix: false });
  } catch {
    return fail(res, 502, 'store_error');
  }
  return res.status(200).json({ ok: true });
};
