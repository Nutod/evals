// Pines on the Mountain's shoulders, broadleaf trees in Dale, and barley on the
// plain. All instanced; all bend with the hour's wind; pines and town trees char
// to snags when the fire reaches them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GATE, TOWN, riverAt, roadInfo, slopeIgnite, terrainHeight, townMask } from '../core/layout.js';
import { fbm } from '../core/noise.js';
import { patch } from '../core/shaderlib.js';
import { rng } from '../core/util.js';
import { fieldMask } from './terrain.js';

const COUNTS = { low: { pines: 3500, trees: 260, barley: 9000 }, medium: { pines: 6500, trees: 420, barley: 22000 }, high: { pines: 9500, trees: 560, barley: 42000 } };

function tagged(g, color, h0, h1, part) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), hgt = new Float32Array(n), prt = new Float32Array(n);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    const k = (y - h0) / (h1 - h0);
    const shade = 0.75 + 0.35 * k;
    col.set([c.r * shade, c.g * shade, c.b * shade], i * 3);
    hgt[i] = y;
    prt[i] = part;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aY', new THREE.BufferAttribute(hgt, 1));
  g.setAttribute('aPart', new THREE.BufferAttribute(prt, 1));
  return g;
}

function pineGeometry() {
  const parts = [tagged(new THREE.CylinderGeometry(0.06, 0.1, 0.4, 5).translate(0, 0.2, 0), '#4a3424', 0, 0.4, 0)];
  const tiers = [[0.18, 0.36, 0.34], [0.38, 0.29, 0.3], [0.58, 0.21, 0.27], [0.76, 0.12, 0.24]];
  for (const [y, r, h] of tiers) parts.push(tagged(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0), '#22341f', 0.1, 1, 1));
  return mergeGeometries(parts);
}

function broadleafGeometry() {
  const parts = [tagged(new THREE.CylinderGeometry(0.05, 0.08, 0.45, 5).translate(0, 0.22, 0), '#4f3a28', 0, 0.45, 0)];
  const crown = new THREE.IcosahedronGeometry(0.34, 1);
  crown.scale(1, 0.85, 1).translate(0, 0.66, 0);
  parts.push(tagged(crown, '#4a5a2a', 0.35, 1, 1));
  const c2 = new THREE.IcosahedronGeometry(0.22, 1).translate(0.16, 0.8, 0.08);
  parts.push(tagged(c2, '#56682f', 0.35, 1, 1));
  return mergeGeometries(parts);
}

function treeMaterial(key) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  return patch(m, {
    key,
    shade: true,
    vertexHead: 'attribute float aY; attribute float aPart; attribute vec2 aTree; varying float vPart; varying float vY; varying vec2 vTree;',
    vertex: /* glsl */ `
      vPart = aPart; vY = aY; vTree = aTree;
      float burnt = smoothstep(aTree.x + 0.05, aTree.x + 0.45, uT);
      // Burnt crowns shrink to bare snags.
      if (aPart > 0.5) transformed.xz *= 1.0 - 0.72 * burnt;
      // Sway: gentle at noon; leaning and hissing in the hot wind.
      vec4 base = vec4(0.0, 0.0, 0.0, 1.0);
      vec3 lw = vec3(uWind.x, 0.0, uWind.y);
      #ifdef USE_INSTANCING
      base = instanceMatrix * base;
      lw = normalize(transpose(mat3(instanceMatrix)) * lw);
      #endif
      float phase = base.x * 0.031 + base.z * 0.027 + aTree.y * 6.28;
      float gust = 0.55 + 0.45 * sin(dot(base.xz, uWind.xy) * 0.012 - uTime * 1.9);
      float sway = aY * aY * uWind.z * (0.05 + 0.07 * gust) + aY * aY * 0.012 * sin(uTime * (1.3 + uWind.z * 2.5) + phase) * (0.4 + uWind.z);
      transformed.xz += lw.xz * sway;
    `,
    fragmentHead: 'varying float vPart; varying float vY; varying vec2 vTree;',
    color: /* glsl */ `
      {
        float n = lmNoise(vWorldPos.xz * 0.9 + vWorldPos.y * 1.3);
        diffuseColor.rgb *= 0.8 + 0.4 * n;
        float burn = lmBurn(vTree.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.028), burn * 0.97);
      }
    `,
    emissive: /* glsl */ `
      {
        float em = lmEmber(vTree.x) * (1.0 - smoothstep(vTree.x + 0.4, vTree.x + 1.6, uT) * 0.8);
        if (em > 0.001) {
          float n = lmNoise(vWorldPos.xz * 1.7 + vec2(0.0, uTime * 1.2) + vWorldPos.y);
          totalEmissiveRadiance += lmFireColor(n) * pow(n, 2.0) * em * 6.0;
        }
      }
    `,
  });
}

function scatter(count, rand, accept, area) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 40) {
    tries++;
    const x = area[0] + rand() * (area[1] - area[0]);
    const z = area[2] + rand() * (area[3] - area[2]);
    const p = accept(x, z);
    if (p) out.push(p);
  }
  return out;
}

export class Vegetation {
  constructor(scene, quality) {
    this.scene = scene;
    this.build(quality);
  }

  build(quality) {
    const C = COUNTS[quality];
    const rand = rng(23);
    const slopeAt = (x, z, h) => {
      const hx = terrainHeight(x + 4, z), hz = terrainHeight(x, z + 4);
      return Math.hypot(hx - h, hz - h) / 4;
    };
    // Pines: dense on the shoulders and lower flanks, clumped by noise.
    this.pines = scatter(C.pines, rand, (x, z) => {
      const h = terrainHeight(x, z);
      if (h < 50 || h > 760) return null;
      const r = riverAt(z);
      if (Math.abs(x - r.x) < r.w + 20) return null;
      if (z > -360 && townMask(x, z) > 0.02) return null;
      if (z > GATE.z - 40 && z < TOWN.z0 + 60 && Math.abs(x - GATE.x) < 230) return null;
      const dens = fbm(x * 0.0035 + 4, z * 0.0035 - 2, 3) + (h > 120 ? 0.25 : 0) - (z > 300 ? 0.35 : 0);
      if (dens < 0.08) return null;
      if (slopeAt(x, z, h) > 1.1) return null;
      if (Math.abs(z) < 1400 && Math.abs(x) < 900 && roadInfo(x, z) < 12) return null;
      return { x, y: h - 0.5, z, s: 9 + rand() * 13, ign: slopeIgnite(x, z), seed: rand() };
    }, [-2600, 2400, -3200, 1400]);
    this.pineMesh = this.instanced(pineGeometry(), treeMaterial('pines'), this.pines, 'pines');

    // Broadleaf trees: gardens and terrace edges in Dale, the riverbanks to the south.
    this.trees = scatter(C.trees, rand, (x, z) => {
      const h = terrainHeight(x, z);
      const r = riverAt(z);
      const d = Math.abs(x - r.x);
      if (d < r.w + 4) return null;
      const tm = townMask(x, z);
      if (tm > 0.2) {
        // In town only along terrace walls (the gardens at the back of each terrace).
        const local = (d - 30) % 30;
        if (local < 25 || rand() < 0.35) return null;
      } else if (d > 160 || z < -300) return null;
      if (roadInfo(x, z) < 6) return null;
      return { x, y: h - 0.3, z, s: 7 + rand() * 6, ign: tm > 0.2 ? slopeIgnite(x, z) + 0.04 : 99, seed: rand() };
    }, [-500, 500, -330, 1400]);
    this.treeMesh = this.instanced(broadleafGeometry(), treeMaterial('broadleaf'), this.trees, 'trees');

    this.buildBarley(C.barley, rand);
  }

  instanced(geo, mat, list, name) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const attr = new Float32Array(list.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    list.forEach((p, i) => {
      q.setFromAxisAngle(Y, p.seed * 6.28);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s * (0.85 + p.seed * 0.3), p.s, p.s * (0.85 + p.seed * 0.3)));
      mesh.setMatrixAt(i, m);
      attr[i * 2] = p.ign;
      attr[i * 2 + 1] = p.seed;
    });
    mesh.geometry.setAttribute('aTree', new THREE.InstancedBufferAttribute(attr, 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    this.scene.add(mesh);
    return mesh;
  }

  buildBarley(count, rand) {
    // A tuft of seven bearded stalks.
    const pos = [], hgt = [];
    for (let b = 0; b < 7; b++) {
      const a = (b / 7) * Math.PI * 2 + rand();
      const ox = Math.cos(a) * 0.22 * rand(), oz = Math.sin(a) * 0.22 * rand();
      const lean = 0.12;
      const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
      const w = 0.035;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      const top = 1.0 + rand() * 0.2;
      pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, top, tz);
      hgt.push(0, 0, 1);
      // The ear: a fatter diamond near the top.
      pos.push(tx - px * 2, top - 0.22, tz - pz * 2, tx + px * 2, top - 0.22, tz + pz * 2, tx + Math.cos(a) * 0.05, top + 0.12, tz + Math.sin(a) * 0.05);
      hgt.push(0.8, 0.8, 1.1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aY', new THREE.Float32BufferAttribute(hgt, 1));
    g.computeVertexNormals();
    const mat = patch(new THREE.MeshStandardMaterial({ color: '#c6a24e', roughness: 0.8, side: THREE.DoubleSide }), {
      key: 'barley',
      shade: true,
      vertexHead: 'attribute float aY; varying float vY;',
      vertex: /* glsl */ `
        vY = aY;
        vec4 base = vec4(0.0, 0.0, 0.0, 1.0);
        vec3 lw = vec3(uWind.x, 0.0, uWind.y);
        #ifdef USE_INSTANCING
        base = instanceMatrix * base;
        lw = normalize(transpose(mat3(instanceMatrix)) * lw);
        #endif
        // Gusts roll across the fields as travelling waves.
        float wave = 0.5 + 0.5 * sin(dot(base.xz, normalize(uWind.xy + 1e-4)) * 0.09 - uTime * (2.0 + uWind.z * 2.5));
        float flutter = sin(uTime * 7.0 + base.x * 1.3 + base.z * 0.7) * 0.04;
        float bend = aY * aY * (0.1 + uWind.z * (0.55 + 0.5 * wave)) + flutter * aY;
        transformed.xz += lw.xz * bend;
        transformed.y -= bend * bend * 0.35;
      `,
      fragmentHead: 'varying float vY;',
      color: 'diffuseColor.rgb *= 0.55 + 0.6 * vY;',
    });
    const spots = [];
    let tries = 0;
    while (spots.length < count && tries < count * 8) {
      tries++;
      const x = -760 + rand() * 1520, z = 270 + rand() * 1150;
      const h = terrainHeight(x, z);
      if (fieldMask(x, z, h) < 0.5) continue;
      spots.push([x, h, z, rand()]);
    }
    const mesh = new THREE.InstancedMesh(g, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, h, z, s], i) => {
      q.setFromAxisAngle(Y, s * 6.28);
      const sc = 1.2 + s * 0.5;
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, h - 0.05, z), q, new THREE.Vector3(sc * 1.6, sc, sc * 1.6)));
    });
    mesh.receiveShadow = true;
    mesh.name = 'barley';
    this.barley = mesh;
    this.scene.add(mesh);
  }

  setQuality(q) {
    for (const mesh of [this.pineMesh, this.treeMesh, this.barley]) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.build(q);
  }
}
