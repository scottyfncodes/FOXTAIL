# Foxtail

A cozy houseplant collecting, propagating and world-transforming game for
the browser. You're **Ellen**, a plant collector, with **Scout** — scruffy,
one-eyed, never far — at your side. You start with a little greenhouse, an
empty market stall and a valley of mostly bare wilderness. Wild houseplants
grow in patches all over it.

**Explore → discover → propagate → grow → display, sell or plant out → watch the valley change → explore further.**

- **Discover.** Every wild patch shows the actual plant growing there, and
  re-rolls what grows in it over time, weighted by rarity (Common → Uncommon →
  Rare → Very Rare → Extremely Rare). 39 species, over 100 variants: variegated,
  dark-leaved, crested, glowing… and, down in the creek bogs and the damp
  forest, carnivores: sundews, flytraps and pitcher plants. Some only appear in the rain, some only by
  lantern light, and a few only where the fox leads you.
- **Propagate.** Pot a cutting in a nursery bed; it roots, then grows from
  *cutting → young → established → large → specimen*. Rooted plants give
  cuttings of their own, and every so often a cutting comes out as a *sport*
  — a different, often rarer variant. Every species also has one form that
  nature never made: it never grows wild and the fox has never seen it; it
  can only come up as a sport, from a large plant's cutting or a lively
  bed's seedling, and it glows after dark.
- **Establish, then choose.** Once you've raised two of a species, it's
  established and you choose what each plant is for: a pot in the
  greenhouse gallery (it stays and keeps growing), or a place out in the wild.
- **Transform the world.** Plants in the wild grow on their own, fastest in
  their native region. Large ones spread; seedlings sometimes come up as
  variants you've never seen. The ground itself changes under them, and each
  region takes on the character of what you planted: fern glades, vine
  carpets, aroid jungles, painted gardens.
- **Sell and build.** The Plant Stand & Supply buys plants (rarer and bigger is
  worth more; there's a daily "wanted" bonus) and sells pots, shelves,
  hanging hooks, grow lights, a sun-room expansion, garden decor and stall
  upgrades.
- **Fill a request.** The board by the stall has one request pinned up at a
  time: someone wants a particular plant grown on to a size, sometimes a
  named variety, sometimes in a particular pot, sometimes anything big from
  one part of the valley. It pays three times the going rate, and the buyer
  leaves a line about where the plant went, which the stall keeps. A new
  request goes up the day after one is filled, or after two days unanswered.
- **Collect.** The field journal tracks every species and variant, with
  the rest shown as silhouettes and "???". Finding one isn't enough: it's
  recorded once you've grown it — once a plant of it roots in your care.
- **Come home.** The greenhouse is attached to a house. The front door opens
  into a living room — couch, TV, Ranger the cat's bed, a putting mat, doorways to
  the rest of the house — and a doorway leads through into the greenhouse,
  whose garden door opens onto the valley. Scott is sometimes home watching
  the ball game, practising his putting or asleep on the couch; Ranger has
  her own places, and her own ideas about your plants. In the greenhouse,
  she and Scout can't leave each other alone: one stalks, pounces and chases,
  then it's the other's turn.
- **Arrange it yourself.** Everything indoors — beds, trays, stands, tables,
  planters, hooks, lamps, rugs — can be dragged anywhere, turned, or put
  away (🪑 button indoors). Plants move with their pots. The living room's
  own furniture (couch, TV, cat bed, cat tree, putting mat…) can be moved
  too, and Ranger and Scott follow their favourite spots wherever they go.
  Outdoors, the 🌿 garden button's *Arrange the garden* does the same: drag
  any decor — or the Plant Stand & Supply stall itself — somewhere new.
- **Putt-putt.** Walk up to the putting mat in the living room for nine holes
  laid out with whatever was lying around — mugs, a slipper, books, and the
  cat. Drag back from the ball and let go; a faint line shows where it'll roll. The first hole in one on each hole
  is worth a few coins, and the house remembers your best round.
- **Shape the land.** Drag a plant to exactly where it should grow; move it
  while it's young. Compost plants in the wrong place (for compost, and
  maybe a cutting — maybe not quite the same). Dig garden beds (the 🌿 garden button)
  whose plants spread only within them — a bed's card says how lively it
  is and what kind of plant would bring more life; lively beds throw sports
  more often, let odd seeds in with their visitors, have butterflies by day
  and glow-worms by night, and the liveliest turn up curiosities of their
  own — and carve paths through the
  growth that you can walk quickly along while their verges creep back in.
  Where your plants have grown thick, the ground is drawn as a carpet of
  their own foliage; large plants, specimens and sports still stand out of it.
- **Name what you made.** Once a region has changed enough under your
  plants, the journal's Regions page offers it a name. A wooden plaque goes
  up where the growth is thickest, the valley calls the place by that name
  from then on, and Scott takes to walking out there in the evening. If
  the fox ever shows you its den, it's wherever the valley has grown
  thickest. Ranger, for her part, won't go near a carnivore.
- **Follow the fox.** Sometimes it runs. Sometimes it's worth following.

Sunny daytime is the garden's resting state: the day lingers and the night
passes quickly (a full cycle is still about twelve real minutes), and cloud
and rain arrive as occasional spells that always clear back to sun. Time
keeps passing (up to three game days per absence) while the tab is closed,
and the welcome-back message tells you what grew and what spread. Nothing
ever dies.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
```

```bash
npm run build      # production build + PWA service worker into dist/
npm run preview     # serve the production build locally
npm test            # vitest — growth, propagation, spots, spreading, market, save/load, NPCs
npm run icons       # re-render the app icons from public/icons/foxtail.svg
```

Controls: WASD/arrow keys to move, `E` (or the on-screen button on touch
devices) to interact. Pinch with two fingers (or scroll, or press + / −) to
zoom in and out, outdoors, indoors and while arranging. Tap a plant, bed or path in the world to look at it.
The basket (🧺) is where you plant things out and place garden decor. While
placing, drag with a finger (or mouse), then ✓ / ✕ (Enter / Esc; R turns
furniture). Esc also closes whatever panel is open. Progress autosaves to `localStorage`.

## Architecture

- `src/game/data/` — content as plain data: the plant roster and variants
  (`plants.ts`), wild patches (`discoveryPoints.ts`), greenhouse layout
  (`stations.ts`), shop and pot styles (`shop.ts`), zones, map, NPC spots.
- `src/game/systems/` — pure functions on `GameState`:
  `growth` (stages), `propagation` (cuttings, sports, the two-plant threshold,
  potting/display/planting out), `spots` (what grows in a patch),
  `wild` (spreading, sports in the wild, the lushness field that repaints the
  ground), `market` (prices, buying/selling), `collection`, `basket`, `decor`,
  plus the fox, Scout, Scott and Ranger the cat.
- `src/game/engine/` — game loop, input, camera, clock/weather, save manager
  (with migration from older builds), audio.
- `src/game/world/` — map, collision, and the Canvas2D renderer. All art is
  procedural: `PlantArt.ts` draws every species/variant at any growth stage and
  caches plants as sprites so a region with hundreds of plants stays fast.
- `src/ui/` — HUD, basket, greenhouse, market and journal panels.
  Messages go through `src/game/systems/toasts.ts`, which sizes how long each
  stays up by its significance and length, and keeps milestones from being
  crowded out by routine feedback.
- `src/game/engine/Tools.ts` — the touch-first placement state machine
  (plant, arrange, bed, path), driven in world coordinates.
- `src/game/systems/landscape.ts` (beds, paths, compost, precise planting,
  transplanting), `furniture.ts` (free indoor placement), `fox.ts` +
  `foxFinds.ts` (trails and what's at the end), `spatial.ts` (spatial hash
  for plant queries).
- `src/game/data/interior.ts` — the house + greenhouse interior layout.
- `tests/` — vitest coverage of the systems above.

Every owned plant is one record with a location (nursery bed, display spot,
or a spot in the wild), so growth, saving and rendering treat the whole
collection the same way wherever it lives.
