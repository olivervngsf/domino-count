// Unit test for the on-phone reader's decoding and pairing. Run: node tests/localreader.test.js
const assert = require('assert');
const { decode, nms, pairEnds, confident } = require('../localreader.js');
const classes = [...Array(19).keys()];
// Build a fake YOLO output [1, 4+19, n] from a list of {cx,cy,w,h,value,score}.
function out(dets) {
  const n = dets.length, d = new Float32Array((4 + 19) * n);
  dets.forEach((t, j) => { d[j] = t.cx; d[n + j] = t.cy; d[2 * n + j] = t.w; d[3 * n + j] = t.h; d[(4 + t.value) * n + j] = t.score; });
  return { data: d, dims: [1, 23, n] };
}
// Sideways tile 6|9 at (100,100), upright tile 12|3 at (300,300), a duplicate of the 6, and a weak junk box.
const o = out([
  { cx: 85, cy: 100, w: 30, h: 30, value: 6, score: 0.95 }, { cx: 115, cy: 100, w: 30, h: 30, value: 9, score: 0.9 },
  { cx: 86, cy: 101, w: 30, h: 30, value: 6, score: 0.6 },
  { cx: 300, cy: 285, w: 30, h: 30, value: 12, score: 0.97 }, { cx: 300, cy: 315, w: 30, h: 30, value: 3, score: 0.92 },
  { cx: 500, cy: 500, w: 30, h: 30, value: 1, score: 0.1 },
]);
const ends = nms(decode(o.data, o.dims, classes));
assert.strictEqual(ends.length, 4, 'duplicate merged, weak box dropped');
const r = pairEnds(ends);
assert.strictEqual(r.loose, 0);
assert.deepStrictEqual(r.tiles.map(t => [...t.ends].sort((a, b) => a - b)).sort(), [[3, 12], [6, 9]]);
assert.ok(confident(r, 0.85)); assert.ok(!confident(r, 0.95));
// A lone end with no partner makes the answer unsure.
const lone = pairEnds([...ends, { x1: 700, y1: 700, x2: 730, y2: 730, value: 4, score: 0.99 }]);
assert.strictEqual(lone.loose, 1); assert.ok(!confident(lone, 0.5));
assert.ok(!confident(pairEnds([]), 0.5), 'nothing found is never confident');
console.log('localreader tests passed');
