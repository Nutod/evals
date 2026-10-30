# Alexanderplatz Atlas

An interactive architectural portrait of Alexanderplatz, Berlin, built with TypeScript and Three.js. Geometry, facade textures, signs, vegetation and vehicles are generated in code. No downloaded 3D models, photographic textures, map tiles or runtime map services.

## Run

Requires Node.js 22.12+ or 24+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. No API key or account is required. Fonts are bundled locally, so the built application makes no external asset requests.

```sh
npm run build
npm run preview
npm test
```

For browser verification, start Vite on port 5173, then run `npm run test:browser`. Tests use an installed Chrome with SwiftShader for headless WebGL. Set `BASE_URL` if the app runs on another port.

`npm run test:production` builds the app, starts a temporary production preview on port 5174, tests it in a real browser without development diagnostics, and stops the preview afterward.

If npm's `ignore-scripts` setting is enabled, run `npm run build` explicitly before `npm run test:production`. That setting skips the pre-test build hook. The production preview still starts and stops normally.

## Explore

- Drag to orbit, right-drag to pan, scroll to zoom. Touch supports one-finger orbit and two-finger pan/zoom.
- Visit six individually modelled landmarks from the left navigation or on-scene markers.
- Choose daylight, golden hour or blue hour. These are art-directed lighting presets, not a live solar simulation.
- Switch between perspective, top-down and street-level previews. Street navigation maintains eye height while zooming or dragging.
- Toggle labels, vegetation and city life. Pause animation, enable camera orbit, reset the camera or download a PNG of the 3D scene with geographic data attribution.
- Keyboard shortcuts: `1`–`6` visit landmarks, `T` changes lighting, `L` toggles labels, `Space` pauses city motion, `R` resets the camera, `H` opens help.
- Reduced-motion preferences start animation paused and replace camera journeys with instant repositioning.

## Accuracy

One scene unit equals one metre. Geographic coordinates are projected into a local tangent approximation around 52.5219° N, 13.4132° E. The baked OpenStreetMap dataset anchors surrounding building footprints, roads, green areas and trees. Building heights use tagged heights or estimated heights from floor counts. The six custom landmarks use documented approximate dimensions.

This is **not a surveyed digital twin**. Facades, roofs, some landmark placements, street furniture and animation are interpretive. There are no building interiors, collision-aware walking, live transit feeds or Google Earth meshes. Street view means the camera is inside this procedural model, not photographic Street View.

## Structure

| Location                  | Responsibility                                                          |
| ------------------------- | ----------------------------------------------------------------------- |
| `src/world/map-data.json` | Baked, metre-based OpenStreetMap geographic data                        |
| `src/world/geo.ts`        | Projection, deterministic random variation and route math               |
| `src/world/city.ts`       | Batched geographic buildings, roads, paving and greenery                |
| `src/world/landmarks.ts`  | Fernsehturm, Park Inn, Weltzeituhr, station, city hall and Marienkirche |
| `src/world/streetlife.ts` | Vegetation, street furniture, people and animated transit               |
| `src/world/materials.ts`  | Canvas-generated facade and paving textures                             |
| `src/scene/`              | Camera, lighting and marker projection                                  |
| `src/ui/`                 | Accessible DOM controls and icons                                       |
| `tests/`                  | Geographic math and real-browser verification                           |

To update the baked data, download an OpenStreetMap XML extract for the area and run:

```sh
python3 scripts/import-osm.py path/to/extract.osm
```

The script converts geographic coordinates to metres and excludes footprints replaced by custom landmarks. There are no runtime downloads.

## Data and fonts

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The transformed geographic dataset is included at `src/world/map-data.json`. See `LICENSE-DATA.md`.

DM Sans and IBM Plex Mono are distributed through Fontsource under their upstream SIL Open Font Licenses. Their license files are included in the installed packages.
