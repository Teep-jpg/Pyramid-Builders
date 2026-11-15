# Pyramid Works Online

One tiny Node service does everything: it serves the game and relays co-op messages.
No dependencies, no build step. Needs Node 18 or newer.

## Try it on your own computer
    node server.js
Open http://localhost:3000. Friends on the same Wi-Fi can use http://YOUR-LAN-IP:3000.

## Put it online (free tiers work)
Upload these four files to a GitHub repo, then create a "Web Service" from it:
- Render / Railway / Fly.io: build command none (or `npm install`), start command `node server.js`.
The service gives you a web address. Share that address; the game handles the rest over wss:// automatically.
(Free Render services sleep when idle; the first visit after a nap takes ~30 s.)

## Playing together
Main menu > Multiplayer > pick one of your worlds under "Host a game". The pause menu (Esc) shows the 5-letter code.
Friends open the same web address, go to Multiplayer and enter the code under "Join a game". No server list. Up to 8 players per code (MAX_PLAYERS env var).
Worlds are shared between single player and hosting. Money belongs to the world, so everyone in a room spends from and earns into the same wallet.

## Notes
- Saves live in each player's own browser for that web address. Use Export / Import to move a save between addresses.
- If the game page is hosted somewhere else (GitHub Pages, say) and only the relay is on a server, add
  `<script>window.PW_RELAY='wss://your-relay.example.com/ws'</script>` before the main script in index.html.
- The relay keeps nothing on disk; when everyone leaves a code, that room is gone (the host's save slot still has the world).
- Inside claude.ai the game still uses claude.ai rooms; everywhere else it uses this relay.
