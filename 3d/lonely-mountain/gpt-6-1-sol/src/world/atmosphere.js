import * as THREE from "three";
import { seeded, smooth, clamp } from "../state.js";
import { mountainY, riverX, landY } from "./terrain.js";
import { instance, setInstance, cone } from "./helpers.js";

const keyframes = [
  {
    top: "#467f9f",
    horizon: "#bad0c6",
    fog: "#aabfc0",
    sun: "#fff0d3",
    intensity: 2.8,
    hemi: 1.35,
    exposure: 1.02,
  },
  {
    top: "#6e7778",
    horizon: "#caa071",
    fog: "#aba28b",
    sun: "#ffc480",
    intensity: 2.4,
    hemi: 1.35,
    exposure: 1.02,
  },
  {
    top: "#546472",
    horizon: "#d0a46f",
    fog: "#b5a28a",
    sun: "#ffbd72",
    intensity: 2.7,
    hemi: 1.05,
    exposure: 1.02,
  },
  {
    top: "#242b32",
    horizon: "#815441",
    fog: "#574f44",
    sun: "#ff874b",
    intensity: 0.4,
    hemi: 0.42,
    exposure: 1.0,
  },
  {
    top: "#101719",
    horizon: "#242a28",
    fog: "#252d2b",
    sun: "#9bada2",
    intensity: 0.06,
    hemi: 0.3,
    exposure: 1.2,
  },
];
const glslNoise = `
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
  float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.03+7.1;a*=.5;}return n;}
`;

export function createAtmosphere(scene, renderer, uniforms, buildings) {
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.time,
      uDay: uniforms.day,
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uFog: { value: new THREE.Color() },
      uSun: { value: new THREE.Vector3(-0.5, 0.8, -0.3) },
    },
    vertexShader:
      "varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `${glslNoise} varying vec3 vPos; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uFog; uniform vec3 uSun; uniform float uTime; uniform float uDay;
      void main(){vec3 d=normalize(vPos); float h=max(0.,d.y); vec3 col=mix(uHorizon,uTop,pow(h,.23)); col=mix(uFog,col,smoothstep(-.06,.1,d.y));
      vec2 p=d.xz/max(.08,d.y)*.7; float clouds=fbm(p+vec2(uTime*.004,0.));
      float cloud=smoothstep(.55,.72,clouds)*smoothstep(.03,.22,h)*(1.-smoothstep(.6,.95,h));
      col=mix(col,mix(vec3(.58,.63,.58),vec3(.025,.027,.026),smoothstep(1.4,3.8,uDay)),cloud*.5);
      float sun=max(0.,dot(d,normalize(uSun))); col+=vec3(1.,.78,.44)*pow(sun,100.)*.33*(1.-smoothstep(2.3,3.7,uDay));
      gl_FragColor=vec4(col,1.); #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  // Shader preprocessor directives must begin their own source line.
  skyMaterial.fragmentShader = skyMaterial.fragmentShader.replace(
    " #include",
    "\n#include",
  );
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1350, 32, 20),
    skyMaterial,
  );
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.FogExp2("#aabfc0", 0.0007);
  const sun = new THREE.DirectionalLight("#fff0ca", 3.1);
  sun.position.set(-130, 260, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -210;
  sun.shadow.camera.right = 210;
  sun.shadow.camera.top = 240;
  sun.shadow.camera.bottom = -190;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 750;
  sun.shadow.normalBias = 0.16;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 2;
  sun.target.position.set(0, 10, -15);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight("#bfd5d4", "#625f3f", 2);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight("#b2c8c7", 0.32);
  fill.position.set(130, 120, 180);
  scene.add(fill);
  const random = seeded(571),
    sources = buildings.map((b) => ({
      x: b.x,
      y: b.y + b.h + b.rh * 0.3,
      z: b.z,
      ignition: b.ignition,
    }));
  for (let i = 0; i < 110; i++) {
    const x = (random() - 0.5) * 160,
      z = -65 - random() * 110;
    const y = mountainY(x, z);
    if (y > 100 || y < 13) continue;
    sources.push({ x, y: y + 1, z, ignition: 1.8 + random() * 0.5 });
  }
  for (let i = 0; i < 35; i++) {
    const z = -23 + i * 4;
    sources.push({
      x: riverX(z),
      y: landY(riverX(z) - 7, z) + 1,
      z,
      ignition: 2.3 + i * 0.013,
    });
  }

  const fireMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.time, uDay: uniforms.day },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `attribute float aIgnition; attribute float aPhase; uniform float uTime; uniform float uDay; varying float vFlame; varying vec3 vLocal;
      void main(){vec3 p=position;vLocal=position;float burn=smoothstep(aIgnition,aIgnition+.25,uDay)*(1.-smoothstep(3.12,4.1,uDay)*.94);vFlame=burn;
      p.y=(p.y+.5)*burn*(.75+sin(uTime*4.+aPhase)*.2);p.x+=pow(p.y,2.)*.2*sin(uTime*3.+aPhase);gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(p,1.);}`,
    fragmentShader: `${glslNoise} uniform float uTime; varying float vFlame; varying vec3 vLocal;
      void main(){float h=vLocal.y+.5;float n=fbm(vLocal.xz*7.+vec2(uTime*1.7,h*4.-uTime*3.));float tongue=smoothstep(.32+h*.22,.65,n);float a=(1.-smoothstep(.18,.52,vLocal.y))*tongue*vFlame;vec3 col=mix(vec3(.9,.055,.001),vec3(1.5,.48,.015),1.-h);gl_FragColor=vec4(col,a*.75);}`,
  });
  const flameGeo = new THREE.ConeGeometry(1, 1, 6, 5, true),
    flameCount = sources.length * 3;
  flameGeo.setAttribute(
    "aIgnition",
    new THREE.InstancedBufferAttribute(
      new Float32Array(
        Array.from(
          { length: flameCount },
          (_, i) => sources[Math.floor(i / 3)].ignition,
        ),
      ),
      1,
    ),
  );
  flameGeo.setAttribute(
    "aPhase",
    new THREE.InstancedBufferAttribute(
      new Float32Array(Array.from({ length: flameCount }, () => random() * 10)),
      1,
    ),
  );
  const flames = instance(flameGeo, fireMaterial, flameCount, scene, false);
  flames.frustumCulled = false;
  sources.forEach((s, i) => {
    for (let k = 0; k < 3; k++)
      setInstance(
        flames,
        i * 3 + k,
        s.x + (random() - 0.5) * 2.4,
        s.y - 0.4,
        s.z + (random() - 0.5) * 2,
        0.8 + random() * 1.3,
        3 + random() * 5,
        0.8 + random() * 1.2,
      );
  });

  const effects = new Map();
  const effectMaterials = new Map();
  const effectSpecs = { smoke: 1300, kitchen: 180, spark: 4500, ash: 2700 };
  const pools = new Map();
  let bedMaterial;
  const buildPool = (hour) => {
    const g = new THREE.Group();
    scene.add(g);
    if (hour === 3) {
      const geometry = new THREE.CircleGeometry(1, 9);
      geometry.setAttribute(
        "aIgnition",
        new THREE.InstancedBufferAttribute(
          new Float32Array(buildings.map((b) => b.ignition)),
          1,
        ),
      );
      const material = (bedMaterial ??= new THREE.MeshBasicMaterial({
        color: "#ba4c15",
        transparent: true,
        opacity: 0.6,
      }));
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uDay = uniforms.day;
        shader.vertexShader =
          `uniform float uDay; attribute float aIgnition; varying float vHeat;\n${shader.vertexShader}`.replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvHeat=smoothstep(aIgnition+.1,aIgnition+.4,uDay)*(1.-smoothstep(3.2,4.4,uDay)*.65);",
          );
        shader.fragmentShader =
          `varying float vHeat;\n${shader.fragmentShader}`.replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.a*=vHeat;",
          );
      };
      const beds = instance(geometry, material, buildings.length, g, false);
      buildings.forEach((b, i) => {
        const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        m.scale(new THREE.Vector3(b.w * 0.6, b.d * 0.55, 1));
        m.setPosition(b.x, b.y + b.h + 0.035, b.z);
        beds.setMatrixAt(i, m);
      });
    }
    pools.set(hour, g);
  };
  const townLights = Array.from({ length: 5 }, (_, i) => {
    const l = new THREE.PointLight("#ff761c", 0, 95, 1.5);
    l.position.set(i % 2 ? 40 : -40, 16, i * 34 + 5);
    scene.add(l);
    return l;
  });
  return {
    update(day, time, budget, camera) {
      sky.position.copy(camera.position);
      const a = Math.floor(day.value),
        b = Math.min(4, a + 1),
        t0 = day.value - a,
        t = t0 * t0 * (3 - 2 * t0);
      const ka = keyframes[a],
        kb = keyframes[b],
        lerp = (key) => ka[key] + (kb[key] - ka[key]) * t;
      for (const [u, key] of [
        ["uTop", "top"],
        ["uHorizon", "horizon"],
      ])
        skyMaterial.uniforms[u].value
          .set(ka[key])
          .lerp(new THREE.Color(kb[key]), t);
      sun.color.set(ka.sun).lerp(new THREE.Color(kb.sun), t);
      sun.intensity = lerp("intensity");
      hemi.intensity = lerp("hemi");
      fill.intensity = 0.32 * (1 - day.night * 0.8);
      sun.position.set(
        -130 - day.value * 20,
        260 - day.value * 55,
        90 - day.value * 65,
      );
      skyMaterial.uniforms.uSun.value.copy(sun.position).normalize();
      scene.fog.color.set(ka.fog).lerp(new THREE.Color(kb.fog), t);
      skyMaterial.uniforms.uFog.value.copy(scene.fog.color);
      scene.fog.density = 0.0007 + day.fire * 0.0008 + day.night * 0.0007;
      renderer.toneMappingExposure = lerp("exposure");
      flames.visible = day.value > 1.8;
      const needed = {
        kitchen: day.resident.some((h) => h <= 1),
        smoke: day.resident.some((h) => h >= 2),
        spark: day.resident.some((h) => h >= 2),
        ash: day.resident.some((h) => h >= 3),
      };
      for (const [kind, keep] of Object.entries(needed)) {
        if (keep && !effects.has(kind)) {
          const cloud = makeParticles(
            kind,
            effectSpecs[kind],
            kind === "kitchen" ? sources.slice(0, buildings.length) : sources,
            uniforms,
            seeded(829 + kind.charCodeAt(0)),
            effectMaterials.get(kind),
          );
          effects.set(kind, cloud);
          effectMaterials.set(kind, cloud.material);
          scene.add(cloud);
        }
        if (!keep && effects.has(kind)) {
          const cloud = effects.get(kind);
          scene.remove(cloud);
          cloud.geometry.dispose();
          effects.delete(kind);
        }
      }
      effects
        .get("spark")
        ?.geometry.setDrawRange(
          0,
          Math.min(4500, Math.round(budget.particles * 0.53)),
        );
      effects
        .get("ash")
        ?.geometry.setDrawRange(
          0,
          Math.min(2700, Math.round(budget.particles * 0.31)),
        );
      for (const h of day.resident) if (!pools.has(h)) buildPool(h);
      for (const [h, g] of pools) {
        if (!day.resident.includes(h)) {
          g.traverse((o) => {
            if (o.isMesh) {
              o.geometry.dispose();
              if (o.material !== bedMaterial) o.material.dispose();
              if (o.isInstancedMesh) o.dispose();
            }
          });
          scene.remove(g);
          pools.delete(h);
        } else {
          g.visible = h === 3 && day.value > 2.65;
        }
      }
      townLights.forEach((l, i) => {
        l.intensity =
          (day.fire * 450 + day.night * 45) *
          (0.88 + Math.sin(time * 3 + i) * 0.12);
      });
    },
    resident: () => [...pools.keys()].sort(),
    effects: () => [...effects.keys()].sort(),
  };
}

function makeParticles(kind, count, sources, uniforms, random, cachedMaterial) {
  const pos = [],
    phases = [],
    ignition = [],
    size = [];
  for (let i = 0; i < count; i++) {
    const s = sources[i % sources.length];
    pos.push(
      kind === "ash" ? (random() - 0.5) * 330 : s.x,
      kind === "ash" ? 10 + random() * 90 : s.y,
      kind === "ash" ? -100 + random() * 420 : s.z,
    );
    phases.push(random() * 100);
    ignition.push(s.ignition);
    size.push(0.6 + random() * 0.8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute(
    "aIgnition",
    new THREE.Float32BufferAttribute(ignition, 1),
  );
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  const isSmoke = kind === "smoke" || kind === "kitchen",
    isAsh = kind === "ash";
  const material =
    cachedMaterial ??
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.time, uDay: uniforms.day },
      transparent: true,
      depthWrite: false,
      blending:
        isSmoke || isAsh ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: `attribute float aPhase; attribute float aIgnition; attribute float aSize; uniform float uTime; uniform float uDay; varying float vAge; varying float vAlpha;
      void main(){vec3 p=position; float age=fract(uTime*${isSmoke ? ".026" : isAsh ? ".018" : ".17"}+aPhase);vAge=age;
      ${isAsh ? "p.y=position.y-age*85.;p.x+=sin(age*9.+aPhase)*4.+age*22.;" : `p.y+=age*${kind === "kitchen" ? "18." : isSmoke ? "67." : "27."}; p.x+=age*age*${isSmoke ? "35." : "9."}+sin(age*8.+aPhase)*age*3.;p.z+=sin(aPhase)*age*8.;`}
      ${kind === "kitchen" ? "vAlpha=(1.-smoothstep(1.1,2.3,uDay))*.14;" : isAsh ? "vAlpha=smoothstep(2.85,3.8,uDay)*.65;" : "vAlpha=smoothstep(aIgnition,aIgnition+.3,uDay)*(1.-smoothstep(3.15,4.4,uDay)*.8);"}
      vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv; gl_PointSize=min(180.,${kind === "kitchen" ? "(1.+age*3.)*aSize" : isSmoke ? "(6.+age*25.)*aSize" : isAsh ? ".14*aSize" : ".12*aSize"}*650./max(1.,-mv.z)); }`,
      fragmentShader: `${glslNoise} varying float vAge; varying float vAlpha; uniform float uDay;
      void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float a=smoothstep(.5,.12,d);float n=fbm(gl_PointCoord*6.+vAge*2.);a*=n*.7+.3;
      ${isSmoke ? `vec3 col=${kind === "kitchen" ? "vec3(.5,.53,.48)" : "mix(vec3(.032,.035,.033),vec3(.018,.021,.022),vAge)"};a*=sin(vAge*3.14159)*.75; ${kind === "smoke" ? "col+=vec3(.06,.012,.001)*(1.-vAge)*smoothstep(2.3,3.,uDay);" : ""}` : isAsh ? "vec3 col=vec3(.61,.64,.58);" : "vec3 col=mix(vec3(1.,.53,.06),vec3(1.,.13,.005),vAge);a*=1.-vAge;"}
      gl_FragColor=vec4(col,a*vAlpha); }`,
    });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
