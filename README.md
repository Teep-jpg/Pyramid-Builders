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
Menu > Co-op > "Host a game" shows a 5-letter code. Friends open the same web address and enter the code under Join.
No server list. Up to 8 players per code (change with the MAX_PLAYERS env var).

## Notes
- Saves live in each player's own browser for that web address. Use Export / Import to move a save between addresses.
- If the game page is hosted somewhere else (GitHub Pages, say) and only the relay is on a server, add
  `<script>window.PW_RELAY='wss://your-relay.example.com/ws'</script>` before the main script in index.html.
- The relay keeps nothing on disk; when everyone leaves a code, that room is gone (the host's save slot still has the world).
- Inside claude.ai the game still uses claude.ai rooms; everywhere else it uses this relay.
