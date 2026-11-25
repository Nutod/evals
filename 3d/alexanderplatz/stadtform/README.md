# Stadtform · Alexanderplatz

An interactive, 850 × 740 m architectural model of Berlin-Mitte. The presentation includes an illustrated landmark index, a north-up locator, projected landmark labels and a graduated section through the district. One Three.js unit equals one metre.

## Run

Use Node.js 22.12+ or 24+. From the **repository root**, run:

```sh
npm ci
npm run dev
```

`npm run build` type-checks the project and writes a self-contained static site to `3d/alexanderplatz/stadtform/dist/`. Serve it with `npm run preview`. Geometry, textures, lighting environments, facade lettering and interface artwork are generated in code. Fonts ship with the application. The browser needs WebGL 2 and only requests files from the site's origin.

## Explore

| Control | Action |
| --- | --- |
| Orbit | Select Orbit to circle the current target. Select Stop orbit to hold the view. Drag at any time to take control, right-drag to pan, or scroll to zoom. On touchscreens, drag with one finger or pan and pinch with two. |
| Top-down | View the district from above with north at the top. Drag to pan. |
| Street | Look by dragging. Walk with WASD, arrow keys or the touch stick at a 1.7 m eye height. |
| Landmark index or label | Travel to a landmark in the current camera mode. Open **District guide** on a phone for the index and lighting. |
| Simulation | Pause or resume the animated trams, trains, cars and pedestrians. Cycle through 1×, 2× and 4× speed. |
| Lighting and layers | Choose daylight, golden hour or blue hour. Toggle buildings, streets, vegetation, furniture, labels or individual populations. |
| Export PNG | Download the current rendered scene with map attribution in the image. |

Keys 1 through 6 select landmarks. R restores the district overview. Space pauses or resumes while the map has focus. Reduced-motion preferences start the simulation paused.

## Architecture and scale

| Landmark | Model dimensions | Visible detail |
| --- | --- | --- |
| Fernsehturm | 368 m to the antenna tip, 32 m sphere | Tapered shaft, viewing decks, folded pavilion roof and banded mast |
| Park Inn | 125 m roof, approximately 150 m with mast | Glazed curtain wall, podium, plant floor and rooftop sign |
| Weltzeituhr | Approximately 10 m | Lettered 24-zone drum, moving hour band, planetary rings and paving rose |
| Alexanderplatz station | Approximately 165 × 40 m | Glazed barrel vault, roof ribs, two island platforms and elevated tracks |
| Rotes Rathaus | Approximately 99 × 88 m with a 74 m clock tower | Courtyards, brick arcades, frieze, clock faces and flagpole |
| Marienkirche | Approximately 90 m to the spire | Gothic bays, buttresses, choir and copper crown |

`src/district.ts` imports the repository's existing TypeScript geometry builders, baked OSM data, transit networks and camera rig from the adjacent `claude-fable-5-2` project. The production bundle includes these modules. `src/atlas.ts` assembles the district and runs the simulation. `src/plaza.ts` adds the Galeria and Berolinahaus facades and a lattice crane on a mapped construction site. `src/table.ts` builds the model base and lighting, while `src/locator.ts` draws the locator and places labels.

## Sources and fidelity

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The [bundled extract](../claude-fable-5-2/src/data/osm.json) records its origin, metre conversion and extraction date. The [bake script](../claude-fable-5-2/scripts/bake-osm.mjs) documents the transformation. The district omits peripheral footprints that extend across the cut edge of the model.

Published Google Earth views supplied visual references for the rail alignment, open spaces, street widths and the relative silhouettes of the tower, hotel and town hall. [Google Earth oblique view of Berlin-Mitte](https://www.seekxl.de/blog/google-earth-zeigt-berlin-in-3d/) · [Google Earth plan view in Wegner et al., figure 1](https://www.isprs.org/proceedings/xxxviii/1_4_7-w5/paper/Wegner-145.pdf).

The six landmarks follow published dimensions and OSM outlines. Facade bays, ornament, finishes, roof equipment, construction activity and untagged building heights are approximate. Transit services and crowds follow simulated schedules. The lighting presets are artistic studies of the district.

## Browser verification

```sh
npx playwright install chromium --only-shell
npm test
```

Playwright builds the production bundle and serves it on port 4792. The suite checks rendered pixels and landmark extents, the three light studies, downloaded PNG bytes, pointer and keyboard camera movement, ten layer toggles, and four moving populations. Phone tests dispatch multitouch gestures and operate the street joystick and mobile guide. The suite records desktop and phone screenshots under `test-results/` and fails if the app requests an external resource.

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium executable.
