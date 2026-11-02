# The Lonely Mountain: The Day the Dragon Came

A procedural Three.js valley: the Lonely Mountain and the town of Dale beneath it on the one day the dragon came, driven by a single approach slider from Noon through Shadow, Circling and Fire to Night. Every mesh, texture and creature is generated in code. The only network requests are the pinned three.js modules (`three@0.180.0` from jsDelivr), loaded through the import map in `index.html`. There is no build step. One scene unit is one metre.

```sh
npm install        # Playwright only, for the tests
npm run dev        # http://localhost:5173 (static server, ES modules straight from src/)
npm test           # Playwright: desktop + mobile, against a server on :4173
```

Requires Node 18+ and network access to cdn.jsdelivr.net for three.js. Append `?quality=low|medium|high` to force a quality level, or `?t=2.5` to open at a given hour.

## The day

| Hour | What happens |
| --- | --- |
| Noon | Bells peal in five towers. About 2,300 people and 70 ponies move through Dale and up and down the Gate road: porters with chests and sacks, vendors at about 60 striped stalls, children at the toy-maker's stall (rolling horses, clockwork birds), smiths hammering in time with their sparks, harpers at the fountain. Kitchen smoke, laundry, boats, swallows. The Gate stands open on lamplit halls. |
| Shadow | Copper sky to the north, a hot dry wind: barley bends in travelling waves, pines lean, awnings snap, ponies toss at their tethers. Flocks lift from the valley and stream south, the geese among them and one clockwork bird a child lets go. Watchers on the towers point north at a dark speck over the moors. |
| Circling | The dragon banks around the peak and swoops low over Dale. His wing shadow runs down the Mountain and across the town. Bells ring wild, the market empties into doorways, awnings tear and fly, a toy horse rolls across the empty square. Dwarf sentries haul the Gate chain as the doors grind shut. Fire licks the upper slopes in lines. |
| Fire | He settles on the rock above the Gate and the doors burst inward. Fire runs down the stone channel and along the terraces in an orderly cascade, roof by roof, with surges rolling south. Spark columns, smoke lit orange from below. Silhouettes run over the bridges and down the southern road, among them a family carrying a cradle. |
| Night | A smoke ceiling with no stars. The Gate glows like a furnace door, Dale is a field of embers under falling ash, and a line of nearly 1,000 walkers with about 400 lanterns heads south beside the river, ponies and carts among them. At its head the old king looks back once. |

Everything that depends on the slider is a pure function of the hour, so scrubbing backwards un-burns Dale roof by roof, closes the doors again and walks people back out of the houses they ran into. Between hours, states interpolate: doors swing, roofs ignite in sequence, smoke and light blend. Living motion (walking, flapping, flicker) runs on the wall clock and never stops.

## Controls

- **Approach slider** (bottom): drag to scrub freely. Release near a label to snap. Click a label to travel there. Keyboard: arrows nudge, Shift+arrows nudge further, PageUp/PageDown step by hour, Home/End jump to the ends, `1`–`5` pick an hour.
- **Camera**: drag to orbit, right-drag to pan, scroll to zoom, all within a bubble around the valley. Viewpoints: Southern slopes (default), Market square, Bridge over the falls, Before the Front Gate, and High over the valley (with the Long Lake).
- **Life** sets activity density, **Quality** chooses Low/Medium/High, **Notes** (off by default) describes the hour and marks its vignettes, which you can click to fly to. **Photo** (or `P`) hides the interface and saves a PNG.

## How it is built

```
index.html               import map (three@0.180.0), UI markup
src/main.js              renderer, bloom, render loop, quality, test hooks
src/camera.js            orbit rig, bubble, preset flights
src/core/                layout (terrain height, river, roads, town plan, ignition schedule),
                         hour keyframes, shared shader hooks, hour streaming, noise
src/world/               sky, terrain, river and lake, Gate, houses, towers, bridges and walls,
                         market and props, vegetation
src/life/                instanced figures and ponies, the population routines, birds, the dragon
src/fx/                  GPU billboard particles, fire bundles and firelight
```

- **Hour streaming**: hour-specific content (crowds for each part of the day, kitchen smoke, anvil sparks, dust, slope fires, the burning town, ash, ember beds, the lantern line) registers a span of hours. A span is built when the slider comes within an hour of it, kept warm while it stays close, and disposed once the slider moves well away. The Mountain, river, roads, houses, towers, bridges and Gate are always resident.
- **Instancing and LOD**: houses, roofs, chimneys, walls, stalls, goods, pines, barley (up to 42,000 tufts), birds and every crowd are instanced. People and ponies switch between near and far meshes by distance, with skeletal motion done in the vertex shader. Flames, sparks, smoke, ash, dust, mist and embers are GPU billboards whose motion is computed entirely in the vertex shader. The terrain uses a fine valley tile, a Mountain tile and a coarse far-country tile.
- **Burning**: every burnable surface carries its ignition hour. Shaders char walls from the windows up, light windows from inside, burn roofs through to ember beds and collapse them, and ash the ground. The ignition schedule cascades south from the Gate and outward from the river.
- **The dragon**: the body is a tube skinned on the CPU along a spine that trails its own flight path, so neck and tail follow every banked turn. Wings are rebuilt each frame from arm and finger bones. The head is sculpted, with jaw, horns and glowing eyes. Scales are a procedural colour and normal map on a clearcoat, iridescent physical material with a pale belly. Breath is a particle stream with its own light. His shadow is analytic, ray-tested against wing triangles and body capsules in the ground, house and tree shaders, so it falls across the whole valley rather than only inside a shadow map.
- **Quality**: Low/Medium/High scale pixel ratio (clamped to 2), shadow map size, MSAA, bloom, population, particle counts and vegetation. They never change the hour logic, the transitions or the dragon.

## Liberties

Geography, scale and architecture are invented for the picture, not taken from any map. The Mountain is about 1.5 km high, Dale is about 600 m across, and the Long Lake lies 7 km south. The dragon's wingspan is about 170 m.
