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

## Pyramid facts (current build)
- 26 layers, 51 bricks wide at the base, 23,426 bricks in total (the sum of the odd squares 1, 9, 25 ... 51²).
- Placed stones are 2.1 m cubes, so the finished pyramid is about 55 m tall and 107 m wide. You walk up it like stairs: each layer is one stone inset from the one below.
- It is centred directly east of the mud pit, level with the molds, a good way back from the river. Red-banded boundary posts with gold tips mark the corners (tall) and every ~13 m along each edge (short), so you can see the footprint before you build. The market is north of the mud pile, to the right when you face the river.
- Bonuses: every brick pays; finishing a layer and a pyramid pay shares split by bricks placed; the player who places the brick that lands on a milestone (25, 75, 100, 250, 500, 1000, 2500, 5000 bricks) gets that milestone bonus. Rarer milestones pay more per brick.

# Roadmap (future plan)
The target is a co-op "build a pyramid together" game: bricks start as mud, travel by hand, by throwing, by conveyor and by catapult, and are placed by you or by hired helpers. Each item below says what it is, how it plays, what has to change in the code, and what can go wrong. Items are in a sensible build order; each one is playable on its own.

## 0. Foundations
**Entity framework.** Molds, fans, pits and dropped bricks are already "entities" with an id, a position and a small state, synced as upsert/remove messages. Every machine below (kiln, refill station, conveyor, catapult, helper) should be a new entity kind in the same system: one `make...()` function, one save row, one sync shape, one tooltip. Write a tiny registry (`KINDS[kind] = {make, save, load, data, apply, tip, blueprint}`) before adding more, so `entApply`, `collect`, `loadWorldEnts` and `drawBP` stop growing a branch per kind.
**Tick and authority.** Anything that moves on its own (helpers, conveyors, thrown bricks) must be simulated by one machine only, otherwise players see different results. Rule: the host simulates and broadcasts compact state; guests only render and send "requests" (place, throw, buy). The relay already knows who the host is; add a `sim` message type at about 5 Hz and interpolate on guests.
**Save format v4.** Add a `ver` field and a migration table (`migrate[3]=...`) so older saves keep loading. New world keys (`kilns`, `belts`, `helpers`, `gold`, `blessings`) go into the world list so they sync and save automatically.
**Performance budget.** 23,426 stone instances are fine as one InstancedMesh. Hidden interior stones are never visible, so later only draw cells that have an exposed face. Keep per-frame work in helpers O(number of helpers), not O(bricks).

## 1. Production and automation
**Kilns (and glazing kilns).** A kiln is a mold you can feed in bulk. Plain kiln: holds 4 molds' worth of clay, bakes in a fraction of the sun-drying time, needs fuel (reeds or wood bought at the market, or a slow free burn). Glazing kiln: takes a finished brick and has a chance to upgrade it (see golden bricks); slower, more expensive. *Code:* new entity kinds `kiln`/`glaze` with `{fuel, clay, queue, progress}`; an input hotspot (pour clay) and an output hotspot (collect bricks). Heat should interact with fans (fans speed drying but not kilns). *Risks:* UI clutter (keep it to two prompts: pour, collect), and making kilns so good that molds become pointless. Keep molds as the free early game and make kilns about throughput per walking step, not about doing more for free.
**Refill stations.** A refill station holds a tank of clay and automatically tops up nearby molds and bowls. Fed by a pit through a short channel or by a helper. *Code:* entity with `{clay, radius}`; every second it moves clay into molds in range; show a visible pipe or channel so the player understands the range. *Tuning:* tank size and refill rate are the upgrade axes.
**Drying fans (exists).** Extend with a bigger "wind tower" later; share the same stacking rule (diminishing, capped).
**Conveyor feeding.** Later, a belt segment can end at a mold or kiln input, so pit to refill station to mold to kiln becomes a chain.

## 2. Transport
**Carry (exists).** Strength sets how many bricks you carry before slowing down. Keep it; it is the "early game feel".
**Tossing bricks.** Throw one brick in an arc (key to toss, hold to charge distance). A teammate in range can catch it (walk into it or press a key); an uncaught brick lands as a normal dropped brick and can be picked up. Also lets you throw a brick onto a layer you are standing below. *Code:* a `throw` request carries start, velocity and thrower id; the host simulates a simple ballistic arc (gravity, no air drag) and resolves the landing (catch, ground, or "placed on a legal cell"). Guests draw the same arc from the same numbers, so only one message per throw is needed. *Risks:* lag making catches feel unfair (give catches a generous radius and a short grace window), and spam (cooldown and a carry limit).
**Conveyor belts.** Straight, corner and lift segments placed on the grid like molds. Bricks ride on them at a fixed speed; a belt can end at a mold, a kiln, a pyramid cell edge, or a chest. *Code:* `belt` entity with direction and a small item list; the host moves items along and hands them to the next segment each tick. Lifts are what make a 55 m pyramid practical: a lift segment carries bricks up the outside. Price rises with length so players invest instead of spamming.
**Catapults.** Load bricks, aim at a pyramid layer, launch. The aim UI is "pick a layer and a side"; the catapult computes the arc. Accuracy depends on level; a miss drops bricks on the ground below. Bigger catapults carry more, shoot higher, and fire more slowly. *Code:* `catapult` entity with `{load, angle, power, cooldown}`; landing uses the same resolver as thrown bricks, plus a "snap to nearest open cell on the target layer" so launches are useful instead of fiddly.
**Climbing aids.** At 2.1 m per layer, ramps and ladders as cheap buildables would speed up the player on the way up, and they make a visible "work site" look.

## 3. Workforce (Shabti helpers)
**What they do.** Little workers you hire at the market. Each has a role: *Refiller* (tops up molds, kilns and bowls from a pit), *Hauler* (picks up finished bricks and carries them to a drop point, a belt start or the pyramid), *Builder* (places bricks on the current layer). Upgrades: speed, carry size, and a second role.
**How they work.** A very small task system: every helper looks at a shared task list ("mold 3 is empty", "mold 5 has a brick", "cell (12,30) needs a brick on layer 4"), claims the nearest unclaimed task, walks there in a straight line (no path-finding needed; the pyramid is stairs), does it in a short fixed time, and repeats. Idle helpers wait by their station.
*Code:* helpers are host-simulated entities with `{role, x, z, task, carry, level}`; guests only interpolate positions. Cap the total (for example 20 per world) so the loop stays cheap. The task list is rebuilt from entity state a few times a second rather than kept in sync.
*Economy:* hiring cost grows with count; each helper has a small upkeep (a trickle of coins) or a wage, so they never make the player's own work pointless and never go infinite.
*Risks:* helpers fighting the player for the same brick (give the player priority and let helpers skip a claimed task), and helpers placing bricks in the "wrong" order (rule: only the current layer, cells nearest the middle first).

## 4. Character progression
**XP and levels.** Everything you do earns XP: placing, carrying, training. Levels feed three trees: *Speed* (walk and sprint, jump height), *Strength* (bowl size, stones carried, slow-down threshold) and *Endurance* (sprint time, how long you can train). Keep the gym minigames; they become a faster way to level, not the only way.
**Per-player vs shared.** Stats stay per player (already true). Coins and the world's machines are shared in a hosted game. A host option "separate wallets" would be a good later toggle for groups who want it.
*Code:* a `levels` object in the player save; a small level-up toast and sound exist already; add a one-screen stats panel (hold Tab).

## 5. Economy and the ship market
**Golden bricks.** A small chance (about 1 in 50, raised by glazing kilns and blessings) that a baked brick is golden. A golden brick is visibly different, pays several times the normal brick when placed, and counts double towards milestones. Also a good "ooh" moment to announce to the whole room. *Code:* a `q` (quality) field on the brick state; carried count becomes `{normal, gold}`. Keep it a tiny change at first: gold is just a counter that pays more.
**Ship market.** A second market on the river. A ship arrives every few minutes (timer, visible sailing in), stays for a while, and sells rotating stock: glazing kilns, drying fans, conveyor segments, catapults, helper contracts, rare cosmetics. Some stock is limited, so the visit is an event. The current market stand stays for permanent upgrades.
*Code:* a host-driven timer that rolls stock from a table and broadcasts it; the shop UI is the existing blueprint grid with a "limited stock" counter. The ship itself is a simple model that moves along the river and stops at a dock.
**Balancing.** Keep a spreadsheet of coins per minute at each stage and the cost of each purchase. Aim for a new purchase every one to three minutes early, stretching to ten or more late. Milestone bonuses already reward sparse big moments; layer and pyramid shares should remain the largest single payouts.

## 6. Endgame: monuments and blessings
**After the pyramid.** When the last brick lands, the world celebrates and offers a choice: raise a monument, or start another pyramid with a blessing.
**Monuments.** Large optional buildings (obelisk, sphinx, temple, a second small pyramid) built with the same brick economy but from a flat shape list. Each has a fixed brick cost and a permanent world benefit (for example +10% brick pay, extra helper cap, or a cosmetic glow). They are permanent trophies on the map.
**Blessings.** Permanent buffs chosen from a short list after each completed pyramid (faster drying, better golden-brick odds, stronger helpers, cheaper machines). A blessing is the prestige currency: reset the pyramid, keep machines and levels, gain a blessing, and the next pyramid is a bit faster. *Code:* a `blessings` list in the world save that the existing helpers (`dryT`, `pay`, `goldChance`...) read. *Risks:* runaway scaling, so keep each blessing small and cap the stacking.

## 7. Quality, polish and tooling
- **Mobile controls:** the game has touch hooks but no on-screen sticks and buttons; add them once the core loop is stable.
- **Audio:** more SFX (kiln fire, helper footsteps, ship horn), a quiet ambient wind, and music that stops when the pause menu is open.
- **Visuals:** hide interior stones, add dust when bricks land, show helpers carrying bricks, give golden bricks a sparkle.
- **Server:** optional persistence for rooms (a small JSON file per code) so a world survives everyone leaving; rate limits and a max room age to stop abuse.
- **Permissions:** host-only toggles for building, spending, and kicking, so a public room cannot be griefed.
- **Testing:** a headless script that places bricks through the same functions as the game and checks the milestone and bonus maths and the save migrations.

## Planned build order
1. **Foundations** (section 0): entity registry, host simulation tick, save v4.
2. **Refill stations and kilns** (section 1): they create the bottleneck the rest solves.
3. **Shabti helpers, refiller and hauler first** (section 3): the first real automation.
4. **Tossing, then conveyors with lifts** (section 2): needed once the pyramid is tall.
5. **Golden bricks and the ship market** (section 5): the economy gets exciting.
6. **Catapults and builder helpers** (sections 2 and 3): upper-layer logistics.
7. **XP trees** (section 4) alongside steps 2 to 6 as each new activity gives XP.
8. **Monuments and blessings** (section 6): endgame, built last because it depends on everything above.
