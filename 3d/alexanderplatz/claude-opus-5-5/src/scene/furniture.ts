import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { osm } from '../osm';
import { MeshBuilder } from '../lib/geom';
import { SegmentIndex } from '../lib/segments';
import { canvasTexture, glowTexture } from '../lib/textures';
import { registerNight } from './night';
import { driveEdges, tramEdges, walkEdges } from './streets';

const LAMP_HEIGHT = 7;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Heading (rotation.y) that lines a model's local +x up with a ground direction. */
const yaw = (dir: THREE.Vector2) => -Math.atan2(dir.y, dir.x);

function colored(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], shadow = true) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = matrices.length;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export function buildFurniture(): { group: THREE.Group; lampPositions: THREE.Vector3[] } {
  const group = new THREE.Group();
  group.name = 'furniture';
  const roads = new SegmentIndex(driveEdges);
  const paths = new SegmentIndex([...walkEdges, ...driveEdges]);
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 });

  // ---------------------------------------------------------------- street lamps
  const lampGeo = mergeGeometries([
    colored(new THREE.CylinderGeometry(0.07, 0.11, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0), 0x3b4448),
    colored(new THREE.BoxGeometry(1.5, 0.08, 0.08).translate(0.75, LAMP_HEIGHT - 0.1, 0), 0x3b4448),
    colored(new THREE.BoxGeometry(0.7, 0.16, 0.32).translate(1.45, LAMP_HEIGHT - 0.2, 0), 0x2c3236),
  ])!;
  const lampMatrices: THREE.Matrix4[] = [];
  const headMatrices: THREE.Matrix4[] = [];
  const lampPositions: THREE.Vector3[] = [];
  for (let i = 0; i < osm.lamps.length; i += 2) {
    const p = new THREE.Vector2(osm.lamps[i], osm.lamps[i + 1]);
    const road = roads.nearest(p, 25);
    const toward = road ? road.point.clone().sub(p) : new THREE.Vector2(1, 0);
    if (toward.lengthSq() < 0.01) toward.set(1, 0);
    const q = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw(toward.normalize()));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.y), q, new THREE.Vector3(1, 1, 1));
    lampMatrices.push(m);
    headMatrices.push(m.clone().multiply(new THREE.Matrix4().makeTranslation(1.45, LAMP_HEIGHT - 0.3, 0)));
    lampPositions.push(new THREE.Vector3(1.45, LAMP_HEIGHT - 0.35, 0).applyMatrix4(m));
  }
  const lamps = instanced(lampGeo, metal, lampMatrices);
  lamps.name = 'lamps';
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd79a, roughness: 0.3 });
  registerNight(headMaterial, 4, 0);
  const heads = instanced(new THREE.BoxGeometry(0.55, 0.05, 0.25), headMaterial, headMatrices, false);
  heads.name = 'lamp-heads';

  // Night glow: a sprite at each lamp head and a soft light pool on the ground.
  const glow = glowTexture();
  const spriteMaterial = new THREE.PointsMaterial({ map: glow, color: 0xffcf8a, size: 5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  registerNight(spriteMaterial, 0.9, 0, 'opacity');
  const sprites = new THREE.Points(new THREE.BufferGeometry().setFromPoints(lampPositions), spriteMaterial);
  sprites.name = 'lamp-glow';
  const poolMaterial = new THREE.MeshBasicMaterial({ map: glow, color: 0xffb867, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -20 });
  registerNight(poolMaterial, 0.4, 0, 'opacity');
  const pools = instanced(
    new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2),
    poolMaterial,
    lampPositions.map((p) => new THREE.Matrix4().makeTranslation(p.x, 0.12, p.z)),
    false,
  );
  pools.receiveShadow = false;
  pools.name = 'light-pools';
  pools.renderOrder = 1;
  group.add(lamps, heads, sprites, pools);

  // ---------------------------------------------------------------- benches
  const wood = new THREE.Color(0x8a5d3b);
  const benchGeo = mergeGeometries([
    ...[-0.18, 0, 0.18].map((z) => colored(new THREE.BoxGeometry(1.8, 0.04, 0.14).translate(0, 0.45, z), wood)),
    ...[0.62, 0.8].map((y) => colored(new THREE.BoxGeometry(1.8, 0.12, 0.04).translate(0, y, 0.3), wood)),
    ...[-0.75, 0.75].map((x) => colored(new THREE.BoxGeometry(0.06, 0.45, 0.5).translate(x, 0.22, 0.05), 0x2f3438)),
  ])!;
  const benchMatrices: THREE.Matrix4[] = [];
  for (let i = 0; i < osm.benches.length; i += 2) {
    const p = new THREE.Vector2(osm.benches[i], osm.benches[i + 1]);
    const near = paths.nearest(p, 15);
    const dir = near?.direction ?? new THREE.Vector2(1, 0);
    // Face the path: backrest on the far side.
    const toPath = near ? near.point.clone().sub(p) : new THREE.Vector2(0, -1);
    let angle = yaw(dir);
    const back = new THREE.Vector2(0, 1).rotateAround(new THREE.Vector2(), -angle);
    if (back.dot(toPath) > 0) angle += Math.PI;
    benchMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.y), new THREE.Quaternion().setFromAxisAngle(Y_AXIS, angle), new THREE.Vector3(1, 1, 1)));
  }
  const benches = instanced(benchGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), benchMatrices);
  benches.name = 'benches';
  group.add(benches);

  group.add(buildShelters(roads));
  return { group, lampPositions };
}

/** Berlin-style glass shelters with a lit advertising panel and the green-yellow "H" stop sign. */
function buildShelters(roads: SegmentIndex): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shelters';
  const trams = new SegmentIndex(tramEdges);
  const placed: THREE.Vector2[] = [];
  const shelterMatrices: THREE.Matrix4[] = [];
  for (const stop of osm.stops) {
    const p = new THREE.Vector2(stop.p[0], stop.p[1]);
    const isTram = stop.k === 'tram';
    const near = isTram ? trams.nearest(p, 20) : roads.nearest(p, 25);
    if (!near) continue;
    const dir = near.direction;
    const normal = new THREE.Vector2(-dir.y, dir.x);
    const sides = isTram ? [-1, 1] : [Math.sign(normal.dot(p.clone().sub(near.point))) || 1];
    for (const side of sides) {
      const half = isTram ? 3.6 : ((near.segment.edge.w ?? 7) / 2 + 1.8);
      const at = near.point.clone().addScaledVector(normal, side * half);
      if (placed.some((q) => q.distanceTo(at) < 14)) continue;
      placed.push(at);
      // Local +z of the shelter model faces the road.
      let angle = yaw(dir);
      const facing = new THREE.Vector2(0, 1).rotateAround(new THREE.Vector2(), -angle);
      if (facing.dot(near.point.clone().sub(at)) < 0) angle += Math.PI;
      shelterMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(at.x, 0, at.y), new THREE.Quaternion().setFromAxisAngle(Y_AXIS, angle), new THREE.Vector3(1, 1, 1)));
    }
  }

  const frame = new MeshBuilder();
  frame.color.set(0x5b6266);
  frame.addGeometry(new THREE.BoxGeometry(4.6, 0.14, 1.8), new THREE.Matrix4().makeTranslation(0, 2.6, 0.1));
  for (const x of [-2.2, 2.2]) frame.addGeometry(new THREE.BoxGeometry(0.08, 2.6, 0.08), new THREE.Matrix4().makeTranslation(x, 1.3, -0.65));
  frame.color.set(0x2c3236);
  frame.addGeometry(new THREE.BoxGeometry(0.3, 0.05, 0.9).scale(1, 1, 1), new THREE.Matrix4().makeTranslation(-1.2, 0.5, -0.45));
  frame.addGeometry(new THREE.BoxGeometry(1.8, 0.05, 0.35), new THREE.Matrix4().makeTranslation(0.4, 0.5, -0.45));
  const frames = instanced(frame.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), shelterMatrices);
  frames.name = 'shelter-frames';

  const glass = new MeshBuilder();
  glass.addGeometry(new THREE.BoxGeometry(4.4, 2.3, 0.03), new THREE.Matrix4().makeTranslation(0, 1.35, -0.7));
  glass.addGeometry(new THREE.BoxGeometry(0.03, 2.3, 1.3), new THREE.Matrix4().makeTranslation(-2.2, 1.35, -0.05));
  const panes = instanced(glass.build(), new THREE.MeshStandardMaterial({ color: 0xbfd6dc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false }), shelterMatrices, false);
  panes.name = 'shelter-glass';

  const adTexture = canvasTexture(128, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f2d22e');
    g.addColorStop(0.55, '#e94e3c');
    g.addColorStop(1, '#30245a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 26px system-ui, Helvetica, Arial, sans-serif';
    ctx.fillText('BERLIN', 14, 60);
    ctx.font = '500 16px system-ui, Helvetica, Arial, sans-serif';
    ctx.fillText('Kultur am Alex', 14, 86);
  }, true, false);
  const adMaterial = new THREE.MeshStandardMaterial({ map: adTexture, emissiveMap: adTexture, emissive: 0xffffff, roughness: 0.3 });
  registerNight(adMaterial, 1.2, 0.08);
  const ads = instanced(new THREE.BoxGeometry(0.06, 1.75, 1.2).translate(2.2, 1.2, -0.05), adMaterial, shelterMatrices);
  ads.name = 'shelter-ads';

  const signTexture = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f4d300';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#00843d'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#00843d';
    ctx.font = '700 40px system-ui, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('H', w / 2, h / 2 + 2);
  }, true, false);
  const pole = instanced(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6).translate(2.8, 1.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.6, roughness: 0.4 }), shelterMatrices);
  const sign = instanced(new THREE.CircleGeometry(0.28, 20).translate(2.8, 2.65, 0.65), new THREE.MeshStandardMaterial({ map: signTexture, side: THREE.DoubleSide, roughness: 0.5 }), shelterMatrices, false);
  group.add(frames, panes, ads, pole, sign);
  return group;
}
