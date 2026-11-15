# Pyramid Builder Online

One tiny Node service does everything: it serves the game and relays co-op messages.
No dependencies, no build step. Needs Node 18 or newer.

## Playing together
Main menu > Multiplayer > pick one of your worlds under "Host a game". The pause menu (Esc) shows the 5-letter code.
Friends open the same web address, go to Multiplayer and enter the code under "Join a game". No server list. Up to 8 players per code (MAX_PLAYERS env var).
Worlds are shared between single player and hosting. Money belongs to the world, so everyone in a room spends from and earns into the same wallet.
Market stand upgrades are team upgrades: one purchase applies to everyone in the room and is saved with the world.
Placing bricks pays you; finishing a layer and finishing a pyramid pay bonuses that are split by how many bricks each player placed.

## Notes
- Saves live in each player's own browser for that web address. Use Export / Import to move a save between addresses.
- The relay keeps nothing on disk; when everyone leaves a code, that room is gone (the host's save slot still has the world).
