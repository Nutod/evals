import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createMaterials } from "./materials.js";
import {
  createTerrain,
  landY,
  cameraGroundY,
  riverX,
} from "./world/terrain.js";
import { createTown, MARKET } from "./world/town.js";
import { createPopulation } from "./world/population.js";
import { createDragon } from "./world/dragon.js";
import { createAtmosphere } from "./world/atmosphere.js";
import { createCountryside } from "./world/countryside.js";
import { sampleDay, budgets, clamp, mix } from "./state.js";
import { createUI } from "./ui.js";
import "./style.css";

try {
  start();
} catch (error) {
  console.error(error);
  const failure = document.querySelector("#failure");
  failure.hidden = false;
  failure.textContent = `This valley needs WebGL 2. Try a current browser with hardware acceleration enabled. ${error.message}`;
}

function start() {
  const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector("#world"),
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(
      54,
      innerWidth / innerHeight,
      0.2,
      2200,
    );
  const presets = {
    valley: { position: [151, 179, 351], target: [0, 42, -20] },
    market: {
      position: [MARKET.x + 4, landY(MARKET.x, MARKET.z) + 2.6, MARKET.z + 4],
      target: [MARKET.x - 4, 10, MARKET.z - 15],
    },
    falls: {
      position: [riverX(119) + 3, 6.5, 125],
      target: [riverX(106), 5.8, 104],
    },
    gate: { position: [12, 18, 8], target: [0, 34, -40] },
    aerial: { position: [650, 510, 460], target: [0, 28, 280] },
  };
  camera.position.set(...presets.valley.position);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...presets.valley.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 5;
  controls.maxDistance = 860;
  controls.maxPolarAngle = Math.PI * 0.78;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.7;
  const uniforms = { time: { value: 0 }, day: { value: 0 } },
    materials = createMaterials(uniforms);
  const terrain = createTerrain(scene, materials, uniforms),
    town = createTown(scene, materials, uniforms);
  const countryside = createCountryside(scene, materials, uniforms);
  const population = createPopulation(
      scene,
      materials,
      uniforms,
      town.buildings,
    ),
    dragon = createDragon(scene, uniforms);
  const atmosphere = createAtmosphere(
    scene,
    renderer,
    uniforms,
    town.buildings,
  );
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.2,
    0.6,
    1.25,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let value = 0,
    renderedValue = 0,
    target = 0,
    travelling = false,
    playing = false,
    density = 1,
    quality = "high",
    cameraMove = null,
    time = 0,
    frames = 0;
  const ui = createUI({
    seek(v) {
      value = target = clamp(v, 0, 4);
      travelling = false;
    },
    travel(v) {
      target = v;
      travelling = true;
    },
    play(v) {
      playing = v;
      travelling = false;
      if (v && value >= 4) value = 0;
    },
    density(v) {
      density = v;
    },
    quality(v) {
      quality = v;
      renderer.setPixelRatio(
        Math.min(devicePixelRatio, v === "low" ? 1 : v === "medium" ? 1.5 : 2),
      );
      composer.setPixelRatio(renderer.getPixelRatio());
      resize();
    },
    camera(name) {
      cameraMove = {
        start: camera.position.clone(),
        startTarget: controls.target.clone(),
        end: new THREE.Vector3(...presets[name].position),
        endTarget: new THREE.Vector3(...presets[name].target),
        progress: 0,
      };
    },
  });
  controls.addEventListener("start", () => {
    cameraMove = null;
  });
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = innerWidth < 650 ? 64 : 54;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  }
  window.addEventListener("resize", resize);
  resize();
  const debug = {
    ready: false,
    build: "lonely-mountain-1",
    get state() {
      return {
        ...sampleDay(renderedValue),
        quality,
        density,
        people: budgets(quality, density).people,
        frames,
        camera: camera.position.toArray(),
        resident: atmosphere.resident(),
        effects: atmosphere.effects(),
        dragonVisible: dragon.root.visible,
        geometries: renderer.info.memory.geometries,
        programs: renderer.info.programs.length,
      };
    },
  };
  Object.defineProperty(window, "__valley", { value: debug });
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    if (playing) value = Math.min(4, value + dt / 27);
    if (travelling) {
      value = mix(value, target, 1 - Math.exp(-dt * 3.5));
      if (Math.abs(target - value) < 0.002) {
        value = target;
        travelling = false;
      }
    }
    if (cameraMove) {
      cameraMove.progress = Math.min(1, cameraMove.progress + dt / 1.8);
      const t = cameraMove.progress,
        ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(cameraMove.start, cameraMove.end, ease);
      controls.target.lerpVectors(
        cameraMove.startTarget,
        cameraMove.endTarget,
        ease,
      );
      if (t === 1) cameraMove = null;
    }
    controls.target.x = clamp(controls.target.x, -260, 260);
    controls.target.z = clamp(controls.target.z, -230, 850);
    controls.target.y = clamp(controls.target.y, 1, 200);
    controls.update();
    camera.position.y = Math.max(
      cameraGroundY(camera.position.x, camera.position.z) + 2,
      camera.position.y,
    );
    uniforms.time.value = time;
    uniforms.day.value = value;
    const day = sampleDay(value),
      budget = budgets(quality, density);
    terrain.update(day, time, budget, camera);
    countryside.update(day, time, budget, camera);
    town.update(day, time, budget, camera);
    population.update(day, time, budget, camera);
    dragon.update(day, time, camera);
    atmosphere.update(day, time, budget, camera);
    bloom.strength = 0.1 + day.fire * 0.18 + day.night * 0.12;
    ui.update(day);
    composer.render();
    renderedValue = value;
    frames++;
    debug.ready = true;
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    const failure = document.querySelector("#failure");
    failure.hidden = false;
    failure.textContent =
      "The graphics context was interrupted. Reload to return to the valley.";
  });
}
