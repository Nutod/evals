import * as THREE from 'three';
import type { App } from '../app';
import type { CameraMode } from '../camera/rig';
import { osm, toLatLon } from '../data/osm';
import type { LightingId } from '../env/lighting';
import { LAYERS, type LayerId } from '../world/world';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const touch = matchMedia('(pointer: coarse)').matches;

const MODE_HINTS: Record<CameraMode, string> = {
  orbit: touch ? 'Drag to orbit, two fingers to pan, pinch to zoom.' : 'Drag to orbit, right-drag to pan, scroll to zoom.',
  top: touch ? 'North-up map. Drag to pan, pinch to zoom.' : 'North-up map. Drag to pan, scroll to zoom.',
  street: touch ? 'Eye height 1.7 m. Drag to look, use the stick to walk.' : 'Eye height 1.7 m. Drag to look, WASD or arrows to walk, Shift to run.',
};

/** Marks one button in a group as pressed. */
function press(group: HTMLElement, match: (b: HTMLButtonElement) => boolean): void {
  for (const b of group.querySelectorAll('button')) b.setAttribute('aria-pressed', String(match(b)));
}

function niceLength(max: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const lead = max / pow;
  return (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * pow;
}

export function createUi(app: App): void {
  const panel = $('#panel');

  // ---------- camera ----------
  const modeGroup = $('#mode');
  const stick = $('#stick');
  const showMode = (mode: CameraMode): void => {
    press(modeGroup, (b) => b.dataset.mode === mode);
    $('#mode-hint').textContent = MODE_HINTS[mode];
    stick.hidden = !(mode === 'street' && touch);
    document.body.dataset.mode = mode;
  };
  modeGroup.addEventListener('click', (e) => {
    const mode = (e.target as HTMLElement).closest('button')?.dataset.mode as CameraMode | undefined;
    if (mode) app.setMode(mode);
  });
  app.rig.onModeChange = showMode;
  showMode(app.rig.mode);

  // ---------- light ----------
  const lightGroup = $('#lighting');
  const setLight = (id: LightingId, immediate = false): void => {
    app.setLighting(id, immediate);
    press(lightGroup, (b) => b.dataset.light === id);
    document.body.dataset.light = id;
  };
  lightGroup.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest('button')?.dataset.light as LightingId | undefined;
    if (id) setLight(id);
  });
  document.body.dataset.light = app.lighting.id;

  // ---------- landmarks ----------
  const list = $('#landmarks');
  const card = $('#landmark-card');
  const select = (id: string): void => {
    const lm = app.landmarks.find((l) => l.id === id);
    if (!lm) return;
    app.focusLandmark(id);
    for (const b of list.querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset.id === id));
    $('#card-kind').textContent = lm.kind;
    $('#card-name').textContent = lm.name;
    $('#card-facts').replaceChildren(
      ...lm.facts.map((f) => {
        const li = document.createElement('li');
        li.textContent = f;
        return li;
      }),
    );
    $('#card-approx').textContent = lm.approximated;
    card.hidden = false;
    document.body.dataset.landmark = id;
  };
  const labels = $('#labels');
  const labelEls: { el: HTMLButtonElement; anchor: THREE.Vector3 }[] = [];
  app.landmarks.forEach((lm, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = lm.id;
    b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span class="name"></span><span class="height">${lm.height} m</span>`;
    b.querySelector('.name')!.textContent = lm.name;
    b.addEventListener('click', () => select(lm.id));
    li.append(b);
    list.append(li);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'label';
    label.tabIndex = -1;
    label.dataset.id = lm.id;
    label.innerHTML = `<span class="num">${i + 1}</span><span></span>`;
    label.lastElementChild!.textContent = lm.name;
    label.addEventListener('click', () => select(lm.id));
    labels.append(label);
    labelEls.push({ el: label, anchor: new THREE.Vector3(...lm.anchor) });
  });

  // ---------- layers ----------
  const layerBox = $('#layers');
  for (const layer of LAYERS) {
    const label = document.createElement('label');
    label.className = 'check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.layer = layer.id;
    const span = document.createElement('span');
    span.textContent = layer.label;
    label.append(input, span);
    layerBox.append(label);
    input.addEventListener('change', () => {
      app.setLayer(layer.id as LayerId, input.checked);
      if (layer.id === 'labels') labels.hidden = !input.checked;
    });
  }

  // ---------- animation ----------
  const play = $<HTMLButtonElement>('#play');
  const setPlaying = (on: boolean): void => {
    app.playing = on;
    play.textContent = on ? 'Pause' : 'Play';
    play.setAttribute('aria-pressed', String(on));
  };
  play.addEventListener('click', () => setPlaying(!app.playing));
  const speedGroup = $('#speed');
  speedGroup.addEventListener('click', (e) => {
    const speed = Number((e.target as HTMLElement).closest('button')?.dataset.speed);
    if (!speed) return;
    app.speed = speed;
    press(speedGroup, (b) => Number(b.dataset.speed) === speed);
  });
  const autoOrbit = $<HTMLInputElement>('#auto-orbit');
  autoOrbit.addEventListener('change', () => (app.rig.autoRotate = autoOrbit.checked));
  // any manual camera move ends the slow circle
  app.canvas.addEventListener('pointerdown', () => {
    if (autoOrbit.checked) {
      autoOrbit.checked = false;
      app.rig.autoRotate = false;
    }
  });

  // ---------- export ----------
  let exportScale = 1;
  const scaleGroup = $('#export-scale');
  scaleGroup.addEventListener('click', (e) => {
    const scale = Number((e.target as HTMLElement).closest('button')?.dataset.scale);
    if (!scale) return;
    exportScale = scale;
    press(scaleGroup, (b) => Number(b.dataset.scale) === scale);
  });
  const status = $('#export-status');
  const exportPng = async (): Promise<void> => {
    status.textContent = 'Rendering…';
    try {
      const blob = await app.exportPng(exportScale);
      const bitmap = await createImageBitmap(blob);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alexanderplatz-${app.lighting.id}-${bitmap.width}x${bitmap.height}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      status.textContent = `Saved ${bitmap.width} × ${bitmap.height} px`;
      bitmap.close();
    } catch (err) {
      status.textContent = `Export failed: ${(err as Error).message}`;
    }
  };
  $('#export').addEventListener('click', () => void exportPng());

  // ---------- about ----------
  const about = $<HTMLDialogElement>('#about');
  $('#about-date').textContent = new Date(osm.meta.osmBase).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  $('#about-open').addEventListener('click', () => about.showModal());

  // ---------- HUD ----------
  $('#compass').addEventListener('click', () => app.rig.resetNorth());
  $('#zoom-in').addEventListener('click', () => app.rig.zoomBy(0.7));
  $('#zoom-out').addEventListener('click', () => app.rig.zoomBy(1 / 0.7));

  // ---------- walk stick (touch, street mode) ----------
  const knob = $('#stick-knob');
  let stickPointer = -1;
  const moveStick = (e: PointerEvent): void => {
    const r = stick.getBoundingClientRect();
    const half = r.width / 2;
    let x = (e.clientX - r.left - half) / half;
    let y = (e.clientY - r.top - half) / half;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    knob.style.transform = `translate(${x * (half - 24)}px, ${y * (half - 24)}px)`;
    app.rig.stick.set(x, -y);
  };
  const endStick = (e: PointerEvent): void => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = -1;
    knob.style.transform = '';
    app.rig.stick.set(0, 0);
  };
  stick.addEventListener('pointerdown', (e) => {
    stickPointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickPointer) moveStick(e);
  });
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  // ---------- bottom sheet (small screens) ----------
  const tabs = $('#tabs');
  const handle = $('#sheet-handle');
  const sections = [...panel.querySelectorAll<HTMLElement>('.panel-body section')];
  const setOpen = (open: boolean): void => {
    panel.classList.toggle('open', open);
    handle.setAttribute('aria-expanded', String(open));
  };
  const showTab = (tab: string): void => {
    for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    for (const s of sections) s.classList.toggle('active', s.dataset.section === tab);
  };
  tabs.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest('button')?.dataset.tab;
    if (!tab) return;
    const current = tabs.querySelector('[aria-selected="true"]')?.getAttribute('data-tab');
    setOpen(!(panel.classList.contains('open') && current === tab));
    showTab(tab);
  });
  handle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  showTab('view');
  const sheetQuery = matchMedia('(max-width: 760px)');
  const syncSheet = (): void => {
    document.documentElement.style.setProperty('--sheet-h', sheetQuery.matches ? `${panel.offsetHeight}px` : '0px');
  };
  new ResizeObserver(syncSheet).observe(panel);
  sheetQuery.addEventListener('change', syncSheet);

  // ---------- keyboard ----------
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || about.open) return;
    const el = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= app.landmarks.length) select(app.landmarks[n - 1].id);
    else if (e.key === 'o') app.setMode('orbit');
    else if (e.key === 't') app.setMode('top');
    else if (e.key === 'g') app.setMode('street');
    else if (e.key === 'l') setLight(({ day: 'golden', golden: 'blue', blue: 'day' } as const)[app.lighting.id]);
    else if (e.key === 'p') void exportPng();
    else if (e.code === 'Space' && el.tagName !== 'BUTTON') {
      e.preventDefault();
      setPlaying(!app.playing);
    }
  });

  // ---------- per-frame readouts ----------
  const needle = $('#compass-needle');
  const scaleLine = $('#scale-line');
  const scaleText = $('#scale-text');
  const coords = $('#coords');
  const clock = $('#clock');
  const focus = new THREE.Vector3();
  const projected = new THREE.Vector3();
  let lastClock = '';
  let tick = 0;
  app.onFrame(() => {
    const camera = app.rig.camera;
    needle.style.transform = `rotate(${-app.rig.bearing()}deg)`;

    const w = app.canvas.clientWidth;
    const h = app.canvas.clientHeight;
    if (!labels.hidden) {
      for (const { el, anchor } of labelEls) {
        projected.copy(anchor).project(camera);
        const visible = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
        el.style.display = visible ? '' : 'none';
        if (visible) {
          const x = (projected.x * 0.5 + 0.5) * w;
          const y = (-projected.y * 0.5 + 0.5) * h;
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - 12px))`;
        }
      }
    }

    // text readouts change slowly; refresh them a few times a second
    if (tick++ % 6) return;
    if (document.body.dataset.light !== app.lighting.id) {
      press(lightGroup, (b) => b.dataset.light === app.lighting.id);
      document.body.dataset.light = app.lighting.id;
    }
    const metresPerPixel = (2 * app.rig.viewDistance() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h;
    const length = niceLength(metresPerPixel * 120);
    scaleLine.style.width = `${(length / metresPerPixel).toFixed(0)}px`;
    scaleText.textContent = length >= 1000 ? `${length / 1000} km` : `${length} m`;
    app.rig.focusPoint(focus);
    const { lat, lon } = toLatLon(focus.x, focus.z);
    coords.textContent = `${lat.toFixed(5)}° N  ${lon.toFixed(5)}° E`;
    const minutes = Math.floor(app.dayTime / 60);
    const text = `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    if (text !== lastClock) clock.textContent = lastClock = text;
  });

  // ---------- deep links: ?light=blue&mode=top&landmark=rathaus&paused=1 ----------
  const params = new URLSearchParams(location.search);
  const light = params.get('light');
  if (light === 'day' || light === 'golden' || light === 'blue') setLight(light, true);
  const mode = params.get('mode');
  if (mode === 'top' || mode === 'street') app.setMode(mode);
  const landmark = params.get('landmark');
  if (landmark) select(landmark);
  if (params.get('paused')) setPlaying(false);
  if (params.get('labels') === '0') {
    const input = layerBox.querySelector<HTMLInputElement>('[data-layer="labels"]')!;
    input.checked = false;
    input.dispatchEvent(new Event('change'));
  }
}
