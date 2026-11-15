# Pyramid Works Online

One tiny Node service does everything: it serves the game and relays co-op messages.
No dependencies, no build step. Needs Node 18 or newer.

## Playing together
Main menu > Multiplayer > pick one of your worlds under "Host a game". The pause menu (Esc) shows the 5-letter code.
Friends open the same web address, go to Multiplayer and enter the code under "Join a game". No server list. Up to 8 players per code (MAX_PLAYERS env var).
Worlds are shared between single player and hosting. Money belongs to the world, so everyone in a room spends from and earns into the same wallet.

## Notes
- Saves live in each player's own browser for that web address. Use Export / Import to move a save between addresses.
- The relay keeps nothing on disk; when everyone leaves a code, that room is gone (the host's save slot still has the world).
