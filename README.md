# Evals

AI-generated implementations of shared coding tasks, organized by category, task and model. Each implementation has its own source, dependencies, tests and run instructions.

## 3D evaluations

| Task                   | Model       | Implementation                                                          |
| ---------------------- | ----------- | ----------------------------------------------------------------------- |
| Alexanderplatz, Berlin | GPT-6.1 Sol | [3d/alexanderplatz/gpt-6-1-sol](3d/alexanderplatz/gpt-6-1-sol/)         |
| Alexanderplatz, Berlin | Opus 5.5    | [3d/alexanderplatz/claude-opus-5-5](3d/alexanderplatz/claude-opus-5-5/) |
| Alexanderplatz, Berlin | Fable 5.2   | [3d/alexanderplatz/claude-fable-5-2](3d/alexanderplatz/claude-fable-5-2/) |
| The Lonely Mountain    | GPT-6.1 Sol | [3d/lonely-mountain/gpt-6-1-sol](3d/lonely-mountain/gpt-6-1-sol/) |
| The Lonely Mountain    | Opus 5.5    | [3d/lonely-mountain/claude-opus-5-5](3d/lonely-mountain/claude-opus-5-5/) |

## Run the Lonely Mountain

### GPT-6.1 Sol

```sh
cd 3d/lonely-mountain/gpt-6-1-sol
npm ci
npm run dev -- --port 5174
```

The [app README](3d/lonely-mountain/gpt-6-1-sol/README.md) covers controls, procedural rendering, fidelity limits and production browser tests.

### Opus 5.5

No build step; three.js is loaded from a pinned CDN URL through an import map.

```sh
cd 3d/lonely-mountain/claude-opus-5-5
npm install
npm run dev   # http://localhost:5173
npm test
```

## Run Alexanderplatz

Requires Node.js 22.12+ or 24+.

```sh
cd 3d/alexanderplatz/gpt-6-1-sol
npm ci
npm run dev
```

Open the local URL printed by Vite. Run build and test commands from that same app directory:

```sh
npm run build
npm test
npm run test:browser
npm run test:production
```

Browser tests require the dev server on port 5173 and an installed Chrome. Build explicitly before the production test if npm lifecycle scripts are disabled. See the [app README](3d/alexanderplatz/gpt-6-1-sol/README.md) for controls, fidelity limits, data attribution and verification details.

### Fable 5.2

```sh
cd 3d/alexanderplatz/claude-fable-5-2
npm ci
npm run dev
npm test   # unit tests, then Playwright against the production build
```

The [app README](3d/alexanderplatz/claude-fable-5-2/README.md) covers controls, landmark dimensions, code layout, accuracy limits and attribution.
