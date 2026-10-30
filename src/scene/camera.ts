import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LANDMARKS } from '../world/landmark-data';
import type { View } from '../ui/interface';

export function createCamera(canvas: HTMLCanvasElement, onInteract: () => void) {
  const camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.4, 14000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 12;
  controls.maxDistance = 2800;
  controls.maxPolarAngle = Math.PI / 2 - 0.018;
  controls.minPolarAngle = 0.005;
  controls.maxTargetRadius = 1500;
  controls.screenSpacePanning = false;
  controls.autoRotateSpeed = 0.22;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const orbitLimit = Math.PI / 2 - 0.018;
  const travelLimit = Math.PI - 0.005;
  let streetEyeHeight: number | null = null;
  let transition: {
    start: THREE.Vector3;
    targetStart: THREE.Vector3;
    end: THREE.Vector3;
    targetEnd: THREE.Vector3;
    startedAt: number;
    eyeHeight: number | null;
  } | null = null;
  controls.addEventListener('start', () => {
    transition = null;
    onInteract();
  });

  function stopInertia() {
    const position = camera.position.clone(),
      target = controls.target.clone();
    const damping = controls.enableDamping;
    const limit = controls.maxPolarAngle;
    controls.maxPolarAngle = travelLimit;
    controls.enableDamping = false;
    controls.update(0);
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update(0);
    controls.enableDamping = damping;
    controls.maxPolarAngle = limit;
  }

  function settle(eyeHeight: number | null) {
    streetEyeHeight = eyeHeight;
    controls.maxPolarAngle = eyeHeight === null ? orbitLimit : travelLimit;
  }

  function travel(
    position: THREE.Vector3,
    target: THREE.Vector3,
    instant = false,
    eyeHeight: number | null = null,
  ) {
    controls.maxPolarAngle = travelLimit;
    stopInertia();
    streetEyeHeight = null;
    if (instant || reducedMotion) {
      camera.position.copy(position);
      controls.target.copy(target);
      settle(eyeHeight);
      controls.update(0);
      transition = null;
      return;
    }
    transition = {
      start: camera.position.clone(),
      targetStart: controls.target.clone(),
      end: position,
      targetEnd: target,
      startedAt: performance.now(),
      eyeHeight,
    };
  }

  function overview(instant = false) {
    const mobile = window.innerWidth < 761;
    travel(
      new THREE.Vector3(mobile ? 1000 : 880, mobile ? 1000 : 780, mobile ? 1280 : 1050),
      new THREE.Vector3(mobile ? -115 : -185, 55, 30),
      instant,
    );
  }

  function visit(id: string) {
    const place = LANDMARKS.find((p) => p.id === id);
    if (!place) return;
    const [x, z] = place.position;
    const d = place.distance * (window.innerWidth < 761 ? 1.3 : 1);
    if (id === 'clock') {
      travel(new THREE.Vector3(x + d * 0.38, 21, z - d * 0.55), new THREE.Vector3(x, 5.5, z));
      return;
    }
    travel(
      new THREE.Vector3(x + d * 0.68, place.targetHeight + d * 0.52, z + d * 0.8),
      new THREE.Vector3(x - d * 0.08, place.targetHeight, z),
    );
  }

  function setView(view: View, landmark: string | null) {
    const place = LANDMARKS.find((p) => p.id === landmark);
    const x = place?.position[0] ?? -140,
      z = place?.position[1] ?? 35;
    if (view === 'top') {
      const height = place ? Math.max(place.height + 200, place.distance * 1.7) : 1700;
      travel(new THREE.Vector3(x, height, z + 0.01), new THREE.Vector3(x, 0, z));
    } else if (view === 'street') {
      const isClock = landmark === 'clock';
      travel(
        new THREE.Vector3(isClock ? x + 15 : 70, isClock ? 2.2 : 3.5, isClock ? z + 27 : 48),
        new THREE.Vector3(isClock ? x : -145, isClock ? 6 : 80, isClock ? z : -75),
        false,
        isClock ? 2.2 : 3.5,
      );
    } else if (landmark) visit(landmark);
    else overview();
  }

  function update(delta: number) {
    if (transition) {
      const t = Math.min(1, (performance.now() - transition.startedAt) / 1600);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.start, transition.end, eased);
      controls.target.lerpVectors(transition.targetStart, transition.targetEnd, eased);
      if (t >= 1) {
        settle(transition.eyeHeight);
        transition = null;
      }
    }
    controls.update(delta);
    if (streetEyeHeight !== null) {
      controls.target.y += streetEyeHeight - camera.position.y;
      camera.position.y = streetEyeHeight;
    } else {
      camera.position.y = Math.max(1.8, camera.position.y);
    }
  }
  overview(true);
  return {
    camera,
    controls,
    overview,
    visit,
    setView,
    update,
    stopInertia,
    isTravelling: () => transition !== null,
  };
}
