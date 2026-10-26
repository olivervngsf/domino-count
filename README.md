# Domino Train Count

Score keeper for Mexican Train / domino train games. Static web app, no build, works on phone.

- **Players screen** – add names (recent names one tap away), **Edit** to drag ⋮⋮, rename or remove. **Start game**.
- **Game screen** – ‹ Round / Double › header, a **This round** card (tap a player to score), score rows in playing order with **Edit** (drag, rename, rotate who starts), **Finish round**, and a **Game over** screen after the last round.
- **Rounds** – double-15 down to double-1 (15 rounds). Set and round count adjustable in ⚙︎.
- **Score each player 3 ways**
  - 📷 **Scan** – snap a photo of leftover tiles.
    - Inside Claude (artifact): Claude reads printed numbers (0–15, any rotation, 6 vs 9). Fix or add tiles after.
    - Tap a wrong label to correct it. Confirmed tiles are saved as **learned tiles** and sent with every scan as a reference sheet, so reading gets better for your set. Manage them in ⚙︎.
    - Anywhere else: local dot counter for pip tiles. Tap to fix misses.
  - **Pick tiles by hand** – both halves of each tile.
  - **Type** – keypad, or **Went out · 0**.
- **Scoreboard** – box score in seating order (tap a score to edit, tap a round to jump there). **Full board** / **Standings** lists finished-round totals, lowest on top; tap a player for stats + round chart. Lowest total wins.
- **Live play (free)** – guests use their own phones.
  - The players screen shows a 3-digit **join code** and **Share link**; in the game it's the **Code** chip at the top.
  - Guests open the link (or tap **Join someone else's game** and type the code), pick their name or add a new one, then type or photograph their score. It lands on the host's phone in about 0.1 s, marked with a 📱 icon.
  - A new phone opens on **Join the game** (type the code) **or Host a new game**. A phone with a saved game opens straight into it.
  - Guests can **fix their own last round** (the host gets a notice: "Jo fixed round 01: 12 → 9") and **score for someone else** who has no phone, only for players with no score yet this round.
  - Guests see who has sent, not other people's scores. They stay on the round in play even if the host browses back to fix an old round.
  - Phones connect directly (WebRTC via PeerJS's free public broker). The host's phone holds the game and must stay open. Reloads on either side reconnect on their own.
- Look: "Swiss Daylight" from the Domino Train prototype (Inter Tight, ivory and ink, orange accent).
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
