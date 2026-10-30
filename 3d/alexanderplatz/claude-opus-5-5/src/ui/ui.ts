import * as THREE from 'three';
import { LAYERS, type App, type LayerKey } from '../app';
import type { CameraMode } from '../camera/rig';
import type { LightPreset } from '../scene/lighting';
import type { LandmarkKey } from '../osm';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const HINTS: Record<CameraMode, { mouse: string; touch: string }> = {
  orbit: { mouse: 'Drag to orbit · Right-drag to pan · Scroll to zoom', touch: 'Drag to orbit · Pinch to zoom · Two fingers to pan' },
  top: { mouse: 'Drag to pan · Scroll to zoom · North is up', touch: 'Drag to pan · Pinch to zoom · North is up' },
  street: { mouse: 'Eye height 1.7 m · Drag to look · <kbd>W A S D</kbd> to walk · <kbd>Shift</kbd> to run', touch: 'Eye height 1.7 m · Drag to look · Use the stick to walk' },
};

const NICE_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

/** Wires the DOM controls to the app. */
export function bindUI(app: App) {
  const touch = matchMedia('(pointer: coarse)').matches;
  const panel = $('panel');

  // ---- segmented controls
  const segmented = (group: string, onSelect: (value: string) => void) => {
    const root = document.querySelector<HTMLElement>(`[data-group="${group}"]`)!;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
    const select = (value: string, fire = true) => {
      for (const b of buttons) {
        b.setAttribute('aria-checked', String(b.dataset.value === value));
        b.tabIndex = b.dataset.value === value ? 0 : -1;
      }
      if (fire) onSelect(value);
    };
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b?.dataset.value) select(b.dataset.value);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
      const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      select(next.dataset.value!);
      next.focus();
      e.preventDefault();
    });
    select(buttons.find((b) => b.getAttribute('aria-checked') === 'true')!.dataset.value!, false);
    return select;
  };

  const hint = $('hint');
  let hintTimer = 0;
  const showHint = (mode: CameraMode) => {
    hint.innerHTML = touch ? HINTS[mode].touch : HINTS[mode].mouse;
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hint.innerHTML = ''), 6000);
  };

  const joystick = $('joystick');
  const selectMode = segmented('mode', (value) => {
    app.setMode(value as CameraMode);
    joystick.hidden = !(value === 'street' && touch);
    showHint(value as CameraMode);
  });
  segmented('light', (value) => app.setLighting(value as LightPreset));

  // ---- fly-around (Google Earth style circling)
  const circle = $<HTMLButtonElement>('circle');
  circle.addEventListener('click', () => {
    const on = !app.rig.circling;
    if (on && app.rig.mode !== 'orbit') selectMode('orbit');
    app.rig.setCircling(on);
  });
  app.rig.onCircling((on) => circle.setAttribute('aria-pressed', String(on)));
  segmented('speed', (value) => (app.speed = Number(value)));

  // ---- landmarks
  const list = $('landmarks');
  const tallest = Math.max(...app.landmarks.map((l) => l.labelAt.y));
  const landmarkButtons = new Map<LandmarkKey, HTMLButtonElement>();
  const markCurrent = (key: LandmarkKey | null) => {
    for (const [k, b] of landmarkButtons) b.setAttribute('aria-current', String(k === key));
  };
  for (const l of app.landmarks) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.dataset.landmark = l.key;
    const pct = Math.max(3, (l.labelAt.y / tallest) * 100);
    b.innerHTML = `<span class="lm-name"></span><span class="lm-detail"></span><span class="lm-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>`;
    b.querySelector('.lm-name')!.textContent = l.name;
    b.querySelector('.lm-detail')!.textContent = l.detail;
    b.addEventListener('click', () => {
      app.flyTo(l.key);
      markCurrent(l.key);
      if (innerWidth <= 760) setSheet(false);
    });
    landmarkButtons.set(l.key, b);
    li.append(b);
    list.append(li);
  }
  markCurrent('fernsehturm');

  // ---- layers
  const layers = $('layers');
  for (const [key, label] of Object.entries(LAYERS) as [LayerKey, string][]) {
    const wrap = document.createElement('label');
    wrap.className = 'toggle';
    wrap.innerHTML = `<input type="checkbox" checked data-layer="${key}"><span class="switch" aria-hidden="true"></span><span></span>`;
    wrap.lastElementChild!.textContent = label;
    wrap.querySelector('input')!.addEventListener('change', (e) => {
      const on = (e.target as HTMLInputElement).checked;
      if (key === 'labels') labelsRoot.hidden = !on;
      else app.setLayer(key, on);
    });
    layers.append(wrap);
  }

  // ---- motion
  const play = $<HTMLButtonElement>('play');
  const setPlaying = (on: boolean) => {
    app.playing = on;
    play.setAttribute('aria-pressed', String(on));
    play.querySelector('span')!.textContent = on ? 'Pause' : 'Play';
  };
  play.addEventListener('click', () => setPlaying(!app.playing));

  // ---- export
  const exportButton = $<HTMLButtonElement>('export');
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const blob = await app.exportPNG();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `alexanderplatz-${app.lighting.current}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally {
      exportButton.disabled = false;
    }
  });

  // ---- about dialog
  const about = $<HTMLDialogElement>('about');
  $('about-open').addEventListener('click', () => about.showModal());

  // ---- mobile bottom sheet
  const toggle = $<HTMLButtonElement>('sheet-toggle');
  const setSheet = (open: boolean) => {
    panel.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
    requestAnimationFrame(updateSheetHeight);
  };
  const updateSheetHeight = () => document.documentElement.style.setProperty('--sheet-h', `${panel.getBoundingClientRect().height}px`);
  toggle.addEventListener('click', () => setSheet(panel.dataset.open !== 'true'));
  new ResizeObserver(updateSheetHeight).observe(panel);

  // ---- joystick (street mode on touch screens)
  const knob = joystick.querySelector<HTMLElement>('.joystick-knob')!;
  let stickPointer: number | null = null;
  const moveStick = (e: PointerEvent) => {
    const r = joystick.getBoundingClientRect();
    const max = r.width / 2;
    const v = new THREE.Vector2(e.clientX - (r.left + max), e.clientY - (r.top + max));
    if (v.length() > max) v.setLength(max);
    knob.style.transform = `translate(${v.x}px, ${v.y}px)`;
    app.rig.street.stick.set(v.x / max, -v.y / max);
  };
  joystick.addEventListener('pointerdown', (e) => {
    stickPointer = e.pointerId;
    joystick.setPointerCapture(e.pointerId);
    moveStick(e);
    e.stopPropagation();
  });
  joystick.addEventListener('pointermove', (e) => e.pointerId === stickPointer && moveStick(e));
  const releaseStick = (e: PointerEvent) => {
    if (e.pointerId !== stickPointer) return;
    stickPointer = null;
    knob.style.transform = '';
    app.rig.street.stick.set(0, 0);
  };
  joystick.addEventListener('pointerup', releaseStick);
  joystick.addEventListener('pointercancel', releaseStick);

  // ---- map labels
  const labelsRoot = $('labels');
  const labels = app.landmarks.map((l) => {
    const el = document.createElement('button');
    el.className = 'map-label';
    el.dataset.landmark = l.key;
    el.innerHTML = '<span class="tag"></span><span class="stem"></span><span class="dot"></span>';
    el.querySelector('.tag')!.textContent = l.name;
    el.addEventListener('click', () => {
      app.flyTo(l.key);
      markCurrent(l.key);
    });
    labelsRoot.append(el);
    return { el, at: l.labelAt };
  });

  // ---- HUD
  const needle = $('compass-needle');
  const scaleBar = $('scale-bar');
  const scaleLabel = $('scale-label');
  const coords = $('coords');
  $('compass').addEventListener('click', () => app.rig.faceNorth());

  const v = new THREE.Vector3();
  let hudFrame = 0;
  app.onFrame(() => {
    const cam = app.rig.camera;
    const w = innerWidth, h = innerHeight;
    if (!labelsRoot.hidden) {
      for (const { el, at } of labels) {
        v.copy(at).project(cam);
        const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        el.style.display = visible ? '' : 'none';
        if (visible) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      }
    }
    needle.setAttribute('transform', `rotate(${-app.rig.heading()} 20 20)`);
    if (hudFrame++ % 6) return;
    const mpp = app.rig.metresPerPixel();
    const target = mpp * 96;
    const step = NICE_STEPS.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best));
    scaleBar.style.width = `${Math.round(step / mpp)}px`;
    scaleLabel.textContent = step >= 1000 ? `${step / 1000} km` : `${step} m`;
    const [lat, lon] = app.coordinates();
    coords.textContent = `${lat.toFixed(5)}° N  ${lon.toFixed(5)}° E`;
  });

  showHint('orbit');
  updateSheetHeight();
  return { selectMode, setPlaying };
}
