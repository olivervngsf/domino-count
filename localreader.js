// On-phone tile reader: a small model trained on the game's own confirmed photos (tools/train.py).
// It runs in the browser, so it costs nothing and works offline. The page asks it first and only
// calls the AI reader when it is unsure. With no model in /model/, it stays off and the AI reads.
//
// The model is a YOLO-style detector exported to ONNX: it finds each tile END and names its value
// (0..max). Ends are then paired into tiles. meta.json says how to use it:
//   { "file": "reader.onnx", "input": 640, "classes": [0,1,...,18], "minScore": 0.8, "mode": "shadow"|"on" }
// mode "shadow": read on the phone but still use the AI, and record whether both agreed (to measure it).
// mode "on":     trust the phone when every end is above minScore and every end found its pair.
(function () {
  const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

  // ---------- pure helpers (also used by tests in Node) ----------
  const iou = (a, b) => {
    const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)), h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    const i = w * h; return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i || 1);
  };
  // YOLOv8 output [1, 4 + nc, n]: cx, cy, w, h (input pixels), then one score per class.
  function decode(data, dims, classes, minKeep = 0.25) {
    const nc = dims[1] - 4, n = dims[2], out = [];
    for (let j = 0; j < n; j++) {
      let best = -1, s = 0;
      for (let c = 0; c < nc; c++) { const v = data[(4 + c) * n + j]; if (v > s) { s = v; best = c; } }
      if (s < minKeep) continue;
      const cx = data[j], cy = data[n + j], w = data[2 * n + j], h = data[3 * n + j];
      out.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2, value: classes[best], score: s });
    }
    return out;
  }
  function nms(boxes, thr = 0.5) {
    const keep = [];
    for (const b of [...boxes].sort((p, q) => q.score - p.score)) if (keep.every(k => iou(k, b) < thr)) keep.push(b);
    return keep;
  }
  // Pair ends into tiles: mutual nearest neighbours, close enough to be halves of one tile.
  function pairEnds(ends) {
    const c = e => [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2], size = e => Math.max(e.x2 - e.x1, e.y2 - e.y1);
    const near = ends.map((e, i) => {
      let best = -1, d = Infinity;
      ends.forEach((f, j) => { if (j === i) return; const [ax, ay] = c(e), [bx, by] = c(f), dd = Math.hypot(ax - bx, ay - by); if (dd < d) { d = dd; best = j; } });
      return { j: best, d };
    });
    const tiles = [], used = new Set();
    ends.forEach((e, i) => {
      const { j, d } = near[i];
      if (used.has(i) || j < 0 || near[j].j !== i || d > 1.6 * Math.max(size(e), size(ends[j]))) return;
      used.add(i); used.add(j);
      const f = ends[j];
      tiles.push({ ends: [e.value, f.value], score: Math.min(e.score, f.score),
        box: [Math.min(e.x1, f.x1), Math.min(e.y1, f.y1), Math.max(e.x2, f.x2), Math.max(e.y2, f.y2)] });
    });
    return { tiles, loose: ends.length - used.size };
  }
  // Is the phone's answer good enough to skip the AI?
  const confident = (r, minScore) => r.tiles.length > 0 && r.loose === 0 && r.tiles.every(t => t.score >= minScore);

  const helpers = { iou, decode, nms, pairEnds, confident };
  if (typeof module !== 'undefined') { module.exports = helpers; return; }

  // ---------- browser ----------
  let session = null, meta = null;
  const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const ready = (async () => {
    try {
      const r = await fetch('model/meta.json', { cache: 'no-cache' });
      if (!r.ok) return null;
      meta = await r.json();
      if (!meta?.file || !Array.isArray(meta.classes)) return null;
      return meta;
    } catch { return null; }
  })();
  async function open() {
    if (session) return session;
    if (!window.ort) await loadScript(ORT + 'ort.min.js');
    window.ort.env.wasm.wasmPaths = ORT;
    session = await window.ort.InferenceSession.create('model/' + meta.file, { executionProviders: ['wasm'] });
    return session;
  }
  // img: ImageData of the photo. Returns { tiles: [{ ends, box: [l,t,r,b] as 0..1, score }], loose, confident }.
  async function read(img) {
    if (!(await ready)) return null;
    const S = meta.input || 640, k = Math.min(S / img.width, S / img.height);
    const w = Math.round(img.width * k), h = Math.round(img.height * k), ox = (S - w) >> 1, oy = (S - h) >> 1;
    const src = document.createElement('canvas'); src.width = img.width; src.height = img.height; src.getContext('2d').putImageData(img, 0, 0);
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d'); g.fillStyle = 'rgb(114,114,114)'; g.fillRect(0, 0, S, S); g.drawImage(src, ox, oy, w, h);
    const px = g.getImageData(0, 0, S, S).data, chw = new Float32Array(3 * S * S);
    for (let i = 0; i < S * S; i++) { chw[i] = px[i * 4] / 255; chw[S * S + i] = px[i * 4 + 1] / 255; chw[2 * S * S + i] = px[i * 4 + 2] / 255; }
    const sess = await open();
    const out = await sess.run({ [sess.inputNames[0]]: new window.ort.Tensor('float32', chw, [1, 3, S, S]) });
    const t = out[sess.outputNames[0]];
    const ends = nms(decode(t.data, t.dims, meta.classes));
    const r = pairEnds(ends);
    const fx = v => Math.min(1, Math.max(0, (v - ox) / w)), fy = v => Math.min(1, Math.max(0, (v - oy) / h));
    r.tiles.forEach(tl => { tl.box = [fx(tl.box[0]), fy(tl.box[1]), fx(tl.box[2]), fy(tl.box[3])]; });
    r.confident = confident(r, meta.minScore ?? 0.8);
    return r;
  }
  window.localReader = { ready, read, get mode() { return meta?.mode || 'off'; }, helpers };
})();
