import * as T from 'three';
import { osm, type Landmark } from './district';
import { Atlas } from './atlas';
import { site } from './table';

export function createLocator(canvas: HTMLCanvasElement, atlas: Atlas) {
  const ctx = canvas.getContext('2d')!;
  const map = document.createElement('canvas');
  map.width = canvas.width;
  map.height = canvas.height;
  const g = map.getContext('2d')!;
  const { width: w, height: h } = map;
  const scale = w / 1600;
  const px = (x: number) => w / 2 + (x - site.x) * scale;
  const py = (z: number) => h / 2 + (z - site.z) * scale;
  const path = (p: number[]) => {
    g.beginPath();
    g.moveTo(px(p[0]), py(p[1]));
    for (let i = 2; i < p.length; i += 2) g.lineTo(px(p[i]), py(p[i + 1]));
  };
  g.fillStyle = '#253c31';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#526550';
  for (const b of osm.buildings) {
    path(b.p);
    g.fill();
  }
  g.strokeStyle = '#687963';
  g.lineWidth = 1.1;
  for (const r of osm.roads) {
    path(r.p);
    g.stroke();
  }
  g.strokeStyle = '#a79c64';
  g.lineWidth = 1.1;
  for (const r of osm.rail.s) {
    path(r);
    g.stroke();
  }
  g.strokeStyle = '#92a489';
  g.setLineDash([3, 3]);
  g.lineWidth = 1;
  g.strokeRect(
    px(site.x - site.width / 2),
    py(site.z - site.depth / 2),
    site.width * scale,
    site.depth * scale,
  );
  const focus = new T.Vector3();
  let old = '';
  return () => {
    atlas.rig.focusPoint(focus);
    const x = px(focus.x),
      y = py(focus.z),
      a = atlas.rig.bearing();
    const key = [x, y, a].map(Math.round).join(',');
    if (key === old) return;
    old = key;
    ctx.drawImage(map, 0, 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((a * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(-22, 25);
    ctx.lineTo(0, -8);
    ctx.lineTo(22, 25);
    ctx.closePath();
    ctx.fillStyle = '#e7c85a52';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#efd376';
    ctx.fill();
    ctx.strokeStyle = '#24372a';
    ctx.stroke();
    ctx.restore();
  };
}

export function createMarkers(atlas: Atlas, select: (place: Landmark) => void) {
  const host = document.querySelector<HTMLElement>('#markers')!;
  const markers = atlas.landmarks.map((place, i) => {
    const el = document.createElement('button');
    el.className = 'marker';
    const label = place.id === 'station' ? 'S-Bahnhof' : place.name;
    el.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span class="label">${label}</span>`;
    el.setAttribute('aria-label', `Visit ${place.name}`);
    el.title = place.name;
    el.dataset.id = place.id;
    el.onclick = (e) => {
      if (e.detail === 0) select(place);
    };
    host.append(el);
    return { el, place, anchor: new T.Vector3(...place.anchor) };
  });
  // OrbitControls captures pointers on the common surface. Treat a stationary single pointer as a pin tap.
  // Sharing the parent also lets a two-finger gesture span a pin and the canvas.
  const surface = host.parentElement!;
  const pointers = new Set<number>();
  let press: { id: string; x: number; y: number } | undefined;
  surface.addEventListener('pointerdown', (e) => {
    pointers.add(e.pointerId);
    const id = (e.target as HTMLElement).closest<HTMLElement>('.marker')?.dataset.id;
    press = id && pointers.size === 1 ? { id, x: e.clientX, y: e.clientY } : undefined;
  });
  surface.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(press.x - e.clientX, press.y - e.clientY) > 6) press = undefined;
  });
  surface.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (press && pointers.size === 0) {
      const place = atlas.landmarks.find((l) => l.id === press?.id);
      if (place) select(place);
    }
    press = undefined;
  });
  surface.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    press = undefined;
  });
  const screen = new T.Vector3();
  return () => {
    host.hidden = !atlas.world.layers.labels.visible || !atlas.world.layers.landmarks.visible;
    if (host.hidden) return;
    const w = host.clientWidth,
      h = host.clientHeight;
    const occupied: { x: number; y: number }[] = [];
    for (const { el, anchor, place } of markers) {
      screen.copy(anchor).project(atlas.rig.camera);
      const x = (screen.x * 0.5 + 0.5) * w - 10;
      const y = (-screen.y * 0.5 + 0.5) * h - 35;
      const compact =
        (w < 610 && place.id !== 'fernsehturm' && place.id !== 'park-inn') ||
        occupied.some((p) => Math.abs(p.x - x) < 105 && Math.abs(p.y - y) < 23);
      el.hidden =
        screen.z <= -1 ||
        screen.z >= 1 ||
        x < 4 ||
        x > w - (compact ? 23 : 95) ||
        y < 6 ||
        y > h - 49 ||
        (atlas.rig.mode === 'street' && atlas.selected !== place);
      if (el.hidden) continue;
      el.classList.toggle('compact', compact);
      el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
      occupied.push({ x, y });
    }
  };
}
