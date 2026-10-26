// Copies the web app into www/ for the iPhone app (Capacitor). The website itself is served from the repo root.
//   npm run build:www && npx cap sync ios
import fs from 'node:fs';
const FILES = ['index.html', 'style.css', 'app.js', 'scan.js', 'live.js', 'localreader.js'];
const DIRS = ['model'];
fs.rmSync('www', { recursive: true, force: true });
fs.mkdirSync('www');
for (const f of FILES) fs.copyFileSync(f, `www/${f}`);
for (const d of DIRS) if (fs.existsSync(d)) fs.cpSync(d, `www/${d}`, { recursive: true });
console.log('www/ ready:', fs.readdirSync('www').join(', '));
