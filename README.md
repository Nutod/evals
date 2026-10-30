# Evals

AI-generated implementations of shared coding tasks, organized by category, task and model. Each implementation has its own source, dependencies, tests and run instructions.

## 3D evaluations

| Task                   | Model       | Implementation                                                  |
| ---------------------- | ----------- | --------------------------------------------------------------- |
| Alexanderplatz, Berlin | GPT-6.1 Sol | [3d/alexanderplatz/gpt-6-1-sol](3d/alexanderplatz/gpt-6-1-sol/) |

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
