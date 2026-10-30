import * as THREE from 'three';
import { osm } from '../osm';
import { MeshBuilder, orient, toRing } from '../lib/geom';
import { grassTexture, pavingTexture } from '../lib/textures';

/** Coplanar layers are separated by tiny lifts plus polygon offset. */
export function layered<T extends THREE.Material>(material: T, layer: number): T {
  material.polygonOffset = true;
  material.polygonOffsetFactor = -layer;
  material.polygonOffsetUnits = -layer * 2;
  return material;
}

export function buildGround(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ground';

  const paving = pavingTexture();
  paving.repeat.set(1, 1);
  const size = 24000;
  const planeGeo = new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2);
  const uv = planeGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / 4), uv.getY(i) * (size / 4));
  const ground = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: paving, color: 0xd8d4cc, roughness: 0.95 }));
  ground.receiveShadow = true;
  ground.name = 'ground-plane';
  group.add(ground);

  const builders: Record<string, MeshBuilder> = { park: new MeshBuilder(), plaza: new MeshBuilder(), water: new MeshBuilder(), fountain: new MeshBuilder() };
  for (const area of osm.areas) {
    const kind = area.k === 'grass' ? 'park' : area.k;
    const holes = (area.inner ?? []).map((f) => orient(toRing(f), true));
    for (const outer of area.outer) {
      try {
        builders[kind].polygon(orient(toRing(outer)), holes, kind === 'water' ? 0.03 : kind === 'park' ? 0.02 : 0.01, kind === 'park' ? 6 : 4);
      } catch {
        // Self-intersecting OSM polygons are skipped rather than mis-triangulated.
      }
    }
  }

  const grass = grassTexture();
  const meshes: [string, THREE.Material][] = [
    ['plaza', layered(new THREE.MeshStandardMaterial({ map: paving, color: 0xeae5da, roughness: 0.9 }), 1)],
    ['park', layered(new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }), 2)],
    ['water', layered(new THREE.MeshStandardMaterial({ color: 0x2f4f5c, roughness: 0.08, metalness: 0.2 }), 3)],
    ['fountain', layered(new THREE.MeshStandardMaterial({ color: 0x6f9fb0, roughness: 0.05, metalness: 0.1 }), 4)],
  ];
  for (const [kind, material] of meshes) {
    if (!builders[kind].vertexCount) continue;
    const mesh = new THREE.Mesh(builders[kind].build(), material);
    mesh.receiveShadow = true;
    mesh.name = kind;
    group.add(mesh);
  }

  // Fountain basins from point nodes.
  const basin = new MeshBuilder();
  basin.color.set(0x9c968c);
  for (let i = 0; i < osm.fountains.length; i += 2) {
    const m = new THREE.Matrix4().makeTranslation(osm.fountains[i], 0.25, osm.fountains[i + 1]);
    basin.addGeometry(new THREE.TorusGeometry(3.2, 0.35, 6, 24).rotateX(Math.PI / 2), m);
    basin.addGeometry(new THREE.CylinderGeometry(3.2, 3.2, 0.1, 24), new THREE.Matrix4().makeTranslation(osm.fountains[i], 0.35, osm.fountains[i + 1]));
  }
  if (basin.vertexCount) {
    const mesh = new THREE.Mesh(basin.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
