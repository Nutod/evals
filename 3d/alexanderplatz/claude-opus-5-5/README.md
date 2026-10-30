# Alexanderplatz 3D

A procedural Three.js model of Alexanderplatz, Berlin. Every mesh, material, texture and sign is generated in code. There are no imported models, photos or map tiles, no API keys, and no network requests at runtime. One scene unit is one metre.

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
npm test           # builds, serves dist/ and runs the Playwright suite (desktop + mobile)
npm run bake:osm   # re-bake OpenStreetMap data (uses .osm-cache/, add -- --fresh to re-download)
```

## What's in the scene

- **OSM context** (baked into `src/data/osm.json` at build time): ~960 building footprints and parts with heights, roof shapes and colours; the road, footway, tram and Stadtbahn networks; parks, water and plazas; 1,900 trees, 940 street lamps, 350 benches and the bus/tram stops.
- **Hand-modelled landmarks**, placed and oriented from their OSM footprints:
  - Fernsehturm: 368 m, 32 m-wide shaft foot, 32 m faceted steel sphere centred at ~212 m with the window band of the observation deck and Telecafé, red/white antenna, blinking beacons, folded-roof pavilion.
  - Park Inn: 125 m slab tower on its retail podium, pinstripe facade and rooftop sign.
  - Weltzeituhr: column, 24-sided time-zone drum with city names, rotating hour ring and orbiting planetary model on a compass-rose floor.
  - Bahnhof Alexanderplatz: brick viaduct base, arched hall windows, glazed barrel vault with steel ribs, island platforms between the actual track positions, station boards with S and U roundels.
  - Rotes Rathaus: clinker-brick block with courtyards, arcade, terracotta frieze and the 74 m clock tower with corner turrets and flag.
  - Marienkirche: Gothic hall church with fieldstone plinth, lancet windows, polygonal choir and the copper-clad spire.
- **Animation**: BVG-yellow articulated trams that stop at tram stops, red-and-ochre S-Bahn and regional trains on the viaduct that stop in the station, cars and yellow double-decker buses with car following and signalised junctions, and walking pedestrians.
- **Lighting**: daylight, golden hour and blue hour, with sky dome, fog, sun shadows fitted to the view, sky-derived reflections, and lit windows, shops, lamps and headlights after dusk.

## Controls

| View | Mouse / keyboard | Touch |
| --- | --- | --- |
| Orbit | drag to orbit, right-drag to pan, scroll to zoom; **Circle** slowly flies around the view until you drag or zoom | drag, pinch, two-finger pan |
| Top-down | north-up orthographic map; drag to pan, scroll to zoom | drag, pinch |
| Street | camera fixed at 1.7 m eye height; drag to look, `WASD`/arrows to walk, `Shift` to run | drag to look, joystick to walk |

Like Google Earth, every drag or zoom pivots around whatever is under the centre of the screen (building, landmark or ground). The landmark list flies the camera to each landmark in any mode. In street mode it picks a nearby eye point with a clear line of sight. The panel also has layer toggles, play/pause and speed, and PNG export (the attribution is drawn into the image).

## Code layout

```
scripts/bake-osm.mjs     Overpass query → local-metre JSON (build time only)
src/osm.ts               typed access to the baked data + inverse projection
src/lib/                 geometry builder, canvas textures, segment index
src/scene/               ground, streets/rail/viaduct, buildings, trees, furniture, lighting
src/scene/landmarks/     one module per landmark
src/sim/                 network graph walker, rail consists, road traffic, pedestrians
src/camera/              orbit / top-down / street camera rig
src/ui/                  panel, HUD, labels, bottom sheet, joystick
tests/                   Playwright tests against the production build
```

## Accuracy

Positions, footprints and overall heights come from OpenStreetMap and published figures. Facades, ornament, window counts, signage, interiors, generic building styles, traffic and crowds are simplified or invented. This is an illustrative model, not a survey.

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License (ODbL). The attribution is shown in the app at all times and burned into exported images.
