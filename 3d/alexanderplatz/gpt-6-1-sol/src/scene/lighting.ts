import * as THREE from 'three';
import { nightMaterials } from '../world/primitives';
import type { Lighting } from '../ui/interface';

export function createLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const hemisphere = new THREE.HemisphereLight('#ccdae0', '#667263', 2);
  const sun = new THREE.DirectionalLight('#ffdda9', 3.2);
  sun.position.set(-470, 600, 420);
  sun.target.position.set(-100, 0, 50);
  sun.castShadow = true;
  const size = window.innerWidth < 761 ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.camera.left = -1000;
  sun.shadow.camera.right = 1000;
  sun.shadow.camera.top = 850;
  sun.shadow.camera.bottom = -850;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 2500;
  sun.shadow.normalBias = 0.5;
  sun.shadow.bias = -0.00015;
  sun.shadow.radius = 3;
  scene.add(hemisphere, sun, sun.target);
  const fill = new THREE.DirectionalLight('#bed5e0', 0.45);
  fill.position.set(700, 400, -500);
  scene.add(fill);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#a6c5ce');
  gradient.addColorStop(0.48, '#dce5d8');
  gradient.addColorStop(0.52, '#8d9e91');
  gradient.addColorStop(1, '#3b4741');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 256);
  context.fillStyle = '#fff6da';
  context.fillRect(70, 70, 35, 30);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(texture);
  scene.environment = environment.texture;
  texture.dispose();
  pmrem.dispose();

  function set(preset: Lighting) {
    const palettes = {
      day: {
        background: '#567071',
        fog: '#78918b',
        sky: '#d8e7e6',
        ground: '#757965',
        sun: '#ffefca',
        intensity: 3.2,
        ambient: 2.2,
        exposure: 1.08,
        night: 0,
        position: [-350, 1100, 300],
        environment: 0.65,
      },
      golden: {
        background: '#304846',
        fog: '#73847a',
        sky: '#c5d3d2',
        ground: '#85765c',
        sun: '#ffd09a',
        intensity: 3.8,
        ambient: 1.65,
        exposure: 1.03,
        night: 0.07,
        position: [-650, 520, 560],
        environment: 0.55,
      },
      blue: {
        background: '#172b39',
        fog: '#253f4d',
        sky: '#789cb8',
        ground: '#455564',
        sun: '#9ebee8',
        intensity: 0.7,
        ambient: 0.9,
        exposure: 1.05,
        night: 1,
        position: [200, 550, -600],
        environment: 0.18,
      },
    };
    const p = palettes[preset];
    scene.background = new THREE.Color(p.background);
    scene.fog = new THREE.FogExp2(p.fog, preset === 'blue' ? 0.00032 : 0.0002);
    scene.environmentIntensity = p.environment;
    hemisphere.color.set(p.sky);
    hemisphere.groundColor.set(p.ground);
    hemisphere.intensity = p.ambient;
    sun.color.set(p.sun);
    sun.intensity = p.intensity;
    sun.position.set(p.position[0], p.position[1], p.position[2]);
    fill.intensity = preset === 'blue' ? 0.35 : 0.45;
    renderer.toneMappingExposure = p.exposure;
    for (const mat of nightMaterials) mat.emissiveIntensity = p.night * 1.6 + 0.015;
    renderer.shadowMap.needsUpdate = true;
    return p.night;
  }

  return {
    set,
    dispose() {
      environment.dispose();
    },
  };
}
