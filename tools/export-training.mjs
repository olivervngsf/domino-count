// Downloads every saved training photo + its confirmed numbers from the private Blob store.
//   BLOB_READ_WRITE_TOKEN=... node tools/export-training.mjs [outDir=data/raw]
// Get the token with `vercel env pull` (it is the store's read-write token). Already-downloaded files are skipped.
import { list, get } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const out = process.argv[2] || 'data/raw';
fs.mkdirSync(out, { recursive: true });
let cursor, n = 0, skipped = 0;
do {
  const page = await list({ prefix: 'train/', cursor, limit: 1000 });
  for (const b of page.blobs) {
    const file = path.join(out, b.pathname.replace(/^train\//, '').replace(/\//g, '_'));
    if (fs.existsSync(file)) { skipped++; continue; }
    const { stream } = await get(b.pathname, { access: 'private' });
    await fs.promises.writeFile(file, Readable.fromWeb(stream));
    n++;
  }
  cursor = page.cursor;
} while (cursor);
console.log(`downloaded ${n}, already had ${skipped}, into ${out}`);
