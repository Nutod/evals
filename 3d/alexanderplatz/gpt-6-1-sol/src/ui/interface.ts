import { LANDMARKS } from '../world/landmark-data';
import { icon } from './icons';

export type Lighting = 'day' | 'golden' | 'blue';
export type View = 'perspective' | 'top' | 'street';
export interface ExplorerState {
  lighting: Lighting;
  view: View;
  landmark: string | null;
  paused: boolean;
  orbit: boolean;
  labels: boolean;
  vegetation: boolean;
  traffic: boolean;
}
export type Action =
  | { type: 'landmark'; id: string }
  | { type: 'lighting'; value: Lighting }
  | { type: 'view'; value: View }
  | { type: 'toggle'; key: 'paused' | 'orbit' | 'labels' | 'vegetation' | 'traffic' }
  | { type: 'reset' | 'capture' | 'fullscreen' };

const iconButton = (name: string, label: string, action: string) =>
  `<button class="icon-button" data-action="${action}" aria-label="${label}" title="${label}">${icon(name)}</button>`;

export function createInterface(onAction: (action: Action) => void) {
  const root = document.querySelector<HTMLDivElement>('#app')!;
  root.innerHTML = `
    <main class="explorer" aria-label="Alexanderplatz 3D explorer">
      <div id="viewport" aria-label="Interactive 3D model of Alexanderplatz"></div>
      <div class="canvas-shade" aria-hidden="true"></div>
      <header class="topbar">
        <a class="brand" href="./" aria-label="Atlas home">${icon('brand')}<span>ATLAS<span class="brand-slash">/</span><span class="brand-edition">BERLIN 001</span></span></a>
        <div class="header-centre"><span class="status-dot"></span> A PLACE, IN PERSPECTIVE</div>
        <div class="header-actions">${iconButton('info', 'About this model and controls', 'help')}${iconButton('camera', 'Save a scene image', 'capture')}${iconButton('expand', 'Enter fullscreen', 'fullscreen')}</div>
      </header>
      <aside class="place-panel">
        <div class="eyebrow"><span class="location-cross">+</span> GERMANY <span class="muted">/</span> BERLIN MITTE</div>
        <h1>Alexanderplatz<span>.</span></h1>
        <p class="place-subtitle">A piece of Berlin. Built entirely in code.</p>
        <div class="coordinates">52°31′18.8″N <span>13°24′47.5″E</span></div>
        <select class="mobile-places" aria-label="Choose a landmark"><option value="">Explore landmarks</option>${LANDMARKS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select>
        <div class="places-heading"><span>POINTS OF INTEREST</span><span>06</span></div>
        <nav class="landmark-list" aria-label="Explore landmarks">
          ${LANDMARKS.map((p, i) => `<button class="landmark-row" data-landmark="${p.id}" aria-pressed="false"><span class="place-number">0${i + 1}</span><span class="place-name">${p.name}</span><span class="place-height">${p.height}<small>m</small></span>${icon('arrow')}</button>`).join('')}
        </nav>
        <div class="model-note"><span class="note-line"></span><span>Real footprints. Procedural architecture.<br>One unit, one metre.</span></div>
      </aside>
      <aside class="scene-controls" aria-label="Scene controls">
        <section class="light-panel panel">
          <div class="panel-heading"><span>ATMOSPHERE</span><span id="light-time">18:42</span></div>
          <div class="light-options" role="group" aria-label="Time of day">
            <button data-lighting="day" aria-label="Daylight" aria-pressed="false">${icon('sun')}<span>Daylight</span></button>
            <button data-lighting="golden" aria-label="Golden hour" aria-pressed="true">${icon('sunset')}<span>Golden</span></button>
            <button data-lighting="blue" aria-label="Blue hour" aria-pressed="false">${icon('moon')}<span>Blue hour</span></button>
          </div>
        </section>
        <details class="layers-panel panel" ${window.innerWidth > 760 && window.innerHeight > 620 ? 'open' : ''}>
          <summary>${icon('layers')}<span>Scene layers</span><span class="details-chevron">⌄</span></summary>
          ${[
            ['labels', 'Place labels'],
            ['vegetation', 'Urban greenery'],
            ['traffic', 'City life'],
          ]
            .map(
              ([key, name]) =>
                `<label class="toggle-row"><span>${name}</span><input type="checkbox" data-toggle="${key}" checked/><span class="switch" aria-hidden="true"></span></label>`,
            )
            .join('')}
        </details>
      </aside>
      <div id="labels" aria-label="Landmark markers"></div>
      <section id="detail-card" class="detail-card panel" hidden aria-live="polite"></section>
      <div class="orientation" aria-hidden="true"><span class="north">N</span><svg viewBox="0 0 64 64" id="compass"><circle cx="32" cy="32" r="29"/><path class="compass-north" d="m32 12 7 22-7-4-7 4Z"/><path class="compass-south" d="m32 52 7-22-7 4-7-4Z"/></svg><span class="scale-bar"></span><span id="scale-text">100 m</span></div>
      <div class="bottom-bar">
        <div class="render-status"><span class="status-dot"></span><span>PROCEDURAL WORLD</span><span class="status-divider">/</span><span id="building-count">346 BUILDINGS</span></div>
        <div class="view-toolbar panel" role="group" aria-label="Camera controls">
          <button data-view="perspective" aria-label="Perspective view" aria-pressed="true">${icon('perspective')}<span>Perspective</span></button>
          <button data-view="top" aria-label="Top down view" aria-pressed="false">${icon('map')}<span>Top down</span></button>
          <button data-view="street" aria-label="Street view" aria-pressed="false">${icon('street')}<span>Street</span></button>
          <span class="toolbar-divider"></span>
          <button data-action="orbit" aria-label="Toggle camera orbit" aria-pressed="false">${icon('orbit')}<span>Orbit</span></button>
          ${iconButton('pause', 'Pause city animation', 'paused')}
          ${iconButton('reset', 'Reset camera', 'reset')}
        </div>
        <div class="interaction-hint">DRAG TO ORBIT <span>·</span> SCROLL TO EXPLORE</div>
      </div>
      <footer><span>INDEPENDENT RECONSTRUCTION <span class="footer-separator">·</span> APPROXIMATE DETAIL</span><span>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a><span class="footer-separator">·</span> ODbL</span></footer>
      <div id="toast" role="status"></div>
      <div id="loader" class="loader"><div class="loader-content">${icon('brand')}<span class="eyebrow">ALEXANDERPLATZ / BERLIN</span><h2>A city, line by line.</h2><div class="loading-track"><span id="loading-progress"></span></div><p id="loading-message">Laying the foundations…</p><span class="loader-footnote">NO MODELS. NO MAP TILES. JUST CODE.</span></div></div>
      <dialog id="help-dialog" aria-labelledby="help-title"><button class="icon-button dialog-close" aria-label="Close information">${icon('close')}</button><div class="eyebrow">ABOUT THE RECONSTRUCTION</div><h2 id="help-title">A place you know.<br>A different way to see it.</h2><p>This is an independent procedural portrait of Alexanderplatz. Buildings and streets follow baked OpenStreetMap coordinates. Every mesh, facade texture, tree and vehicle is generated in code.</p><p>One scene unit equals one metre. Landmark heights use documented dimensions. Facades, street furniture and some placements are approximations, not a surveyed digital twin. The scene is not Google Earth imagery.</p><div class="help-grid"><span>Orbit</span><kbd>Drag</kbd><span>Pan</span><kbd>Right-drag</kbd><span>Zoom</span><kbd>Scroll / pinch</kbd><span>Visit a landmark</span><kbd>1–6</kbd><span>Pause city / resume</span><kbd>Space</kbd><span>Change atmosphere</span><kbd>T</kbd><span>Reset camera</span><kbd>R</kbd><span>Place labels</span><kbd>L</kbd></div><p class="help-small">On touchscreens, use one finger to orbit and two to pan or zoom. Atmospheric times are art-directed presets, not a live solar simulation.</p></dialog>
    </main>`;

  const help = root.querySelector<HTMLDialogElement>('#help-dialog')!;
  const openHelp = () => (help.open ? help.close() : help.showModal());
  root.querySelector('.dialog-close')!.addEventListener('click', () => help.close());
  help.addEventListener('click', (event) => {
    if (event.target === help) {
      const r = help.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        help.close();
    }
  });
  root.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    const d = target.dataset;
    if (d.landmark) onAction({ type: 'landmark', id: d.landmark });
    else if (d.lighting) onAction({ type: 'lighting', value: d.lighting as Lighting });
    else if (d.view) onAction({ type: 'view', value: d.view as View });
    else if (d.action === 'help') openHelp();
    else if (d.action === 'orbit' || d.action === 'paused') onAction({ type: 'toggle', key: d.action });
    else if (d.action === 'reset' || d.action === 'capture' || d.action === 'fullscreen')
      onAction({ type: d.action });
  });
  root.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.dataset.toggle)
      onAction({ type: 'toggle', key: target.dataset.toggle as 'labels' | 'vegetation' | 'traffic' });
    else if (target.classList.contains('mobile-places')) {
      if (target.value) onAction({ type: 'landmark', id: target.value });
      else onAction({ type: 'reset' });
    }
  });

  let toastTimeout = 0;
  let previousLandmark: string | null | undefined;
  function toast(message: string) {
    const element = root.querySelector<HTMLElement>('#toast')!;
    element.textContent = message;
    element.classList.add('visible');
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => element.classList.remove('visible'), 3000);
  }

  function update(state: ExplorerState) {
    root
      .querySelectorAll<HTMLElement>('[data-landmark]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.landmark === state.landmark)));
    root
      .querySelectorAll<HTMLElement>('[data-lighting]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.lighting === state.lighting)));
    root
      .querySelectorAll<HTMLElement>('[data-view]')
      .forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.view === state.view)));
    root.querySelector<HTMLSelectElement>('.mobile-places')!.value = state.landmark ?? '';
    root
      .querySelectorAll<HTMLInputElement>('[data-toggle]')
      .forEach((el) => (el.checked = state[el.dataset.toggle as 'labels' | 'vegetation' | 'traffic']));
    root.querySelector('[data-action="orbit"]')!.setAttribute('aria-pressed', String(state.orbit));
    const pause = root.querySelector<HTMLButtonElement>('[data-action="paused"]')!;
    pause.innerHTML = icon(state.paused ? 'play' : 'pause');
    pause.setAttribute('aria-label', state.paused ? 'Resume city animation' : 'Pause city animation');
    pause.setAttribute('aria-pressed', String(state.paused));
    root.querySelector('#light-time')!.textContent = { day: '12:30', golden: '18:42', blue: '20:16' }[
      state.lighting
    ];
    if (previousLandmark !== state.landmark) {
      const detail = root.querySelector<HTMLElement>('#detail-card')!;
      const place = LANDMARKS.find((p) => p.id === state.landmark);
      if (place) {
        detail.hidden = false;
        detail.innerHTML = `<div class="eyebrow">${place.category}<button class="icon-button" data-action="reset" aria-label="Return to overview">${icon('close')}</button></div><h2>${place.name}</h2><p>${place.description}</p><div class="detail-facts"><span>BUILT <strong>${place.year}</strong></span><span>HEIGHT <strong>${place.height} m</strong></span></div>`;
      } else detail.hidden = true;
      root.querySelector('.place-panel')!.classList.toggle('has-selection', !!place);
      previousLandmark = state.landmark;
    }
  }

  function loading(progress: number, message: string) {
    root.querySelector<HTMLElement>('#loading-progress')!.style.width = `${progress}%`;
    root.querySelector('#loading-message')!.textContent = message;
  }

  return {
    root,
    toast,
    update,
    loading,
    openHelp,
    ready() {
      root.querySelector('#loader')!.classList.add('loaded');
    },
  };
}
