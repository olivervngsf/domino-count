# Domino Train Count

Score keeper for Mexican Train / domino train games. Static web app, no build, works on phone.

- **Players** – add / remove anyone.
- **Rounds** – double-15 down to double-1 (15 rounds). Set and round count adjustable in ⚙︎.
- **Score each player 3 ways**
  - 📷 **Scan** – snap a photo of leftover tiles.
    - Inside Claude (artifact): Claude reads printed numbers (0–15, any rotation, 6 vs 9). Fix or add tiles after.
    - Tap a wrong label to correct it. Confirmed tiles are saved as **learned tiles** and sent with every scan as a reference sheet, so reading gets better for your set. Manage them in ⚙︎.
    - Anywhere else: local dot counter for pip tiles. Tap to fix misses.
  - 🁣 **Tap tiles** – pick both halves of each tile.
  - Type the number.
- **Scoreboard** – per-round grid + totals, lowest total wins 👑.
- Saved in the browser (localStorage). Optional "double-blank = 50".

## Run

```sh
python3 -m http.server 8000   # open http://localhost:8000
```

Camera needs HTTPS on phones – deploy to GitHub Pages / Vercel / Netlify (just upload the folder).

Scan tips: tiles flat, good light, fill the frame, no glare. Black tiles with white pips → tick "Dark tiles".

## Test

```sh
node tests/scan.test.js
```
