# Pyramid Builder Online

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
Brick Bazaar upgrades are team upgrades: one purchase applies to everyone in the room and is saved with the world.
Placing bricks pays you; finishing a layer and finishing a pyramid pay bonuses that are split by how many bricks each player placed.

## Notes
- Saves live in each player's own browser for that web address. Use Export / Import to move a save between addresses.
- If the game page is hosted somewhere else (GitHub Pages, say) and only the relay is on a server, add
  `<script>window.PW_RELAY='wss://your-relay.example.com/ws'</script>` before the main script in index.html.
- The relay keeps nothing on disk; when everyone leaves a code, that room is gone (the host's save slot still has the world).
- Inside claude.ai the game still uses claude.ai rooms; everywhere else it uses this relay.

## Building rules
Blueprint prices are flat (not upgrades): Clay Mold 20, Standing Fan 80, Brick Crate 40, and a refund returns what you paid. Placement snaps to a 1 m grid (R or the wheel rotates) and things may sit as close as their footprints allow. Molds are small (about 1.3 m), the starting mud pile is a small mound on the river bank, and molds start a few metres from it.

## Golden bricks
Each mold has a 4 % chance per brick of baking a golden one (decided from the mold's id and how many bricks it has made, so every player agrees). A ready golden brick glows gold in its mold. Golden bricks are carried, stored in crates and dropped like normal bricks, and pay 30 coins (× your pay upgrades) when placed; they stay gold in the pyramid. The bricks bar shows how many you carry, what they are worth, and which type is on top; scroll the mouse wheel to swap the top brick when you carry both types.

## Blueprint categories and the Brick Crate
The hammer menu lists every planned category even when empty: Recent, Clay & Molds, Hauling, Belts, Power, Refining, Gold, Pyramid, Monuments, Rest & Gym, Fun & Chaos. Items today: Clay Mold (Clay & Molds), Brick Crate (Hauling) and Standing Fan (Power). The Brick Crate costs 40 coins (+10 % per crate you own), stores up to 40 bricks, and automatically pulls in the dried bricks of any mold within 3 m. Click it with empty hands to take bricks out. In co-op the host (or the lowest-id player) runs the pulling so players never double-collect.

## Pyramid facts (current build)
- 31 layers, 61 bricks wide at the base, 39,711 bricks in total (the sum of the odd squares 1, 9, 25 ... 61²). Pyramids already in progress from older saves finish at their old 51-wide size; the next one is the new size.
- Placed stones are 2.1 m cubes, so the finished pyramid is about 65 m tall and 128 m wide. You climb it by mantling: jump at a layer's edge and you pull yourself up onto it (each layer is one stone inset from the one below). Walking off an edge makes you fall. Endurance no longer changes jump height.
- It is centred directly east of the mud pit, level with the molds, a good way back from the river. Red-banded boundary posts with gold tips mark the four corners, so you can see the footprint before you build. The Brick Bazaar is north of the mud pile, to the right when you face the river.
- Bonuses: every brick pays; finishing a layer and a pyramid pay shares split by bricks placed; the player who places the brick that lands on a milestone (25, 75, 100, 250, 500, 1000, 2500, 5000 bricks) gets that milestone bonus. Rarer milestones pay more per brick.

# Roadmap (future plan)
The target is a co-op "build a pyramid together" game: bricks start as mud, travel by hand, by throwing, by conveyor and by catapult, and are placed by you or by hired helpers. Each item below says what it is, how it plays, what has to change in the code, and what can go wrong. Items are in a sensible build order; each one is playable on its own.

## 0. Foundations (do these first, they make everything else cheaper)
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
**XP and levels.** Everything you do earns XP: placing, carrying, training. Levels feed three trees: *Speed* (walk and sprint), *Strength* (bowl size, stones carried, slow-down threshold) and *Endurance* (sprint time, how long you can train). Keep the gym minigames; they become a faster way to level, not the only way.
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

## Suggested build order
1. **Foundations** (section 0): entity registry, host simulation tick, save v4.
2. **Refill stations and kilns** (section 1): they create the bottleneck the rest solves.
3. **Shabti helpers, refiller and hauler first** (section 3): the first real automation.
4. **Tossing, then conveyors with lifts** (section 2): needed once the pyramid is tall.
5. **Golden bricks and the ship market** (section 5): the economy gets exciting.
6. **Catapults and builder helpers** (sections 2 and 3): upper-layer logistics.
7. **XP trees** (section 4) alongside steps 2 to 6 as each new activity gives XP.
8. **Monuments and blessings** (section 6): endgame, built last because it depends on everything above.


## Crew board
Hold **Tab** in game to see the crew board (player, title, coins earned, bricks placed, clay scooped, molds filled, stack and walking speed). Money now sits in the top-right coin box.

## Update notes (0.9.x)
- **Golden bricks** now appear 2 % of the time (was 4 %).
- **Affected-object circles:** when you hold a blueprint of a fan, crate or hopper, aim at one, or place a mold, a small ring appears around every mold it affects (white for existing objects, green or red for the one you are placing).
- **Audio:** the M key is gone. Pause > Options has Master, Music and Sound effects sliders (saved in your browser). Music is a quiet generated desert melody over a drone.
- **Fans** push air in a 38-degree cone out of their front (the side with the cage ring); molds inside the cone, or within about 1 m of the fan, dry faster. The cone is drawn when you place or aim at a fan.
- **Ghost preview** now shows the real model of what you are placing, tinted green or red, with a white arrow on the ground pointing at its front (the way a fan blows).
- **Names:** the name box keeps exactly what you typed. If it is blank, a random name (Mason Mudpie, Sir Bricksalot, Soggy Sphinx...) is rolled each time you start, host or join a session, and is never saved or written into the box. Random names saved by older versions are forgotten on first load.
- **Blueprint unlocks:** some blueprints need the team to have placed a minimum number of bricks on the pyramid (lifetime, all pyramids, all players, saved with the world as `tb`): Standing Fan 25, Brick Crate 50, Mold Rack 100, Clay Hopper 250. Locked blueprints are greyed out in the hammer menu with a progress bar, and a toast announces each unlock. To change or add a lock, set `req:N` on its entry in `BPS`. Existing worlds start with their current pyramid progress counted.
- **Passing bricks:** face a teammate within 4.5 m and press **G** to give one brick (hold G to give everything that fits). The giver is only charged for what the receiver confirms fits in their bag, so nothing is lost if their bag is full.
- **Brick piles:** dropped bricks now land in a pile. A brick dropped within 0.9 m of a pile joins it; piles grow 4 bricks per layer, turning 90 degrees each layer. Picking up from a pile takes the top brick. Piles save and sync like before.
- **Co-op stats:** every guest sends their stats to the host on their own autosave (and when the host saves). The host stores them in its save, keyed by a per-browser player id, and gives them back when that player rejoins with lower progress (for example on a new browser).

## Update notes (1.2)
- **Brick Bazaar** now sells five team upgrades: Sweatband (training XP +20 % per level, ×2 at level 5), Sun-Drying Lore I (molds dry 20 % faster per level), Shabti Spells I (shabti walk/carry +25 % per level), Greased Rollers I (conveyors +25 % per level), Long Reach I (brick passing range 9 → 12 → 15 → 18 → 21 m, catch angle ±75° → ±95° → ... ±155°, drop distance +1.5 m per level). The old Master mason pay and Papyrus sandals upgrades are gone, so placed bricks pay a flat $1 and walking speed no longer has a coin upgrade. Levels already bought in those two are ignored.
- **Placeholder models:** Conveyor (a cube, Belts tab, unlocks at 150 bricks, $60) and Shabti (a capsule, Hauling tab, unlocks at 500 bricks, $120). They place, rotate, move, refund, sync and save, but do nothing yet. `shabtiMul()` and `beltMul()` already return the upgrade multipliers for when they do.
- **Bigger bonuses:** layer bonus is about 4× (and +25 % per finished pyramid), milestone bonuses are about 6× at 25 bricks growing to about 50× at 5,000, and the pyramid completion bonus is about 3×. Milestones were extended with 10,000, 20,000 and 30,000 bricks.

## Update notes (1.3): Shabti Market
- **Shabti are no longer a blueprint.** The placeholder Shabti blueprint is gone; you buy them at the new **Shabti Market** stand (east of the Brick Bazaar, same side as the river-facing path). It opens once the team has placed **400 bricks** (the shutter shows `n / 400` until then).
- **Faces rotate every 3 minutes.** Three faces are on offer, rolled from the clock (`floor(Date.now()/180000)`) so everyone in a room sees the same stock. Tiers: **Clay** (about 60 %), **Lapis** (about 30 %), **Gold** (about 10 %). Each face has a name, 0-3 positive and 0-2 negative traits (display only for now) and three starting skills (Speed, Carry, Focus).
- **Price = tier base + traits + skills.** Base: Clay 400, Lapis 800, Gold 1,250. Each positive trait +50, each negative -50, each skill point above or below the tier average about 12. Clay lands near 250-500, Lapis 730-960, Gold 1,290-1,470. Tune `SH_BASE`, `SH_SK`, `SH_POS`, `SH_NEG` in `index.html`.
- **Buying puts the Shabti in your hand** (empty hands required). **Q** drops him on the ground, **LMB** on a dropped Shabti with empty hands picks him up again. While carrying one you cannot hold bricks or switch tools. Assigning him to a post or workout machine comes later.
- Held Shabti save with the player (`hs`); the sold-state of the current stock saves with the world (`shs`) and syncs with a `shs` message.

## Update notes (1.4): pyramid size and notifications
- **Pyramid:** 26 layers, 51 stones wide at the base, 23,426 bricks in total (sum of odd squares 1 ... 51²), stones are now 2.5 m cubes, so the finished pyramid is 65 m tall (about 128 m wide). Pyramids already in progress keep their old grid size (up to 61 wide) but use the new stone size.
- **Top-left feed:** `feed(label, highlight, tail)` shows stacked messages with a yellow bar (max 4, fade after 9 s). Used for several blueprints unlocking at once ("NEW BLUEPRINTS: ... hammer [3]") and for "NEW AT THE MARKET: Shabti Market".
- **Bottom-left blueprint card:** when exactly one blueprint unlocks, `bpCard(def)` shows a larger card with its icon, long description and cost.
- **Milestone banner:** `msBanner(count, coins)` shows "1,500 BRICKS!" with the percentage of the pyramid and the team coin reward, for every player in the room. Milestones are now 25, 75, 100, 250, 500, 1000, 1500, 2500, 5000, 7500, 10000, 15000, 20000 (banner from 100 up).
