import '@fontsource/geist-sans/latin-400.css';
import '@fontsource/geist-sans/latin-500.css';
import '@fontsource/geist-sans/latin-600.css';
import '@fontsource/geist-sans/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './ui/styles.css';
import { App } from './app';
import { createUi } from './ui/ui';

declare global {
  interface Window {
    /** Handle for browser tests and console poking. */
    __alex?: App;
  }
}

const loading = document.querySelector<HTMLElement>('#loading')!;
const bar = document.querySelector<HTMLElement>('#progress-bar')!;
const label = document.querySelector<HTMLElement>('#progress-label')!;

async function start(): Promise<void> {
  // signs and labels are drawn to canvas, so their fonts must be ready first
  await Promise.all(['600 16px "Barlow Condensed"', '700 16px "Barlow Condensed"', '700 16px "Geist Sans"', '500 16px "Geist Sans"'].map((f) => document.fonts.load(f)));
  const app = new App(document.querySelector<HTMLCanvasElement>('#scene')!);
  window.__alex = app;
  await app.build({
    onProgress: (fraction, text) => {
      bar.style.width = `${Math.round(fraction * 100)}%`;
      label.textContent = text;
    },
  });
  createUi(app);
  app.start();
  loading.classList.add('done');
}

start().catch((err: unknown) => {
  console.error(err);
  label.textContent = `Could not start: ${err instanceof Error ? err.message : String(err)}`;
});
