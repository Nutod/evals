import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: { dedupe: ['three'] },
  build: { license: true, target: 'es2022', chunkSizeWarningLimit: 1800 },
});
