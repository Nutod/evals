import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import path from "node:path";

const addonEntries = [
  "controls/OrbitControls.js",
  "postprocessing/EffectComposer.js",
  "postprocessing/RenderPass.js",
  "postprocessing/UnrealBloomPass.js",
  "postprocessing/OutputPass.js",
  "utils/BufferGeometryUtils.js",
];
const vendor = "vendor/three-0.183.0";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "production-import-map",
      transformIndexHtml: {
        order: "post",
        handler(html, ctx) {
          if (ctx.bundle) {
            const map = `<script type="importmap">{"imports":{"three":"./${vendor}/three.module.js","three/addons/":"./${vendor}/addons/"}}</script>`;
            html = html.replace(
              /<script type="importmap">[\s\S]*?<\/script>/,
              "",
            );
            return html.replace(
              /<script type="module"/,
              `${map}\n<script type="module"`,
            );
          }
        },
      },
      async generateBundle() {
        for (const file of ["three.module.js", "three.core.js"]) {
          this.emitFile({
            type: "asset",
            fileName: `${vendor}/${file}`,
            source: await readFile(`node_modules/three/build/${file}`, "utf8"),
          });
        }
        const pending = [...addonEntries],
          emitted = new Set();
        while (pending.length) {
          const file = pending.pop();
          if (emitted.has(file)) continue;
          emitted.add(file);
          const source = await readFile(
            `node_modules/three/examples/jsm/${file}`,
            "utf8",
          );
          this.emitFile({
            type: "asset",
            fileName: `${vendor}/addons/${file}`,
            source,
          });
          for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            if (match[1].startsWith("."))
              pending.push(
                path.posix.normalize(
                  path.posix.join(path.posix.dirname(file), match[1]),
                ),
              );
          }
        }
      },
    },
  ],
  build: {
    rollupOptions: {
      external: (id) => id === "three" || id.startsWith("three/addons/"),
    },
  },
});
