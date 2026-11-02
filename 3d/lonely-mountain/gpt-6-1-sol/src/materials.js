import * as THREE from "three";
import { seeded } from "./state.js";

function texture(kind, size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const rnd = seeded(48 + kind.length * 100);
  ctx.fillStyle =
    kind === "roof" ? "#b6aaa0" : kind === "wood" ? "#a8a291" : "#c4c1b1";
  ctx.fillRect(0, 0, size, size);
  if (kind === "stone" || kind === "roof") {
    const h = kind === "roof" ? 24 : 64,
      w = kind === "roof" ? 40 : 100;
    for (let y = -h; y < size; y += h)
      for (let x = -w; x < size + w; x += w) {
        const offset = ((Math.floor(y / h) % 2) * w) / 2,
          light = kind === "stone" ? 202 + rnd() * 17 : 160 + rnd() * 65;
        ctx.fillStyle = `rgb(${light + 6},${light + 2},${light - 8})`;
        ctx.fillRect(x + offset + 1, y + 1, w - 2, h - 2);
        ctx.strokeStyle =
          kind === "stone" ? "rgba(85,83,70,.17)" : "rgba(45,43,35,.23)";
        ctx.strokeRect(x + offset + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = "rgba(255,250,218,.14)";
        ctx.fillRect(x + offset + 2, y + 2, w - 4, 2);
      }
  }
  if (kind === "wood") {
    for (let x = 0; x < size; x += 4) {
      ctx.strokeStyle = `rgba(35,26,17,${rnd() * 0.26})`;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + rnd() * 9, 140, x - rnd() * 9, 320, x, 512);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle =
      rnd() > 0.5
        ? `rgba(30,30,24,${rnd() * 0.12})`
        : `rgba(255,255,240,${rnd() * 0.15})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createMaterials(uniforms) {
  const masonry = texture("stone"),
    shingles = texture("roof"),
    grain = texture("wood"),
    rock = texture("rock");
  rock.repeat.set(55, 55);
  masonry.repeat.set(2, 3);
  const standard = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const materials = {
    stone: standard("#c1b89a", {
      map: masonry,
      bumpMap: masonry,
      bumpScale: 0.17,
    }),
    pale: standard("#e0d5b9", {
      map: masonry,
      bumpMap: masonry,
      bumpScale: 0.1,
    }),
    darkStone: standard("#6a7168", {
      map: masonry,
      bumpMap: masonry,
      bumpScale: 0.2,
    }),
    rock: standard("#ffffff", {
      map: rock,
      bumpMap: rock,
      bumpScale: 0.65,
      vertexColors: true,
      roughness: 1,
    }),
    ground: standard("#ffffff", { vertexColors: true }),
    roof: standard("#ffffff", {
      map: shingles,
      bumpMap: shingles,
      bumpScale: 0.17,
    }),
    roofDepth: new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    }),
    timber: standard("#68543d", {
      map: grain,
      bumpMap: grain,
      bumpScale: 0.12,
    }),
    bronze: standard("#91834b", { metalness: 0.65, roughness: 0.36 }),
    black: standard("#152323"),
    pine: standard("#ffffff", { flatShading: true }),
    trunk: standard("#6e5f43"),
    leaf: standard("#7e9251", { flatShading: true }),
    barley: standard("#b8a863"),
    canvas: standard("#e4d5b0", { side: THREE.DoubleSide }),
    cloth: standard("#ffffff"),
    skin: standard("#c7a27f"),
    ember: standard("#281d13", { emissive: "#ff6c16", emissiveIntensity: 1.2 }),
    lamp: new THREE.MeshBasicMaterial({ color: "#ffcf73" }),
  };
  materials.walls = materials.pale.clone();
  materials.walls.color.set("#ffffff");
  evolve(materials.walls, uniforms, false);
  evolve(materials.roof, uniforms, true);
  evolve(materials.roofDepth, uniforms, true);
  materials.rock.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vRock;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvRock=position;",
    );
    shader.fragmentShader =
      `varying vec3 vRock;\n${shader.fragmentShader}`.replace(
        "#include <color_fragment>",
        `#include <color_fragment>\nfloat strata=sin(vRock.y*.19+sin(vRock.x*.15)*3.+sin(vRock.z*.19)*4.)*.5+.5;float cracks=pow(abs(sin(vRock.x*.45+vRock.z*.21+sin(vRock.y*.13))),28.);diffuseColor.rgb*=.86+strata*.14;diffuseColor.rgb*=1.-cracks*.2;`,
      );
  };
  return materials;
}

export function evolve(material, uniforms, roof = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDay = uniforms.day;
    shader.vertexShader = `attribute float aIgnition; varying float vBurn; uniform float uDay;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>\nvBurn = smoothstep(aIgnition, aIgnition + 0.5, uDay);\n${roof ? "transformed.y *= 1.0 - vBurn * 0.9; transformed.x += sin(position.z * 16.0 + aIgnition * 20.0) * vBurn * 0.055;" : ""}`,
    );
    shader.fragmentShader = `varying float vBurn;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.065, 0.057, 0.044), vBurn * 0.94);",
    );
  };
  material.customProgramCacheKey = () => `evolving-${roof}`;
}

export function makeWater(uniforms) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: {
      ...THREE.UniformsLib.fog,
      uTime: uniforms.time,
      uDay: uniforms.day,
    },
    vertexShader: `varying vec3 vWorld; varying vec2 vUv; uniform float uTime;
      #include <fog_pars_vertex>
      void main(){ vUv=uv; vec3 p=position; p.y += sin(p.z*1.7+uTime*2.2)*.045+sin(p.x*3.2-uTime*1.5)*.035; vWorld=(modelMatrix*vec4(p,1.)).xyz; vec4 mvPosition=viewMatrix*vec4(vWorld,1.); gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vWorld; varying vec2 vUv; uniform float uTime; uniform float uDay;
      #include <fog_pars_fragment>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        float wave=sin(vWorld.z*3.8-uTime*3.+sin(vWorld.x*2.2+uTime))*.5+.5;
        float fine=sin(vWorld.z*15.+vWorld.x*7.-uTime*8.)*.5+.5;
        float edge=smoothstep(.34,.5,abs(vUv.x-.5));
        vec3 base=mix(vec3(.018,.075,.065),vec3(.08,.20,.16),wave*.45+fine*.08);
        base=mix(base,vec3(.12,.24,.19),edge*.5);
        float spec=pow(wave,24.)*pow(sin(vWorld.x*.9+vWorld.z*.12+uTime*.2)*.5+.5,6.);
        base+=spec*.13;
        float night=smoothstep(2.4,4.,uDay); base*=1.-night*.85;
        float fire=smoothstep(2.4,3.1,uDay)*(1.-smoothstep(3.1,4.8,uDay)*.65);
        base+=vec3(1.,.32,.025)*fire*(spec*1.7+fine*.07)*(1.-abs(vUv.x-.5));
        gl_FragColor=vec4(base,1.);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });
}
