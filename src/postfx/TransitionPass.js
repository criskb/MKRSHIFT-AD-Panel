import * as THREE from "three";

export const TransitionShader = {
  uniforms: {
    tDiffuseA: { value: null },
    tDiffuseB: { value: null },
    progress: { value: 0 },
    time: { value: 0 },
    softness: { value: 0.2 },
    noiseScale: { value: 2.0 },
    rgbSplit: { value: 0.001 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuseA;
    uniform sampler2D tDiffuseB;
    uniform float progress;
    uniform float time;
    uniform float softness;
    uniform float noiseScale;
    uniform float rgbSplit;

    float hash(vec2 p){
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    void main(){
      vec2 uv = vUv;
      float n = hash(uv * noiseScale + time * 0.1);
      float m = smoothstep(progress - softness, progress + softness, n);

      float edge = abs(n - progress);
      float split = rgbSplit * smoothstep(0.2, 0.0, edge);

      vec4 a = texture2D(tDiffuseA, uv);
      vec4 bR = texture2D(tDiffuseB, uv + vec2(split, 0.0));
      vec4 bG = texture2D(tDiffuseB, uv);
      vec4 bB = texture2D(tDiffuseB, uv - vec2(split, 0.0));
      vec4 b = vec4(bR.r, bG.g, bB.b, bG.a);

      gl_FragColor = mix(a, b, m);
    }
  `,
};

export function createTransitionMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(TransitionShader.uniforms),
    vertexShader: TransitionShader.vertexShader,
    fragmentShader: TransitionShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}
