// Run: node tests/scan.test.js
const assert = require('assert');
const { detectPips } = require('../scan.js');

const PIP_LAYOUT = {
  0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

// Draw tiles on a wooden table; returns ImageData-like object.
function render(tiles, { w = 640, h = 480, pip = [20, 20, 20], noise = 12 } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = (y * w + x) * 4; data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [120, 80, 50]);
  const rect = (x0, y0, x1, y1, col) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, col); };
  const disc = (cx, cy, r, col) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(cx + x, cy + y, col);
  };
  tiles.forEach(([a, b], i) => {
    const s = 40, x0 = 30 + (i % 4) * 150, y0 = 30 + Math.floor(i / 4) * 220;
    rect(x0, y0, x0 + 2 * s + 10, y0 + 4 * s + 20, [240, 238, 230]);
    rect(x0 + 8, y0 + 2 * s + 9, x0 + 2 * s + 2, y0 + 2 * s + 11, [60, 60, 60]); // divider
    [[a, y0], [b, y0 + 2 * s + 10]].forEach(([n, top]) => {
      PIP_LAYOUT[n].forEach(([gx, gy]) => disc(x0 + 15 + gx * 30, top + 15 + gy * 30, 7, pip));
    });
  });
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) data[i + k] += (Math.random() - 0.5) * noise;
  return { data, width: w, height: h };
}

const cases = [
  [[[6, 6]], 12],
  [[[1, 2], [3, 4], [5, 0]], 15],
  [[[6, 5], [4, 3], [2, 1], [0, 0], [6, 0], [3, 3]], 33],
];
for (const [tiles, expected] of cases) {
  const got = detectPips(render(tiles)).length;
  assert.strictEqual(got, expected, `tiles ${JSON.stringify(tiles)}: got ${got}, want ${expected}`);
}
// Coloured pips (e.g. yellow) must still be found.
assert.strictEqual(detectPips(render([[5, 4]], { pip: [230, 200, 20] })).length, 9);

console.log('scan tests passed');
