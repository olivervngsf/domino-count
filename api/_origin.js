// Who may call our API: this site's own pages, and the iPhone app (its pages come from capacitor://localhost).
// Files starting with _ in api/ are helpers, not routes.
const APP_ORIGINS = ['capacitor://localhost', 'ionic://localhost'];

// Returns false (and has already answered) when the request must stop here.
module.exports = function checkOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && APP_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) { res.status(403).json({ code: 'forbidden' }); return false; }
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  return true;
};
