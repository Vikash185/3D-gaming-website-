// Post-processing shared by the hero and the services scene.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v;
  }
`;

const passVertex = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Flames licking up from the character silhouette (read from a mask render).
export const AuraShader = {
  uniforms: {
    tDiffuse: { value: null },
    tMask: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uInner: { value: new THREE.Color(0.9, 0.24, 0.06) },
    uOuter: { value: new THREE.Color(0.22, 0.012, 0.008) },
    uIntensity: { value: 0.4 },
    uFlame: { value: 0.9 },
    uHaze: { value: 0.003 },
  },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tMask;
    uniform float uTime;
    uniform float uAspect;
    uniform vec3 uInner;
    uniform vec3 uOuter;
    uniform float uIntensity;
    uniform float uFlame;
    uniform float uHaze;
    varying vec2 vUv;
    ${NOISE_GLSL}
    float mask(vec2 uv, float lod) { return textureLod(tMask, uv, lod).r; }
    void main() {
      vec2 uv = vUv;
      float m = mask(uv, 1.0);
      float jitter = hash(gl_FragCoord.xy + fract(uTime) * 61.0);
      // soft halo from the blurred mip chain
      float halo = mask(uv, 3.0) * 0.5 + mask(uv, 4.5) * 0.35 + mask(uv, 6.0) * 0.25;
      // flames: sample the silhouette below this pixel, wobbling with scrolling noise
      vec2 q = vec2(uv.x * uAspect, uv.y);
      float n1 = fbm(q * vec2(7.0, 3.2) - vec2(0.0, uTime * 0.9));
      float n2 = fbm(q * vec2(13.0, 6.0) - vec2(uTime * 0.2, uTime * 1.6));
      float flame = 0.0;
      for (int i = 1; i <= 7; i++) {
        float fi = float(i);
        vec2 off = vec2((n1 - 0.5) * 0.035, -(fi - jitter) * 0.0105 * (0.6 + n2));
        flame += mask(uv + off * uFlame, 1.5) * (1.0 - fi / 8.0);
      }
      flame = flame / 3.5;
      flame *= smoothstep(0.25, 0.75, n1 * 0.6 + n2 * 0.6);
      float outside = 1.0 - smoothstep(0.15, 0.75, m);
      // heat haze around the body
      vec2 haze = (vec2(n1, n2) - 0.5) * uHaze * halo;
      vec4 base = texture2D(tDiffuse, uv + haze);
      vec3 aura = uOuter * halo * 1.4 + uInner * pow(flame, 1.4) * 1.6;
      base.rgb += aura * uIntensity * outside;
      // a whisper of inner rim where the flames meet the body
      base.rgb += uInner * (halo - m * 0.6) * m * uIntensity * 0.25;
      gl_FragColor = base;
    }
  `,
};

// Chromatic aberration, vignette and a slice glitch for state changes.
export const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uCA: { value: 0.0022 },
    uVignette: { value: 0.38 },
    uGlitch: { value: 0 },
  },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uCA;
    uniform float uVignette;
    uniform float uGlitch;
    varying vec2 vUv;
    ${NOISE_GLSL}
    void main() {
      vec2 uv = vUv;
      float band = floor(uv.y * 28.0);
      float r = hash(vec2(band, floor(uTime * 24.0)));
      uv.x += (r - 0.5) * 0.06 * uGlitch * step(0.62, r);
      vec2 d = uv - 0.5;
      float ca = uCA * (0.4 + dot(d, d) * 3.0) + uGlitch * 0.01;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ca * 4.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ca * 4.0).b;
      float vig = smoothstep(0.95, 0.25, length(d * vec2(1.1, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, vig);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const GrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0.045 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform vec2 uRes;
    varying vec2 vUv;
    ${NOISE_GLSL}
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 px = vUv * uRes;
      float n = hash(px + fract(uTime * 13.37) * 517.0) - 0.5;
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb += n * uAmount * (0.35 + 0.65 * (1.0 - lum));
      gl_FragColor = c;
    }
  `,
};

export function createComposer(renderer, scene, camera, { aura = false, bloom = [0.32, 0.65, 0.82], renderPass, samples = 0 } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(renderPass ?? new RenderPass(scene, camera));

  let auraPass = null;
  if (aura) {
    auraPass = new ShaderPass(AuraShader);
    composer.addPass(auraPass);
  }
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), ...bloom);
  composer.addPass(bloomPass);
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  const grain = new ShaderPass(GrainShader);
  composer.addPass(grain);

  return {
    composer,
    aura: auraPass,
    bloom: bloomPass,
    lens,
    grain,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      bloomPass.resolution.set((w * pr) / 2, (h * pr) / 2);
      grain.uniforms.uRes.value.set(w * pr, h * pr);
      if (auraPass) auraPass.uniforms.uAspect.value = w / h;
    },
    render(time) {
      lens.uniforms.uTime.value = time;
      grain.uniforms.uTime.value = time;
      if (auraPass) auraPass.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
