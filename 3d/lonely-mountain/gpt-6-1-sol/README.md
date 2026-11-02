# The day the dragon came

A standalone Three.js interpretation of the last day of the kingdom under the Lonely Mountain. Open at noon, explore Dale, then move the bottom timeline through the dragon's arrival, fire and the flight south.

## Run

Node.js 22.12+ or 24+.

```sh
npm ci
npm run dev -- --port 5174
```

Open the URL printed by Vite. No keys or services are needed.

```sh
npm test
npm run build
npm run test:browser
```

The browser suite builds first, uses installed Google Chrome, and starts an isolated production preview on port 4174. Its build step is explicit, so it also works when npm lifecycle scripts are disabled. Screenshots and failure traces go into `test-results/`.

## Controls

- Drag the timeline for continuous time. Click an hour to travel to it. Releasing near a stop snaps to that hour. Keyboard arrows also work on the slider.
- Play advances the entire day in about 108 seconds. It stops at night.
- Drag the scene to orbit, right-drag to pan, scroll or pinch to zoom.
- Camera buttons visit the valley, market, falls, Front Gate and aerial view. Orbiting interrupts a camera transition.
- Life adjusts the population. Quality reduces population, particle counts and detail distances.
- Hour notes start off. Photo mode hides the interface. Escape brings it back.

## How the valley works

Everything visible is generated in code. There are no fetched models, photographs, textures, fonts or audio. Canvas-generated masonry, shingles, timber and dragon scales accompany custom water, sky, wind, smoke, fire and damage shaders. Three.js and its addons use one pinned version, **0.183.0**. The production build vendors the required module graph and resolves it through the import map before the application module runs. It does not require a CDN.

The mountain, river, road, building footprints, bridges and bell towers persist. Each house has a deterministic ignition threshold. Roofs char and collapse through the vertex shader, in order from the Gate toward southern Dale. Reversing time restores those same roofs. Awnings deform and tear rather than swapping dioramas. Population routines change from trading to sheltering, running and joining the lantern procession. The dragon has articulated wing roots, membranes and finger bones, a neck, jaw, horns, plated body and a hierarchical tail.

At high quality, reusable instance buffers support 2,400 people plus ponies, carts, birds, vegetation, market produce, house details and effects. Buildings and static architectural details are batched by material. Trees have nearby branch geometry and a cheaper distant form. Town props, fine figures, dragon plates, grass and chimney caps have separate distance budgets. Device pixel ratio never exceeds 2.

Shared geometry stays resident. Active and adjacent hour groups are prepared together; distant effect buffers and ember groups are disposed. The smoke, kitchen smoke, spark and ash systems allocate only while their relevant hours are near. Low quality keeps the same transformations and dragon animation.

## Fidelity

This is a stylized procedural world, not a film-grade reconstruction. People and statues use small geometric forms; the Gate contains a short lamplit hall, not a complete underground kingdom. Fire, collapse and smoke are reversible visual systems rather than physical simulations. Crowd routing is deterministic and does not model collision avoidance. Some transitional movement follows scrubbing rather than a complete autonomous evacuation simulation. Figures recycle along the procession to keep a paused night populated. The terrain and river are invented, not a geographic reconstruction.

## Verification

Sixteen Node tests cover continuous state interpolation, reverse damage, ignition ordering, hour residency, budgets, seeded generation, roof normals, shadow flags, river/lake elevations, camera clearance, two-axis bridge grades, sheltering exits, continuous evacuation routes and clearance of every seeded house footprint from the curved bank paths. Four production browser tests cover all five hours, fractional and reverse scrubbing, keyboard input, camera controls, the low Gate preset, notes, quality, density, playback, photo/Escape and a narrow viewport. They fail on console errors, page errors, failed requests or HTTP errors.
