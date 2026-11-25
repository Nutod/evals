import './style.css';
import { Atlas } from './atlas';
import { LAYERS, type CameraMode, type Landmark } from './district';
import { elevation, icon, lightArt, logo, skyline } from './art';
import { createLocator, createMarkers } from './locator';
import type { Light } from './table';
import { Vector3 } from 'three';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document
  .querySelectorAll<HTMLElement>('i[data-icon]')
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon as Parameters<typeof icon>[0])));
$('brand-mark').innerHTML = logo;
$('skyline').innerHTML = skyline;
const dialog = $<HTMLDialogElement>('info');
$('about').onclick = () => dialog.showModal();
dialog.querySelector('button')!.onclick = () => dialog.close();
dialog.onclick = (e) => {
  if (e.target === dialog) {
    const b = dialog.getBoundingClientRect();
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom)
      dialog.close();
  }
};
const mobile = matchMedia('(max-width:760px)');
const coarse = matchMedia('(pointer:coarse)');
function guide(open: boolean) {
  $('guide').classList.toggle('expanded', open);
  $('mobile-guide').setAttribute('aria-expanded', String(open));
}
$('mobile-guide').onclick = () => guide(!$('guide').classList.contains('expanded'));
mobile.addEventListener('change', () => guide(false));
const shortTypes = [
  'Television tower',
  'High-rise hotel',
  'World clock',
  'Railway station',
  'City hall',
  'Gothic church',
];
const titles = [
  'Fernsehturm',
  'Park Inn',
  'Weltzeituhr',
  'Alexanderplatz station',
  'Rotes Rathaus',
  'Marienkirche',
];
const lights: [Light, string][] = [
  ['day', 'Daylight'],
  ['golden', 'Golden hour'],
  ['blue', 'Blue hour'],
];
const exportButton = $<HTMLButtonElement>('export');
exportButton.disabled = true;

function controls(atlas: Atlas) {
  const places = $('places'),
    modes = $('modes'),
    layers = $('layers-panel');
  const orbit = modes.querySelector<HTMLButtonElement>('[data-mode="orbit"]')!;
  const setAutoOrbit = (moving: boolean) => {
    atlas.rig.autoRotate = moving;
    orbit.querySelector('span')!.textContent = moving ? 'Stop orbit' : 'Orbit';
    orbit.title = moving ? 'Stop automatic orbit' : 'Start automatic orbit';
  };
  const takeControl = () => {
    if (atlas.rig.autoRotate) setAutoOrbit(false);
    if (atlas.rig.mode === 'orbit' && atlas.rig.flying) {
      // Finish at the current pose before OrbitControls receives the start of this gesture.
      atlas.rig.flyTo(atlas.rig.getState(), 0);
    }
  };
  $('surface').addEventListener('pointerdown', takeControl, { capture: true });
  $('surface').addEventListener('wheel', takeControl, { capture: true, passive: true });
  const setLayers = (open: boolean) => {
    layers.hidden = !open;
    $('layers-toggle').setAttribute('aria-expanded', String(open));
  };
  $('layers-toggle').onclick = () => setLayers(layers.hidden);
  layers.querySelector('button')!.onclick = () => setLayers(false);
  $('scene').addEventListener('pointerdown', () => {
    setLayers(false);
    guide(false);
  });
  const choose = (place: Landmark) => {
    setAutoOrbit(false);
    atlas.focus(place);
    guide(false);
    setLayers(false);
    places
      .querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === place.id)));
    const i = atlas.landmarks.indexOf(place);
    $('focus-kind').textContent = `${shortTypes[i]} · ${place.height} m`;
    $('focus-title').textContent = titles[i];
    $('focus-fact').textContent = place.facts[1] ?? place.facts[0];
    $('focus-card').hidden = false;
  };
  atlas.landmarks.forEach((place, i) => {
    const b = document.createElement('button');
    b.className = 'place';
    b.dataset.id = place.id;
    b.innerHTML = `<span class="drawing">${elevation(i)}</span><span class="place-copy"><span class="name">${titles[i]}</span><span class="kind">${shortTypes[i]}</span></span><span class="ordinal">${String(i + 1).padStart(2, '0')}</span>`;
    b.onclick = () => choose(place);
    places.append(b);
  });
  const reset = () => {
    setAutoOrbit(false);
    atlas.overview();
    $('focus-card').hidden = true;
    places.querySelectorAll('button').forEach((b) => b.removeAttribute('aria-current'));
    setLayers(false);
    guide(false);
  };
  $('reset').onclick = reset;
  $('focus-card').querySelector('button')!.onclick = reset;
  lights.forEach(([id, name], i) => {
    const b = document.createElement('button');
    b.className = 'light';
    b.dataset.light = id;
    b.setAttribute('aria-pressed', String(id === 'day'));
    b.innerHTML = `${lightArt(i)}<span>${name}</span>`;
    b.onclick = () => {
      atlas.setLight(id);
      document.body.dataset.light = id;
      $('lights')
        .querySelectorAll('button')
        .forEach((el) => el.setAttribute('aria-pressed', String(el === b)));
      if (mobile.matches) guide(false);
    };
    $('lights').append(b);
  });
  for (const layer of LAYERS) {
    const label = document.createElement('label');
    label.className = 'layer';
    label.textContent = layer.label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.layer = layer.id;
    input.onchange = () => atlas.setLayer(layer.id, input.checked);
    label.append(input);
    $('layers').append(label);
  }
  const showMode = (mode: CameraMode) => {
    document.body.dataset.mode = mode;
    modes
      .querySelectorAll('button')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('hint').textContent =
      mode === 'street'
        ? 'Drag to look · WASD to walk · Eye height 1.7 m'
        : mode === 'top'
          ? 'Drag to pan · Scroll to zoom · North up'
          : 'Drag to orbit · Right-drag to pan · Scroll to zoom';
    $('walk').hidden = mode !== 'street' || !coarse.matches;
  };
  modes.querySelectorAll('button').forEach(
    (b) =>
      (b.onclick = () => {
        setLayers(false);
        const mode = b.dataset.mode as CameraMode;
        if (mode !== atlas.rig.mode) atlas.setMode(mode);
        setAutoOrbit(mode === 'orbit' && !atlas.rig.autoRotate);
      }),
  );
  atlas.rig.onModeChange = showMode;
  showMode('orbit');
  $('north').onclick = () => { takeControl(); atlas.rig.resetNorth(); };
  $('zoom-in').onclick = () => { takeControl(); atlas.rig.zoomBy(0.75); };
  $('zoom-out').onclick = () => { takeControl(); atlas.rig.zoomBy(1 / 0.75); };
  const updatePlay = () => {
    const live = atlas.motion.playing;
    document.body.classList.toggle('paused', !live);
    $('sim-state').textContent = live ? 'Simulation live' : 'Simulation paused';
    $('play').innerHTML = icon(live ? 'pause' : 'play', 13);
    $('play').title = live ? 'Pause animation' : 'Play animation';
    $('play').setAttribute('aria-label', $('play').title);
  };
  $('play').onclick = () => {
    atlas.motion.playing = !atlas.motion.playing;
    updatePlay();
  };
  updatePlay();
  $('speed').onclick = () => {
    atlas.motion.speed = atlas.motion.speed === 4 ? 1 : atlas.motion.speed * 2;
    $('speed').textContent = `${atlas.motion.speed}×`;
  };
  const stick = $('walk'),
    knob = stick.querySelector('span')!;
  let pointer: number | undefined;
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const r = stick.getBoundingClientRect(),
      dx = e.clientX - r.x - r.width / 2,
      dy = e.clientY - r.y - r.height / 2;
    const norm = Math.max(25, Math.hypot(dx, dy));
    atlas.rig.stick.set(dx / norm, -dy / norm);
    knob.style.transform = `translate(${(dx / norm) * 23}px,${(dy / norm) * 23}px)`;
  };
  stick.onpointerdown = (e) => {
    pointer = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    move(e);
  };
  stick.onpointermove = move;
  stick.onlostpointercapture = () => {
    pointer = undefined;
    atlas.rig.stick.set(0, 0);
    knob.style.transform = '';
  };
  const map = createLocator($<HTMLCanvasElement>('locator'), atlas),
    markers = createMarkers(atlas, choose);
  const focus = new Vector3(),
    right = new Vector3(),
    p = new Vector3();
  atlas.onFrame = () => {
    markers();
    map();
    $('needle').style.transform = `rotate(${-atlas.rig.bearing()}deg)`;
    atlas.rig.focusPoint(focus);
    if (atlas.rig.mode === 'street')
      atlas.rig.camera.getWorldDirection(focus).multiplyScalar(22).add(atlas.rig.camera.position).setY(0);
    p.copy(focus).project(atlas.rig.camera);
    right.setFromMatrixColumn(atlas.rig.camera.matrixWorld, 0).add(focus).project(atlas.rig.camera);
    const pixels = Math.max(0.001, (Math.abs(right.x - p.x) * atlas.canvas.clientWidth) / 2);
    const desired = 67 / pixels,
      unit = 10 ** Math.floor(Math.log10(desired));
    const metres = (desired / unit >= 5 ? 5 : desired / unit >= 2 ? 2 : 1) * unit;
    $('scale-text').textContent = `${metres} m`;
    $('scale-bar').style.width = `${Math.round(metres * pixels)}px`;
  };
  exportButton.disabled = false;
  exportButton.onclick = async () => {
    exportButton.disabled = true;
    try {
      const blob = await atlas.exportPng(),
        url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stadtform-alexanderplatz-${atlas.lighting}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $('toast').textContent = 'PNG exported';
    } catch {
      $('toast').textContent = 'PNG export failed';
    } finally {
      exportButton.disabled = false;
      $('toast').hidden = false;
      setTimeout(() => ($('toast').hidden = true), 2900);
    }
  };
  window.addEventListener('keydown', (e) => {
    if (dialog.open) return;
    if (e.code === 'Escape') {
      setLayers(false);
      guide(false);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (
      e.code === 'Space' &&
      !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement)
    ) {
      e.preventDefault();
      $('play').click();
    } else if (e.code === 'KeyR') reset();
    else if (/^[1-6]$/.test(e.key)) choose(atlas.landmarks[Number(e.key) - 1]);
  });
}

async function start() {
  const loading = $('loading');
  try {
    const atlas = new Atlas($<HTMLCanvasElement>('scene'));
    await atlas.build((name, fraction) => {
      loading.querySelector('span')!.textContent = name + '…';
      loading.querySelector('b')!.style.width = fraction * 100 + '%';
    });
    controls(atlas);
    // Production tests opt in to inspecting camera matrices and the simulated world.
    if (new URLSearchParams(location.search).has('inspect')) Object.assign(window, { atlas });
    loading.hidden = true;
    document.body.dataset.ready = 'true';
  } catch (error) {
    loading.querySelector('span')!.textContent =
      'The model could not start. Enable hardware acceleration and reload.';
    console.error(error);
  }
}
void start();
