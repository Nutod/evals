# Alexanderplatz, procedural

A Three.js model of Alexanderplatz in Berlin, generated in code at load time. One scene unit is one metre. The app ships no 3D models, photos or map tiles, needs no API keys, and makes no network requests after the page loads.

Requires Node.js 22.12+ or 24+.

```sh
npm ci
npm run dev            # http://localhost:5173
npm run build          # type-check, then bundle to dist/
npm run test:unit      # geometry, data and simulation logic (Vitest)
npm run test:browser   # builds, serves dist/ and drives it in Chromium (Playwright)
npm test               # both
npm run bake:osm       # rebuild src/data/osm.json; add -- --fresh to download again
```

The browser tests need Playwright's Chromium once: `npx playwright install chromium`.

## What you get

OpenStreetMap supplies the layout. `scripts/bake-osm.mjs` turns an Overpass extract into `src/data/osm.json`: about 1,000 building footprints and parts with tagged heights and colours, 900 road segments, the tram network, the four Stadtbahn tracks, parks, water, 1,800 trees, 880 street lamps, 290 benches and the tram, bus and U-Bahn stops.

Six landmarks are modelled by hand on their mapped footprints.

| Landmark | Dimensions used | Modelled detail |
| --- | --- | --- |
| Fernsehturm | 368 m tip, 32 m foot, 32 m sphere, decks at 203.8 m and 207.5 m | tapered concrete shaft, steel sphere with pyramid cladding and two window bands, antenna carrier, red and white mast, warning lights, pleated pavilion roof |
| Park Inn | 125 m roof, 149.5 m mast, 37 hotel floors | curtain wall with a pinstripe per floor, retail podium, plant floor, rooftop lettering |
| Weltzeituhr | 10 m tall, 2.7 m column, 24 sides | drum with city names per time zone, hour ring set from the simulated clock, planetary model turning once a minute, paving rose |
| Bahnhof Alexanderplatz | 165 × 41 m footprint | arched ground floor, glazed hall with steel ribs, island platforms placed between the mapped tracks, station signs |
| Rotes Rathaus | 99 × 88 m block, 74 m tower, 4.75 m dials | brick body with courtyards, arched window storeys, terracotta frieze, corner pavilions, clock tower, flag |
| Marienkirche | 90 m spire | brick nave with lancet bays and buttresses, choir and apse, chapels, limestone west tower, copper crown |

The Neptunbrunnen and the Brunnen der Völkerfreundschaft are modelled too, more loosely.

Moving parts: yellow BVG trams that follow the mapped tracks and call at mapped stops, S-Bahn and regional trains that stop in the station hall, cars, taxis and double-decker buses on a lane graph with car following, and pedestrians on the plaza and footpaths. Trees sway. Fountains run.

Three lighting presets blend into each other: daylight, golden hour and blue hour. After dusk the windows, shopfronts, street lamps, vehicle lights and the tower's beacons come on.

## Controls

| View | Mouse and keyboard | Touch |
| --- | --- | --- |
| Orbit | drag to orbit, right-drag to pan, scroll to zoom | drag, two-finger pan, pinch |
| Top-down | north-up, drag to pan, scroll to zoom | drag, pinch |
| Street | fixed 1.7 m eye height, drag to look, `WASD` or arrows to walk, `Shift` to run | drag to look, on-screen stick to walk |

The panel lists the landmarks and flies to them in any view. In street view it walks to a spot with a clear sight line. It also holds the layer toggles, play and pause, speed, a slow auto-orbit and PNG export at 1× or 2×. Exports carry the attribution in the image.

Keys: `1` to `6` landmarks, `O` `T` `G` views, `L` next light, `Space` pause, `P` export.

URL parameters: `?light=day|golden|blue`, `?mode=top|street`, `?landmark=<id>`, `?paused=1`, `?labels=0`, `?quality=low|medium|high`.

## Code layout

```
scripts/bake-osm.mjs   Overpass extract to local-metre JSON, build time only
src/data/              baked data and its types
src/core/              plan geometry, mesh builder, canvas textures, shared materials
src/env/               sky shader, sun with cascaded shadows, lighting presets
src/world/             ground, streets, viaduct, buildings, trees, furniture, fountains, labels
src/world/landmarks/   one module per landmark
src/sim/               network graph, vehicle models, trams, trains, road traffic, pedestrians
src/camera/            orbit, top-down and street camera rig
src/ui/                panel, HUD, labels, bottom sheet, walk stick
tests/unit/            Vitest
tests/browser/         Playwright, desktop and phone, against the production build
```

## Tests

The Playwright suite builds the app and runs against `vite preview`, so it checks the production bundle. It reads back rendered pixels through the export path, measures the built landmark geometry against the published heights, drives orbit, top-down and street cameras with real mouse, keyboard and multi-touch input, checks that trams and trains stay on the mapped tracks, downloads and inspects the exported PNG, and checks the phone layout. It also fails on console errors and on any request that leaves the origin.

## Accuracy

Positions, footprints and overall heights come from OpenStreetMap and published figures. The rest is approximate. Facades, ornament, window counts, signage and interiors of the landmarks are simplified. Ordinary buildings get one of a few generic facades picked from their tags. Roof shapes other than flat, gabled, hipped, pyramidal and domed fall back to a flat deck. Vehicles, timetables, crowds, sky and lighting are illustrative, and cars do not obey signals. Do not measure from this model.

Google Earth served as a visual reference only. The app contains no Google imagery or data.

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License](https://opendatacommons.org/licenses/odbl/). The app shows the attribution at all times, repeats it in the About dialog and draws it into exported images.
