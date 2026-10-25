// Pip detection: finds round dots on domino tiles in an image.
// Pure function over {data, width, height} so it runs in browser and Node.
(function (root) {
  function detectPips(img, opts = {}) {
    const { width: w, height: h, data } = img;
    const sensitivity = opts.sensitivity ?? 0.5; // 0..1, higher = finds fainter pips
    const darkTiles = !!opts.darkTiles; // white pips on dark tiles

    // 1. "Ink" channel: min(R,G,B) makes colored pips dark on white tiles.
    const lum = new Float32Array(w * h);
    for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
      const m = Math.min(data[p], data[p + 1], data[p + 2]);
      lum[i] = darkTiles ? 255 - Math.max(data[p], data[p + 1], data[p + 2]) : m;
    }

    // 2. Adaptive threshold against local mean (integral image).
    const integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += lum[y * w + x];
        integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row;
      }
    }
    const r = Math.max(4, Math.round(Math.min(w, h) / 16));
    const c = 15 + (1 - sensitivity) * 40; // how much darker than surroundings
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const sum = integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1]
          - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        if (lum[y * w + x] < mean - c && mean > 90) mask[y * w + x] = 1;
      }
    }

    // 3. Connected components (4-neighbour flood fill).
    const label = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    const blobs = [];
    const minArea = Math.max(6, (w * h) / 200000);
    const maxArea = (w * h) / 150;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || label[i]) continue;
      let top = 0, area = 0, sx = 0, sy = 0;
      let minX = w, maxX = 0, minY = h, maxY = 0;
      const id = blobs.length + 1;
      stack[top++] = i; label[i] = id;
      while (top) {
        const j = stack[--top];
        const x = j % w, y = (j / w) | 0;
        area++; sx += x; sy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x > 0 && mask[j - 1] && !label[j - 1]) { label[j - 1] = id; stack[top++] = j - 1; }
        if (x < w - 1 && mask[j + 1] && !label[j + 1]) { label[j + 1] = id; stack[top++] = j + 1; }
        if (y > 0 && mask[j - w] && !label[j - w]) { label[j - w] = id; stack[top++] = j - w; }
        if (y < h - 1 && mask[j + w] && !label[j + w]) { label[j + w] = id; stack[top++] = j + w; }
      }
      blobs.push({ area, x: sx / area, y: sy / area, bw: maxX - minX + 1, bh: maxY - minY + 1 });
    }

    // 4. Keep round, solid, reasonably sized blobs.
    let pips = blobs.filter(b => {
      if (b.area < minArea || b.area > maxArea) return false;
      const aspect = b.bw / b.bh;
      const fill = b.area / (b.bw * b.bh);
      return aspect > 0.6 && aspect < 1.65 && fill > 0.55 && fill < 0.97;
    });

    // 5. Pips in one photo are about the same size: drop outliers vs the median.
    if (pips.length >= 3) {
      const areas = pips.map(p => p.area).sort((a, b) => a - b);
      const med = areas[areas.length >> 1];
      pips = pips.filter(p => p.area > med * 0.35 && p.area < med * 2.8);
    }

    return pips.map(p => ({ x: p.x, y: p.y, r: Math.sqrt(p.area / Math.PI) }));
  }

  if (typeof module !== 'undefined') module.exports = { detectPips };
  else root.detectPips = detectPips;
})(this);
