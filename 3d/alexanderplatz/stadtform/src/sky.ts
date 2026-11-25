import * as T from 'three';

/** Only the upper hemisphere shows above the survey table. All cloud shapes are mathematical. */
export function makeSky() {
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      horizon: { value: new T.Color() },
      zenith: { value: new T.Color() },
      sun: { value: new T.Vector3() },
      night: { value: 0 },
    },
    vertexShader: `
      varying vec3 direction;
      void main(){
        direction=position;
        vec4 clip=projectionMatrix*viewMatrix*vec4(cameraPosition+position,1.);
        gl_Position=clip.xyww;
      }`,
    fragmentShader: `
      uniform vec3 horizon,zenith,sun;
      uniform float night;
      varying vec3 direction;
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.71,317.53)))*43758.545);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
      }
      void main(){
        vec3 d=normalize(direction);
        float h=max(d.y,0.);
        vec3 sky=mix(horizon,zenith,pow(h,.48));
        vec2 p=d.xz/max(.075,h+.08)*2.6;
        float cloud=noise(p)*.54+noise(p*2.)*.27+noise(p*4.)*.13+noise(p*8.)*.06;
        sky=mix(sky,vec3(.93,.94,.88),smoothstep(.52,.8,cloud)*smoothstep(0.,.25,h)*.44*(1.-night));
        float sunDot=max(dot(d,normalize(sun)),0.);
        sky+=vec3(1.,.85,.61)*(.28*pow(sunDot,45.)+1.5*pow(sunDot,2400.))*(1.-night);
        gl_FragColor=vec4(sky,1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new T.Mesh(new T.SphereGeometry(1, 40, 22), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
