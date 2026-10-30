// Ground: three height-field tiles (valley, Mountain, far country) sharing one
// material that paints grass, rock, barley, roads and paving, then chars and
// ashes them as the fire reaches each spot.
import * as THREE from 'three';
import { GATE, riverAt, roadInfo, slopeIgnite, terrainHeight, townMask } from '../core/layout.js';
import { fbm } from '../core/noise.js';
import { patch } from '../core/shaderlib.js';
import { clamp, ss } from '../core/util.js';

/** Barley field mask on the southern plain and lower valley sides. */
export function fieldMask(x, z, h) {
  if (z < 280 || z > 2600) return 0;
  const r = riverAt(z);
  const d = Math.abs(x - r.x);
  if (d < r.w + 22) return 0;
  if (roadInfo(x, z) < 9) return 0;
  if (h > 95) return 0;
  // Patchwork of rectangular fields with hedged margins.
  const cx = Math.floor(x / 90), cz = Math.floor(z / 70);
  const keep = fbm(cx * 0.71 + 3.1, cz * 0.53 - 7.7, 2) > -0.18;
  if (!keep) return 0;
  const fx = x / 90 - cx, fz = z / 70 - cz;
  const margin = Math.min(fx, 1 - fx, fz, 1 - fz);
  return ss(0.02, 0.07, margin) * (1 - ss(70, 95, h));
}

function buildTile(x0, x1, z0, z1, res, sink) {
  const nx = Math.round((x1 - x0) / res) + 1;
  const nz = Math.round((z1 - z0) / res) + 1;
  const rx = (x1 - x0) / (nx - 1), rz = (z1 - z0) / (nz - 1);
  res = (rx + rz) / 2;
  const count = nx * nz;
  const pos = new Float32Array(count * 3);
  const info = new Float32Array(count * 4);
  const wet = new Float32Array(count);
  const heights = new Float32Array((nx + 2) * (nz + 2));
  for (let j = -1; j <= nz; j++) {
    for (let i = -1; i <= nx; i++) {
      heights[(j + 1) * (nx + 2) + (i + 1)] = terrainHeight(x0 + i * rx, z0 + j * rz);
    }
  }
  const nrm = new Float32Array(count * 3);
  const H = (i, j) => heights[(j + 1) * (nx + 2) + (i + 1)];
  let v = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++, v++) {
      const x = x0 + i * rx, z = z0 + j * rz;
      let h = H(i, j);
      const n = new THREE.Vector3((H(i - 1, j) - H(i + 1, j)) / rx, 2, (H(i, j - 1) - H(i, j + 1)) / rz).normalize();
      if (sink && sink(x, z)) h -= 90;
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      nrm[v * 3] = n.x; nrm[v * 3 + 1] = n.y; nrm[v * 3 + 2] = n.z;
      const near = Math.abs(x) < 2000 && z > -2600 && z < 3000;
      const road = near ? 1 - ss(3.5, 6.5, roadInfo(x, z)) : 0;
      const town = near ? townMask(x, z) : 0;
      info[v * 4] = road;
      info[v * 4 + 1] = near ? slopeIgnite(x, z) : 99;
      info[v * 4 + 2] = near ? fieldMask(x, z, h) : 0;
      info[v * 4 + 3] = town;
      const r = riverAt(z);
      wet[v] = clamp((r.y + 0.4 - h) / 2.5);
    }
  }
  const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      index[k++] = a; index[k++] = c; index[k++] = b;
      index[k++] = b; index[k++] = c; index[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

const HALL = { x0: GATE.x - 17, x1: GATE.x + 17, y0: GATE.y - 3, y1: GATE.y + GATE.h + 4, z0: GATE.z - 260, z1: GATE.z + 1.5 };

export function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  return patch(m, {
    key: 'terrain',
    shade: true,
    vertexHead: 'attribute vec4 aInfo; attribute float aWet; varying vec4 vInfo; varying float vWet; varying vec3 vWN;',
    vertex: 'vInfo = aInfo; vWet = aWet; vWN = normal;',
    fragmentHead: `varying vec4 vInfo; varying float vWet; varying vec3 vWN;
      float pave(vec2 p) {
        vec2 q = p * vec2(1.6, 0.8);
        q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
        vec2 f = fract(q);
        float e = min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y));
        return smoothstep(0.02, 0.09, e);
      }`,
    color: /* glsl */ `
      vec3 wp = vWorldPos;
      if (wp.x > ${HALL.x0.toFixed(1)} && wp.x < ${HALL.x1.toFixed(1)} && wp.y > ${HALL.y0.toFixed(1)} && wp.y < ${HALL.y1.toFixed(1)} && wp.z > ${HALL.z0.toFixed(1)} && wp.z < ${HALL.z1.toFixed(1)}) discard;
      float slope = 1.0 - normalize(vWN).y;
      float dist = length(wp - uCam);
      float detail = 1.0 - smoothstep(600.0, 3000.0, dist);
      float n1 = lmFbm(wp.xz * 0.018);
      float n2 = lmNoise(wp.xz * 0.31) * detail + 0.5 * (1.0 - detail);
      float n3 = lmFbm(wp.xz * 0.0019);
      vec3 grass = mix(vec3(0.17, 0.21, 0.09), vec3(0.34, 0.33, 0.15), n1);
      grass = mix(grass, vec3(0.46, 0.40, 0.21), smoothstep(0.45, 0.8, n3) * 0.7);
      grass *= 0.85 + 0.3 * n2;
      vec3 rock = mix(vec3(0.24, 0.23, 0.22), vec3(0.42, 0.40, 0.37), n2 * 0.5 + n1 * 0.5);
      float strata = sin(wp.y * 0.21 + n1 * 6.0) * 0.5 + 0.5;
      rock *= 0.9 + 0.2 * lmNoise(wp.xz * 0.05 + wp.y * 0.02);
      float rockAmt = smoothstep(0.2, 0.42, slope + (n1 - 0.5) * 0.25);
      rockAmt = max(rockAmt, smoothstep(320.0, 640.0, wp.y + n1 * 160.0) * (0.55 + 0.45 * smoothstep(0.05, 0.2, slope)));
      vec3 col = mix(grass, rock, rockAmt);
      col = mix(col, vec3(0.22, 0.21, 0.21) * (0.8 + 0.4 * n2), smoothstep(700.0, 1050.0, wp.y) * 0.55);
      // Barley ground.
      vec3 barley = mix(vec3(0.50, 0.40, 0.18), vec3(0.64, 0.52, 0.26), lmNoise(wp.xz * 0.04)) * (0.88 + 0.12 * sin(dot(wp.xz, vec2(0.6, 0.8)) * 2.2));
      col = mix(col, barley, vInfo.z);
      // Dale's paving and the roads.
      float town = vInfo.w * (1.0 - smoothstep(0.08, 0.25, slope));
      vec3 stone = mix(vec3(0.40, 0.37, 0.32), vec3(0.52, 0.48, 0.41), lmNoise(floor(wp.xz * vec2(1.6, 0.8)) * 1.37));
      stone *= mix(0.55, 1.0, pave(wp.xz) * detail + (1.0 - detail));
      col = mix(col, stone, town);
      vec3 road = mix(vec3(0.40, 0.35, 0.27), vec3(0.50, 0.45, 0.36), n2);
      col = mix(col, road, vInfo.x * (1.0 - town));
      col = mix(col, stone * 0.92, vInfo.x * town);
      // River bed.
      col = mix(col, vec3(0.16, 0.14, 0.10), vWet);
      // Char and ash.
      float burn = lmBurn(vInfo.y);
      col = mix(col, vec3(0.055, 0.048, 0.042) * (0.7 + 0.6 * n2), burn * 0.93);
      col = mix(col, vec3(0.42, 0.40, 0.38) * (0.8 + 0.3 * n2), uAsh * clamp(vInfo.w * 0.8 + burn * 0.5, 0.0, 1.0) * 0.75);
      diffuseColor.rgb = col;
    `,
    roughness: 'roughnessFactor = mix(0.95, 0.35, vWet);',
    // Rock relief: cracks, ledges and buttresses that read at every distance.
    normal2: /* glsl */ `
      {
        vec3 wp = vWorldPos;
        float steep = smoothstep(0.12, 0.45, 1.0 - normalize(vWN).y);
        float d = length(wp - uCam);
        float fade = 1.0 - smoothstep(300.0, 2500.0, d);
        float h = lmFbm3(wp * vec3(0.03, 0.05, 0.03)) * 4.0 + lmNoise3(wp * 0.35) * 0.5 * (1.0 - smoothstep(60.0, 300.0, d));
        normal = lmBump(-vViewPosition, normal, h * (0.15 + steep * 0.6) * fade, 1.0);
      }
    `,
    emissive: /* glsl */ `
      {
        float em = lmEmber(vInfo.y);
        if (em > 0.001) {
          float cracks = pow(lmNoise(vWorldPos.xz * 0.45 + vec2(uTime * 0.05, 0.0)), 4.0) * 3.0;
          float pulse = 0.75 + 0.25 * sin(uTime * 2.3 + vWorldPos.x * 0.3);
          totalEmissiveRadiance += lmFireColor(cracks * 0.5) * cracks * em * pulse * 2.2;
        }
      }
    `,
  });
}

export function buildTerrain(scene, quality) {
  const material = terrainMaterial();
  const nearRes = quality === 'low' ? 7 : quality === 'medium' ? 5 : 4;
  const tiles = [];
  const near = buildTile(-780, 780, -940, 1180, nearRes);
  const mtn = buildTile(-3400, 2800, -5000, -940, quality === 'low' ? 20 : 13);
  // Far vertices a full cell inside the detailed tiles drop out of sight beneath them.
  const inNear = (x, z) => x > -650 && x < 650 && z > -810 && z < 1050;
  const inMtn = (x, z) => x > -3270 && x < 2670 && z > -4870 && z < -800;
  const far = buildTile(-14000, 14000, -14000, 15000, 120, (x, z) => inNear(x, z) || inMtn(x, z));
  for (const [g, name] of [[near, 'near'], [mtn, 'mountain'], [far, 'far']]) {
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `terrain-${name}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
    tiles.push(mesh);
  }
  return { tiles, material };
}
