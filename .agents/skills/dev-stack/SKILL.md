---
name: dev-stack
description: Start, stop and verify the procedural Alexanderplatz Vite app.
---

# Dev stack

- The app is `3d/alexanderplatz/gpt-6-1-sol/`. Run every npm command below from that directory, not the repository root. From root, `npm --prefix 3d/alexanderplatz/gpt-6-1-sol run <script>` is equivalent.
- Install with `npm install`.
- Start with `npm run dev -- --port 5173 --strictPort`. If 5173 belongs to another process, choose another port and pass it via `BASE_URL` for browser tests. Never stop an unknown listener.
- Build with `npm run build`; unit tests with `npm test`; browser tests with `npm run test:browser`.
- Production verification is `npm run build` followed by `npm run test:production`. This environment has npm `ignore-scripts=true`, which skips the pre-test build hook, so never infer build freshness from a production-test pass alone. Do not change global npm settings. The production Playwright config owns and cleans up its preview on port 5174.
- Stop only the Vite process started for this task. Restart on the same port and verify the page's `meta[name="application-name"]` is `Alexanderplatz Atlas`, and that the rendered canvas/scene is present. A listening port is not restart proof.
- There is no server database, seed state, login, backend, API key or external runtime asset requirement.
- Browser verification uses Playwright with console, pageerror and failed-request collection. Screenshots go to the app's `test-results/`, ignored by git. Repository checkpoint evidence remains in root `.context/`, also ignored.
- WebGL must be available in the browser. Lack of a working browser/WebGL is a BLOCKED rendering gate, not a pass. Headless Chromium can use SwiftShader.
- No automatic commits or pushes.
