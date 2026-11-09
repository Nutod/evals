import * as THREE from 'three';
import { headingToRotY, Polyline, toRing } from '../core/geo';
import { canvasTexture, FONT_CONDENSED, makeCanvas } from '../core/textures';
import { osm } from '../data/osm';
import { inBounds, type World } from './world';

/** Street names painted flat on the carriageway, the way a printed map letters its streets. */
export function buildStreetNames(world: World): void {
  const best = new Map<string, { line: Polyline; width: number }>();
  for (const r of [...osm.roads, ...osm.paths]) {
    if (!r.n) continue;
    const line = new Polyline(toRing(r.p));
    const mid = line.at(line.length / 2);
    if (!inBounds(mid.x, mid.z, 30)) continue;
    const current = best.get(r.n);
    if (!current || line.length > current.line.length) best.set(r.n, { line, width: r.w });
  }
  const names: { mesh: THREE.Mesh; base: number; tx: number; tz: number }[] = [];
  const px = 72;
  const font = `600 ${px}px ${FONT_CONDENSED}`;
  const [, probe] = makeCanvas(4, 4);
  for (const [name, { line, width }] of best) {
    if (line.length < 45) continue;
    const text = name.toUpperCase();
    probe.font = font;
    probe.letterSpacing = '6px';
    const w = Math.ceil(probe.measureText(text).width) + 24;
    const h = px + 24;
    const texture = canvasTexture(
      w,
      h,
      (g) => {
        g.font = font;
        g.letterSpacing = '6px';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(15,42,34,0.85)';
        g.strokeText(text, 12, h / 2 + 3);
        g.fillStyle = '#f4f6ee';
        g.fillText(text, 12, h / 2 + 3);
      },
      { repeat: false },
    );
    const height = Math.min(5.5, Math.max(3, width * 0.5));
    const length = Math.min(line.length * 0.9, (height * w) / h);
    const mid = line.at(line.length / 2);
    const flip = mid.tx < 0 ? -1 : 1;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(length, (length * h) / w).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -40 }),
    );
    mesh.position.set(mid.x, 0.18, mid.z);
    mesh.rotation.y = headingToRotY(mid.tx * flip, mid.tz * flip);
    mesh.renderOrder = 1;
    world.layers.labels.add(mesh);
    names.push({ mesh, base: mesh.rotation.y, tx: mid.tx * flip, tz: mid.tz * flip });
  }
  // keep lettering upright for whichever way the camera faces
  const right = new THREE.Vector3();
  world.everyFrame.push(() => {
    right.setFromMatrixColumn(world.camera.matrixWorld, 0);
    for (const n of names) n.mesh.rotation.y = n.base + (n.tx * right.x + n.tz * right.z < 0 ? Math.PI : 0);
  });
}
