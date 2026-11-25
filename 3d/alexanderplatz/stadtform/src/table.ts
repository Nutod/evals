import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { osm, shared } from './district';
import { makeSky } from './sky';

export const site = { x: -60, z: 27, width: 850, depth: 740 };
export type Light = 'day' | 'golden' | 'blue';

const light = {
  day: {
    paper: 0xdde4d7,
    ambient: 0xfff5df,
    shade: 0xa2abad,
    sun: 0xffedce,
    intensity: 2.35,
    sky: 0.88,
    vector: [-410, 520, -190],
    night: 0,
    fog: 0xe2e7dc,
  },
  golden: {
    paper: 0xf2d2ac,
    ambient: 0xffe5c5,
    shade: 0x917e89,
    sun: 0xffab60,
    intensity: 3.0,
    sky: 1.5,
    vector: [-540, 300, -310],
    night: 0.27,
    fog: 0xf2d6bb,
  },
  blue: {
    paper: 0x515e72,
    ambient: 0xacc8ff,
    shade: 0x55566e,
    sun: 0x9cbbff,
    intensity: 1.2,
    sky: 0.95,
    vector: [310, 550, -190],
    night: 1,
    fog: 0x77879e,
  },
};

function surveyPaper() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fafbf7';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#e4e8e0';
  g.lineWidth = 1.5;
  for (let i = 0.5; i < 512; i += 128) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  g.strokeStyle = '#a8b6ad';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(246, 256);
  g.lineTo(266, 256);
  g.moveTo(256, 246);
  g.lineTo(256, 266);
  g.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(600, 600);
  return texture;
}

// Omit whole peripheral buildings where the model ends. A partial facade would expose its empty shell.
export function fitDistrict() {
  const { x, z, width, depth } = site;
  for (const [key, stride] of [
    ['trees', 3],
    ['benches', 3],
    ['lamps', 2],
    ['signals', 2],
  ] as const) {
    const source = osm[key],
      visible: number[] = [];
    for (let i = 0; i < source.length; i += stride) {
      if (Math.abs(source[i] - x) < width / 2 - 2 && Math.abs(source[i + 1] - z) < depth / 2 - 2)
        visible.push(...source.slice(i, i + stride));
    }
    osm[key] = visible;
  }
  osm.buildings = osm.buildings.filter((b) =>
    b.p.every((value, i) =>
      i % 2 === 0 ? Math.abs(value - x) < width / 2 - 0.5 : Math.abs(value - z) < depth / 2 - 0.5,
    ),
  );
}

function shadeFootprints(scene: T.Scene) {
  const { x, z, width, depth } = site;
  const canvas = document.createElement('canvas');
  const resolution = 1.75;
  canvas.width = Math.ceil(width * resolution);
  canvas.height = Math.ceil(depth * resolution);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(resolution, resolution);
  ctx.translate(width / 2 - x, depth / 2 - z);
  ctx.fillStyle = 'rgba(38,45,33,.5)';
  const ring = (p: number[]) => {
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
  };
  for (const [group, buildings] of [
    ['buildings', osm.buildings],
    [
      'landmarks',
      Object.entries(osm.landmarks)
        .filter(([id]) => !id.endsWith('brunnen'))
        .map(([, b]) => b),
    ],
  ] as const) {
    ctx.clearRect(x - width / 2, z - depth / 2, width, depth);
    ctx.filter = 'blur(5px)';
    for (const b of buildings) {
      ctx.beginPath();
      ring(b.p);
      for (const hole of b.hs ?? []) ring(hole);
      ctx.fill('evenodd');
    }
    const source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    source.getContext('2d')!.drawImage(canvas, 0, 0);
    const tex = new T.CanvasTexture(source);
    tex.colorSpace = T.SRGBColorSpace;
    const contact = new T.Mesh(
      new T.PlaneGeometry(width, depth).rotateX(-Math.PI / 2),
      new T.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        opacity: 0.62,
      }),
    );
    contact.position.set(x, 0.18, z);
    scene.getObjectByName(group)?.add(contact);
  }
}

/** Architectural model base, with real-world metre graduations along the two exposed edges. */
export function installTable(scene: T.Scene, renderer: T.WebGLRenderer) {
  const { x, z, width, depth } = site;
  shadeFootprints(scene);
  const edges = [
    new T.Plane(new T.Vector3(1, 0, 0), width / 2 - x),
    new T.Plane(new T.Vector3(-1, 0, 0), width / 2 + x),
    new T.Plane(new T.Vector3(0, 0, 1), depth / 2 - z),
    new T.Plane(new T.Vector3(0, 0, -1), depth / 2 + z),
  ];
  scene.traverse((object) => {
    const mesh = object as T.Mesh;
    if (!mesh.material) return;
    if (mesh.name.startsWith('trees-') && mesh instanceof T.InstancedMesh && mesh.instanceColor) {
      const tint = new T.Color(),
        sage = new T.Color(0x77845c);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getColorAt(i, tint);
        tint.lerp(sage, 0.38);
        mesh.setColorAt(i, tint);
      }
    }
    if (['area-grass', 'area-park', 'area-scrub'].includes(mesh.name)) {
      (mesh.material as T.MeshStandardMaterial).color.setHex(0xc9ceaf);
    }
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      mat.clippingPlanes = edges;
      mat.clipShadows = true;
    }
  });
  for (const [top, height, inset, color] of [
    [0, 4, 0, 0xe9dfc9],
    [-4, 10, 0, 0xb2ac98],
    [-14, 4, 0, 0xd7cbb4],
    [-18, 5, 0.7, 0x555f51],
  ]) {
    const base = new T.Mesh(
      new T.BoxGeometry(width - inset, height, depth - inset),
      new T.MeshStandardMaterial({ color, roughness: 0.96 }),
    );
    base.position.set(x, top - height / 2 - 0.03, z);
    base.castShadow = base.receiveShadow = true;
    scene.add(base);
  }
  const graduations: number[] = [];
  for (let i = 0; i <= width; i += 10) {
    const px = x - width / 2 + i,
      pz = z + depth / 2 + 0.03;
    graduations.push(px, -4, pz, px, i % 100 === 0 ? -12 : -7, pz);
  }
  for (let i = 0; i <= depth; i += 10) {
    const px = x + width / 2 + 0.03,
      pz = z - depth / 2 + i;
    graduations.push(px, -4, pz, px, i % 100 === 0 ? -12 : -7, pz);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(graduations, 3));
  scene.add(
    new T.LineSegments(
      geometry,
      new T.LineBasicMaterial({ color: 0x677262, transparent: true, opacity: 0.7 }),
    ),
  );

  const paper = new T.MeshBasicMaterial({ map: surveyPaper(), toneMapped: false });
  const floor = new T.Mesh(new T.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2), paper);
  floor.position.y = -23.2;
  scene.add(floor);
  const shadow = new T.Mesh(floor.geometry, new T.ShadowMaterial({ opacity: 0.15 }));
  shadow.position.y = -23.1;
  shadow.receiveShadow = true;
  scene.add(shadow);

  const sun = new T.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  Object.assign(sun.shadow.camera, { left: -720, right: 720, top: 720, bottom: -720, near: 1, far: 2800 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.22;
  sun.shadow.bias = -0.00016;
  const ambient = new T.HemisphereLight();
  scene.add(ambient, sun, sun.target);
  const pmrem = new T.PMREMGenerator(renderer);
  const studio = new RoomEnvironment();
  const env = pmrem.fromScene(studio, 0.04);
  scene.environment = env.texture;

  studio.dispose();
  pmrem.dispose();
  const fog = new T.Fog(0xe2e7dc, 1700, 5400);
  scene.fog = fog;
  const sky = makeSky();
  scene.add(sky);
  return (id: Light) => {
    const p = light[id];
    paper.color.setHex(p.paper);
    fog.color.setHex(p.fog);
    const u = sky.material.uniforms;
    u.horizon.value.setHex(p.fog);
    u.zenith.value.setHex(id === 'day' ? 0x6d9dc2 : id === 'golden' ? 0xa6a7b3 : 0x1a2948);
    u.sun.value.fromArray(p.vector);
    u.night.value = p.night;
    ambient.color.setHex(p.ambient);
    ambient.groundColor.setHex(p.shade);
    ambient.intensity = p.sky;
    sun.color.setHex(p.sun);
    sun.intensity = p.intensity;
    sun.position.fromArray(p.vector).multiplyScalar(1.65);
    shared.night.value = p.night;
    scene.environmentIntensity = id === 'blue' ? 0.1 : 0.26;
    renderer.toneMappingExposure = id === 'blue' ? 0.77 : 1.03;
    renderer.shadowMap.needsUpdate = true;
  };
}
