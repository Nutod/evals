import * as THREE from "three";
import { seeded, smooth, mix } from "../state.js";
import {
  mesh,
  instance,
  setInstance,
  sphere,
  cone,
  beam,
  batchStatic,
} from "./helpers.js";

function scaleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d"),
    random = seeded(987);
  ctx.fillStyle = "#482014";
  ctx.fillRect(0, 0, 512, 512);
  for (let row = -1; row < 18; row++)
    for (let col = -1; col < 15; col++) {
      const x = col * 38 + (row % 2) * 19,
        y = row * 32;
      const grad = ctx.createLinearGradient(x, y, x + 8, y + 38);
      grad.addColorStop(0, "#d7a15a");
      grad.addColorStop(0.3, random() > 0.4 ? "#a9582d" : "#8b3d22");
      grad.addColorStop(1, "#492014");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 37, y - 9, x + 37, y + 8);
      ctx.quadraticCurveTo(x + 35, y + 28, x + 19, y + 37);
      ctx.quadraticCurveTo(x + 1, y + 26, x, y);
      ctx.fill();
      ctx.strokeStyle = "#3b2116";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createDragon(scene, uniforms) {
  const root = new THREE.Group();
  scene.add(root);
  const scales = scaleTexture();
  const skin = new THREE.MeshStandardMaterial({
    color: "#bc733a",
    map: scales,
    bumpMap: scales,
    bumpScale: 0.18,
    metalness: 0.42,
    roughness: 0.36,
  });
  const bone = new THREE.MeshStandardMaterial({
    color: "#7d4027",
    map: scales,
    metalness: 0.3,
    roughness: 0.47,
  });
  const belly = new THREE.MeshStandardMaterial({
    color: "#d2b889",
    roughness: 0.6,
    metalness: 0.13,
  });
  const horn = new THREE.MeshStandardMaterial({
    color: "#504633",
    roughness: 0.45,
  });
  const membrane = new THREE.MeshStandardMaterial({
    color: "#9e3e24",
    roughness: 0.56,
    metalness: 0.15,
    side: THREE.DoubleSide,
    emissive: "#ff4910",
    emissiveIntensity: 0.05,
  });
  const eye = new THREE.MeshBasicMaterial({ color: "#ffcf46" });
  mesh(
    new THREE.SphereGeometry(1, 32, 22),
    skin,
    root,
    [0, 0, 0],
    [3.2, 3.8, 9],
  );
  mesh(
    new THREE.SphereGeometry(1, 24, 14),
    belly,
    root,
    [0, -2.3, 1.5],
    [2.3, 1.8, 7.4],
  );
  const neck = new THREE.Group();
  root.add(neck);
  neck.userData.dynamic = true;
  const neckParts = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6,
      z = 7 + t * 13,
      y = t * t * 7;
    const p = mesh(
      sphere,
      skin,
      neck,
      [0, y, z],
      [2 - t * 0.9, 2.3 - t * 0.8, 2.5],
    );
    neckParts.push(p);
    mesh(
      sphere,
      belly,
      neck,
      [0, y - 1.1, z + 0.4],
      [1.35 - t * 0.5, 1.25, 2.2],
    );
    mesh(cone, horn, neck, [0, y + 2.3, z], [0.45, 1.8, 0.7]);
  }
  const head = new THREE.Group();
  head.position.set(0, 7.5, 22);
  neck.add(head);
  mesh(
    new THREE.SphereGeometry(1, 20, 14),
    skin,
    head,
    [0, 0, 0],
    [1.8, 1.8, 3.1],
  );
  mesh(sphere, skin, head, [0, -0.2, 3], [1.2, 0.9, 2]);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.9, 0.6);
  head.add(jaw);
  head.userData.dynamic = true;
  jaw.userData.dynamic = true;
  mesh(sphere, belly, jaw, [0, -0.2, 1.9], [1.1, 0.4, 2.6]);
  for (const side of [-1, 1]) {
    mesh(sphere, eye, head, [side * 1.53, 0.55, 1.25], [0.2, 0.28, 0.43]);
    mesh(sphere, horn, head, [side * 1.7, 0.55, 1.44], [0.08, 0.24, 0.1]);
    const h = mesh(new THREE.ConeGeometry(0.65, 5, 8), horn, head, [
      side * 1.3,
      2.7,
      -1.6,
    ]);
    h.rotation.x = -0.65;
    h.rotation.z = -side * 0.35;
    const cheek = mesh(cone, skin, head, [side * 2, -0.2, -1], [0.75, 3, 0.5]);
    cheek.rotation.x = -0.9;
    cheek.rotation.z = side * 0.5;
    for (let i = 0; i < 9; i++) {
      const t = mesh(
        cone,
        belly,
        head,
        [side * (0.83 + i * 0.03), -0.83, 1.1 + i * 0.36],
        [0.12, 0.48, 0.12],
      );
      t.rotation.z = Math.PI;
    }
  }

  const tailParts = [];
  let tailParent = root;
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    g.position.z = i ? -2 : -7;
    tailParent.add(g);
    g.userData.dynamic = true;
    const s = Math.pow(1 - i / 19, 1.1);
    mesh(sphere, skin, g, [0, 0, -1], [s * 2.3, s * 2.5, 2.2]);
    const spine = mesh(
      cone,
      horn,
      g,
      [0, s * 2.5, -1],
      [s * 0.4, s * 2, s * 0.7],
    );
    spine.rotation.x = -0.25;
    tailParts.push(g);
    tailParent = g;
  }
  for (let i = 0; i < 10; i++)
    mesh(
      cone,
      horn,
      root,
      [0, 3.6, -7 + i * 1.4],
      [0.6, 2 + Math.sin(i * 0.4), 0.9],
    );

  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 2.3, 1.3, 3.5);
    wing.scale.x = side;
    root.add(wing);
    wing.userData.dynamic = true;
    const elbow = [10, 2, 3],
      fingers = [
        [39, 1, -3],
        [32, -1, -13],
        [21, -3, -19],
        [11, -3.5, -16],
        [2, -2.8, -10],
      ];
    beam(wing, skin, [0, 0, 0], elbow, 0.65);
    beam(wing, skin, elbow, [24, 2, 3], 0.42);
    beam(wing, skin, [24, 2, 3], fingers[0], 0.24);
    for (const finger of fingers) beam(wing, bone, elbow, finger, 0.14);
    for (let panel = 0; panel < fingers.length - 1; panel++) {
      const a = new THREE.Vector3(...fingers[panel]),
        b = new THREE.Vector3(...fingers[panel + 1]),
        origin = new THREE.Vector3(...elbow);
      const positions = [],
        uvs = [],
        indices = [],
        nu = 18,
        nv = 12;
      for (let v = 0; v <= nv; v++)
        for (let u = 0; u <= nu; u++) {
          const t = u / nu,
            r = v / nv,
            edge = a
              .clone()
              .lerp(b, t)
              .lerp(origin, Math.sin(t * Math.PI) * 0.13);
          const p = origin.clone().lerp(edge, r);
          p.y -= Math.sin(t * Math.PI) * Math.sin(r * Math.PI) * 2;
          positions.push(p.x, p.y, p.z);
          uvs.push(t, r);
          if (v < nv && u < nu) {
            const k = v * (nu + 1) + u;
            indices.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1);
          }
        }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      mesh(geom, membrane, wing);
    }
    const claw = mesh(cone, horn, wing, [10, 3, 4], [0.6, 3.1, 0.65]);
    claw.rotation.x = 0.6;
    wings.push(wing);
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 2; i++) {
      const leg = new THREE.Group();
      leg.position.set(side * 2, -1.7, i ? -4 : 5);
      root.add(leg);
      const thigh = mesh(sphere, skin, leg, [side, -1, -1], [1.2, 2.2, 1.2]);
      thigh.rotation.x = -0.5;
      beam(leg, skin, [side, -1, -1], [side * 2, -4, 0], 0.55);
      for (let j = 0; j < 3; j++) {
        const claw = mesh(
          cone,
          horn,
          leg,
          [side * 2 + (j - 1) * 0.4, -4.4, 1],
          [0.18, 1.6, 0.18],
        );
        claw.rotation.x = 0.9;
      }
    }
  const plates = instance(
    new THREE.IcosahedronGeometry(1, 0),
    skin,
    1700,
    root,
  );
  const random = seeded(88);
  for (let i = 0; i < 1700; i++) {
    const a = random() * Math.PI * 2,
      z = (random() - 0.5) * 15,
      f = Math.sqrt(Math.max(0.01, 1 - (z * z) / 81));
    setInstance(
      plates,
      i,
      Math.cos(a) * 3.15 * f,
      Math.sin(a) * 3.75 * f,
      z,
      0.2,
      0.12,
      0.33,
      a,
      new THREE.Color().setHSL(
        0.055 + random() * 0.04,
        0.55,
        0.22 + random() * 0.17,
      ),
    );
  }
  const breath = mesh(
    new THREE.ConeGeometry(4.5, 32, 24, 10, true),
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.time, uPower: { value: 0 } },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uPower; void main(){float n=sin(vUv.x*80.+vUv.y*41.-uTime*18.)*.5+.5;float a=(1.-vUv.y)*smoothstep(0.,.15,vUv.y)*(n*.6+.4)*uPower;gl_FragColor=vec4(mix(vec3(1.,.16,.005),vec3(1.,.85,.35),vUv.y),a*.8);}`,
    }),
    head,
    [0, -8, 17],
  );
  breath.rotation.x = -Math.PI / 3;
  breath.userData.dynamic = true;
  const shadow = mesh(
    new THREE.CircleGeometry(1, 6),
    new THREE.MeshBasicMaterial({
      color: "#1d221e",
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
    scene,
    [0, 12, 0],
    [29, 11, 1],
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  const firelight = new THREE.PointLight("#ff6e13", 0, 90, 1.2);
  firelight.position.set(0, -10, 8);
  root.add(firelight);
  wings.forEach(batchStatic);
  batchStatic(neck);
  batchStatic(head);
  batchStatic(root);
  return {
    root,
    update(day, time, camera) {
      root.visible = day.dragon > 0.001;
      shadow.visible = day.value > 1.5 && day.value < 3.25;
      const arrival = smooth(0.7, 1.85, day.value),
        landing = smooth(2.35, 3.1, day.value),
        orbit = time * 0.095 + (day.value - 2) * 2.1;
      const x = Math.sin(orbit) * 108,
        z = -151 + Math.cos(orbit) * 83,
        y = 168 + Math.sin(orbit * 1.5) * 27;
      root.position.set(
        mix(-190, mix(x, 6, landing), arrival),
        mix(245, mix(y, 57, landing), arrival),
        mix(-500, mix(z, -34, landing), arrival),
      );
      const s = mix(0.018, 1, arrival);
      root.scale.setScalar(s);
      plates.count =
        camera.position.distanceTo(root.position) < 220 ? 1700 : 450;
      root.rotation.set(
        mix(-0.08, 0.22, landing),
        mix(orbit + Math.PI / 2, 0, landing),
        mix(-0.22 + Math.sin(orbit) * 0.18, 0.06, landing),
      );
      const flap = Math.sin(time * 1.65);
      wings.forEach((w, i) => {
        w.rotation.z =
          (i ? 1 : -1) * mix(0.1 + flap * 0.28, 0.58 + flap * 0.06, landing);
        w.rotation.x = Math.cos(time * 1.65 - 0.4) * 0.07;
      });
      tailParts.forEach((p, i) => {
        p.rotation.y = Math.sin(time * 1.3 - i * 0.32) * 0.08;
        p.rotation.x = Math.sin(time * 0.8 - i * 0.3) * 0.045;
      });
      neck.rotation.y = Math.sin(time * 0.7) * 0.08;
      head.rotation.x = -0.1 + landing * 0.5;
      jaw.rotation.x = -day.fire * (0.22 + Math.sin(time * 0.7) * 0.1);
      membrane.emissiveIntensity = 0.035 + day.fire * 0.65;
      breath.material.uniforms.uPower.value = day.fire * landing;
      breath.visible = day.fire * landing > 0.05;
      firelight.intensity = day.fire * 650;
      shadow.position.set(x * 0.7, 12.2, z + 150);
      shadow.rotation.z = orbit;
      shadow.material.opacity = 0.18 * (1 - day.night);
    },
  };
}
