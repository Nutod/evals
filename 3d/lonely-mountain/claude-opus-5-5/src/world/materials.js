// Procedural stone, used for everything carved: the Gate, statues, bridges,
// towers, quay walls. Patterned in world space, so no UVs are needed, and it
// chars from the top down once the fire has passed.
import * as THREE from 'three';
import { patch } from '../core/shaderlib.js';

/**
 * opts.color: base tint; opts.blocks: course height in metres (0 for raw rock);
 * opts.ignite: GLSL float expression for the hour this surface catches (default never);
 * opts.soot: 0..1 how dark it gets once burnt.
 */
export function stoneMaterial({ color = '#b8ad98', blocks = 0.9, ignite = '99.0', soot = 0.85, key, roughness = 0.88, extraColor = '', afterColor = '', emissive = '', vertexHead = '', vertex = '' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  return patch(m, {
    key: key || `stone-${color}-${blocks}-${ignite}`,
    shade: true,
    vertexHead: `varying vec3 vWN2;\n${vertexHead}`,
    vertex,
    emissive,
    vertexEnd: `
      #ifdef USE_INSTANCING
      vWN2 = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
      #else
      vWN2 = normalize(mat3(modelMatrix) * objectNormal);
      #endif
    `,
    fragmentHead: `varying vec3 vWN2;
      ${vertexHead.replace(/attribute[^;]*;/g, '')}
      float lmCourses(vec3 p, vec3 n, float h) {
        if (h <= 0.0) return 1.0;
        vec2 q = abs(n.y) > 0.7 ? p.xz / h : vec2(abs(n.x) > abs(n.z) ? p.z : p.x, p.y) / h;
        q.x *= 0.5;
        q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
        vec2 f = fract(q);
        float e = min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y));
        return 0.72 + 0.28 * smoothstep(0.015, 0.07, e);
      }`,
    color: /* glsl */ `
      {
        vec3 p = vWorldPos;
        float dist = length(p - uCam);
        float near = 1.0 - smoothstep(150.0, 900.0, dist);
        float n = lmFbm(p.xz * 0.11 + p.y * 0.07);
        float grain = lmNoise(p.xy * 2.1 + p.zx * 1.7) * near;
        vec3 c = diffuseColor.rgb * (0.82 + 0.3 * n + 0.12 * grain);
        c *= mix(1.0, lmCourses(p, normalize(vWN2), ${blocks.toFixed(2)}), near);
        // Weathering streaks run down vertical faces.
        c *= 1.0 - 0.12 * smoothstep(0.5, 0.9, lmNoise(vec2(p.x * 0.6 + p.z * 0.6, p.y * 0.05))) * (1.0 - abs(vWN2.y));
        ${extraColor}
        float ign = ${ignite};
        float burn = lmBurn(ign);
        float sootK = burn * ${soot.toFixed(2)} * (0.65 + 0.35 * smoothstep(0.3, 0.8, lmNoise(p.xz * 0.3 + p.y * 0.4)));
        c = mix(c, vec3(0.05, 0.045, 0.04), sootK);
        c = mix(c, vec3(0.45, 0.43, 0.41), uAsh * burn * max(vWN2.y, 0.0) * 0.8);
        ${afterColor}
        diffuseColor.rgb = c;
      }
    `,
  });
}

export function plainMaterial(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}
