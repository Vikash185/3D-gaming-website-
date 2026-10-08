// Special services: fourteen glass contract cards spiralling down a giant katana.
// The world (backdrop, blade, headline) is rendered first and copied into a mipmapped
// texture that the glass cards refract; then cards and particles are drawn on top.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createKatana, BLADE } from './katana.js';
import { createComposer, NOISE_GLSL } from './post.js';
import { SPIRAL, FOCUS_RANGE, focusFromProgress, mediaName, categoryLabel, SERVICES } from './data.js';

const { clamp, lerp, degToRad } = THREE.MathUtils;
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const range = (a, b) => a + (b - a) * rand();

const CARD = { W: 1.6, H: 1, T: 0.07 };

// ---------- backdrop & headline ----------
function createBackdrop() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uBase: { value: new THREE.Color(0.0235, 0.0226, 0.0214) },
      uGlow: { value: new THREE.Color(0.2, 0.03, 0.018) },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec2 uRes;
      uniform float uTime;
      uniform float uScroll;
      uniform vec3 uBase;
      uniform vec3 uGlow;
      ${NOISE_GLSL}
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        float aspect = uRes.x / uRes.y;
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
        float n = noise(vec2(p.x * 3.0, p.y * 1.4 + uScroll * 0.35 - uTime * 0.04));
        float column = exp(-p.x * p.x * 7.0) * (0.55 + 0.45 * n);
        float violet = exp(-dot(p - vec2(-0.75, 0.42), p - vec2(-0.75, 0.42)) * 1.6);
        float ember = exp(-dot(p - vec2(0.8, -0.45), p - vec2(0.8, -0.45)) * 1.8);
        float vig = smoothstep(1.3, 0.1, length(p * vec2(0.75, 1.0)));
        vec3 col = uBase * (0.62 + 0.42 * vig);
        col += uGlow * column * 0.12;
        col += vec3(0.02, 0.008, 0.034) * violet * (0.6 + 0.4 * n);
        col += vec3(0.034, 0.014, 0.005) * ember;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

function textPlane(text, { width = 7.6, color = '#5c524a' } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = "500 240px Archivo, 'Helvetica Neue', Arial, sans-serif";
  const style = () => {
    g.font = font;
    if ('fontStretch' in g) g.fontStretch = 'semi-expanded';
    if ('letterSpacing' in g) g.letterSpacing = `${-0.045 * 240}px`;
  };
  style();
  c.width = Math.ceil(g.measureText(text).width + 72);
  c.height = 252;
  style();
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 36, c.height * 0.54);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { tText: { value: tex }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tText;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float a = texture2D(tText, vUv).a;
        vec3 col = uColor * (0.75 + 0.5 * (1.0 - vUv.y));
        gl_FragColor = vec4(col, a * uOpacity);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, (width * c.height) / c.width), mat);
  mesh.renderOrder = -900;
  return mesh;
}

// ---------- particles ----------
const LILY_COLORS = [
  { petal: [0.95, 0.035, 0.05], tip: [1, 0.16, 0.12], stamen: [1, 0.12, 0.18], anther: [1, 0.55, 0.3] },
  { petal: [0.85, 0.82, 0.9], tip: [1, 0.95, 1], stamen: [1, 0.85, 0.9], anther: [1, 0.75, 0.5] },
  { petal: [0.55, 0.06, 0.85], tip: [0.9, 0.25, 1], stamen: [0.9, 0.2, 0.9], anther: [1, 0.5, 0.8] },
];

function basis(dir) {
  const a = dir.clone().normalize();
  const ref = Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(a, ref).normalize();
  const v = new THREE.Vector3().crossVectors(a, u).normalize();
  return { a, u, v };
}

// a spider lily drawn as glowing points: six recurved petals + long stamens
function addLily(out, origin, dir, size, col) {
  const { a, u, v } = basis(dir);
  const radial = new THREE.Vector3();
  const across = new THREE.Vector3();
  const p = new THREE.Vector3();
  const push = (pt, c, s, k = 1) => {
    out.pos.push(pt.x, pt.y, pt.z);
    out.col.push(c[0] * k, c[1] * k, c[2] * k);
    out.size.push(s);
    out.phase.push(rand() * 100);
  };
  const mixc = (x, y, t) => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  const spin = rand() * Math.PI * 2;
  for (let k = 0; k < 6; k++) {
    const ang = spin + (k / 6) * Math.PI * 2 + range(-0.12, 0.12);
    radial.copy(u).multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
    across.crossVectors(a, radial);
    const curl = range(0.65, 0.95);
    for (let i = 0; i < 40; i++) {
      const t = (i + rand()) / 40;
      const w = size * 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.8;
      for (let j = 0; j < 2; j++) {
        p.copy(origin)
          .addScaledVector(radial, size * t)
          .addScaledVector(a, size * (0.32 * Math.sin(Math.PI * t * 0.85) - curl * t * t))
          .addScaledVector(across, (rand() - 0.5) * w + Math.sin(t * 16 + k) * size * 0.025);
        push(p, mixc(col.petal, col.tip, t * t), range(1, 1.7), 0.55);
      }
    }
    const sa = ang + Math.PI / 6;
    const sdir = new THREE.Vector3().copy(u).multiplyScalar(Math.cos(sa)).addScaledVector(v, Math.sin(sa));
    const reach = range(1.1, 1.5);
    for (let i = 0; i < 16; i++) {
      const t = (i + rand()) / 16;
      p.copy(origin).addScaledVector(a, size * reach * t).addScaledVector(sdir, size * 1.15 * t ** 1.7);
      push(p, col.stamen, 0.75, 0.45);
    }
    const tip = origin.clone().addScaledVector(a, size * reach).addScaledVector(sdir, size * 1.15);
    for (let i = 0; i < 4; i++) {
      p.copy(tip).add(new THREE.Vector3(range(-1, 1), range(-1, 1), range(-1, 1)).multiplyScalar(size * 0.04));
      push(p, col.anther, 1.5, 0.85);
    }
  }
}

function createLilies({ top = 2.2, bottom = -9, clusters = 15 } = {}) {
  const out = { pos: [], col: [], size: [], phase: [] };
  for (let i = 0; i < clusters; i++) {
    const y = top + (bottom - top) * ((i + range(0.1, 0.9)) / clusters);
    const ang = i * 2.4 + range(-0.4, 0.4);
    const r = range(0.42, 0.85);
    const c = new THREE.Vector3(Math.sin(ang) * r, y, Math.cos(ang) * r);
    const outward = new THREE.Vector3(Math.sin(ang), range(0.3, 0.9), Math.cos(ang)).normalize();
    const col = LILY_COLORS[i % 7 === 3 ? 1 : i % 5 === 4 ? 2 : 0];
    const n = 7 + Math.floor(rand() * 5);
    const size = range(0.2, 0.3);
    for (let k = 0; k < n; k++) {
      const d = outward.clone().add(new THREE.Vector3(range(-1, 1), range(-0.6, 1), range(-1, 1)).multiplyScalar(0.75)).normalize();
      addLily(out, c.clone().addScaledVector(d, size * range(0.8, 1.6)), d, size * range(0.85, 1.15), col);
    }
    // drifting pollen
    for (let k = 0; k < 200; k++) {
      const p = c.clone().add(new THREE.Vector3(range(-1, 1), range(-0.8, 1.4), range(-1, 1)).multiplyScalar(size * 4.2));
      out.pos.push(p.x, p.y, p.z);
      const b = range(0.15, 0.35);
      out.col.push(col.tip[0] * b, col.tip[1] * b, col.tip[2] * b);
      out.size.push(range(0.5, 1.1));
      out.phase.push(rand() * 100 + 1000);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(out.size, 1));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(out.phase, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uScale;
      uniform float uOpacity;
      varying vec3 vColor;
      void main() {
        vec3 p = position;
        float pollen = step(1000.0, aPhase);
        float ph = mod(aPhase, 1000.0);
        float sway = mix(0.012, 0.09, pollen);
        p.x += sin(uTime * 0.6 + p.y * 1.7 + ph) * sway;
        p.z += cos(uTime * 0.5 + p.y * 1.3 + ph * 1.3) * sway;
        p.y += pollen * mod(uTime * 0.04 + ph * 0.01, 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uScale / max(0.3, -mv.z);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.7 + 0.3 * sin(uTime * (0.8 + fract(ph) * 2.5) + ph * 9.0);
        vColor = aColor * twinkle * uOpacity * smoothstep(0.35, 1.4, -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor * a * a * 1.6, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function createEmbers({ count = 900, top = 6.5, bottom = -11 } = {}) {
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const r = 0.3 + Math.sqrt(rand()) * 3.4;
    const a = rand() * Math.PI * 2;
    pos.set([Math.cos(a) * r, bottom + rand() * (top - bottom), Math.sin(a) * r], i * 3);
    sd.set([rand() * 100, 0.5 + rand(), 0.6 + rand() ** 3 * 2.6, rand() < 0.35 ? 1 : 0], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uTop: { value: top }, uBottom: { value: bottom }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uScale;
      uniform float uTop;
      uniform float uBottom;
      uniform float uOpacity;
      varying float vAlpha;
      varying float vEmber;
      void main() {
        vec3 p = position;
        float span = uTop - uBottom;
        float rise = aSeed.w > 0.5 ? 0.16 : 0.03;
        p.y = uBottom + mod(p.y - uBottom + uTime * rise * aSeed.y, span);
        p.x += sin(uTime * 0.37 * aSeed.y + aSeed.x) * 0.25;
        p.z += cos(uTime * 0.29 * aSeed.y + aSeed.x * 1.3) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSeed.z * (aSeed.w > 0.5 ? 1.25 : 0.9) * uScale / max(0.25, -mv.z);
        gl_Position = projectionMatrix * mv;
        float flicker = 0.6 + 0.4 * sin(uTime * (1.5 + aSeed.y * 3.0) + aSeed.x * 7.0);
        vAlpha = flicker * smoothstep(0.4, 1.8, -mv.z) * uOpacity;
        vEmber = aSeed.w;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vEmber;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        vec3 dust = vec3(1.0, 0.8, 0.6) * 0.16;
        vec3 ember = vec3(1.0, 0.32, 0.08) * 0.85;
        gl_FragColor = vec4(mix(dust, ember, vEmber) * a * a * vAlpha, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------- the glass card ----------
const cardVertex = /* glsl */ `
  varying vec3 vPosL;
  varying vec3 vNrmL;
  varying vec3 vPosV;
  varying vec3 vNrmV;
  void main() {
    vPosL = position;
    vNrmL = normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPosV = mv.xyz;
    vNrmV = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

const cardFragment = /* glsl */ `
  uniform sampler2D tBehind;
  uniform vec2 uRes;
  uniform sampler2D tMap;
  uniform sampler2D tVideo;
  uniform float uVideoMix;
  uniform float uMapAspect;
  uniform vec3 uSize;
  uniform vec3 uCamLocal;
  uniform float uFocus;
  uniform float uHover;
  uniform vec2 uHoverUV;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uTint;
  uniform float uDim;
  uniform float uLoaded;
  varying vec3 vPosL;
  varying vec3 vNrmL;
  varying vec3 vPosV;
  varying vec3 vNrmV;
  ${NOISE_GLSL}
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  // centre of the voronoi cell around p: an organic mosaic for the frost
  vec2 cellCentre(vec2 p, float t) {
    vec2 n = floor(p), f = fract(p);
    float md = 8.0;
    vec2 mc = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = 0.5 + 0.45 * sin(t + 6.2831 * hash2(n + g));
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < md) { md = d; mc = n + g + o; }
      }
    }
    return mc;
  }
  // soft studio panels reflected in the glass
  vec3 studio(vec3 r) {
    float top = smoothstep(0.3, 0.85, r.y) * smoothstep(-1.0, 0.3, r.x);
    float right = smoothstep(0.55, 0.92, r.x) * smoothstep(-0.55, 0.25, r.y) * smoothstep(0.95, 0.3, r.y);
    float left = smoothstep(0.72, 0.98, -r.x) * smoothstep(-0.3, 0.5, r.y);
    return vec3(1.0, 0.93, 0.84) * top * 0.85 + vec3(1.0, 0.4, 0.18) * right * 0.85 + vec3(0.45, 0.55, 0.85) * left * 0.35;
  }
  void main() {
    vec3 Nl = normalize(vNrmL);
    vec3 Nv = normalize(vNrmV);
    vec3 Vv = normalize(-vPosV);
    float ndv = clamp(dot(Nv, Vv), 0.0, 1.0);
    float cap = smoothstep(0.9, 0.995, abs(Nl.z));
    float rim = 1.0 - cap;
    float side = Nl.z >= 0.0 ? 1.0 : -1.0;
    vec2 suv = gl_FragCoord.xy / uRes;

    // 1. the world behind, bent by the glass with colour fringes
    vec3 rd = refract(-Vv, Nv, 0.66);
    vec2 bend = (rd.xy + Vv.xy) * (0.035 + 0.3 * rim);
    float lod = mix(3.4, 1.2, uHover) + rim * 1.4;
    vec3 behind;
    behind.r = textureLod(tBehind, suv + bend * 1.07, lod).r;
    behind.g = textureLod(tBehind, suv + bend, lod).g;
    behind.b = textureLod(tBehind, suv + bend * 0.93, lod).b;
    vec3 glass = behind * vec3(0.8, 0.86, 0.84);

    // 2. the painting sits recessed inside the slab (parallax with the view angle)
    vec3 vl = normalize(uCamLocal - vPosL);
    vl.z *= side;
    float depth = uSize.z * 0.85;
    vec2 cp = vPosL.xy - vl.xy / max(vl.z, 0.2) * depth;
    cp.x *= side;
    vec2 halfSize = uSize.xy * 0.5 - 0.052;
    float radius = 0.05;
    vec2 q = abs(cp) - (halfSize - radius);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    float inside = 1.0 - smoothstep(-0.003, 0.003, sd);
    vec2 uv = cp / (halfSize * 2.0) + 0.5;
    float panelAspect = halfSize.x / halfSize.y;
    vec2 muv = uv;
    if (uMapAspect > panelAspect) muv.x = (uv.x - 0.5) * panelAspect / uMapAspect + 0.5;
    else muv.y = (uv.y - 0.5) * uMapAspect / panelAspect + 0.5;

    // hover: the frost melts outward from where the cursor entered
    float n0 = fbm(uv * 3.5 + uSeed * 7.0 + uTime * 0.06);
    float dist = length((uv - uHoverUV) * vec2(panelAspect, 1.0));
    float reach = uHover * 2.2;
    float clear = (1.0 - smoothstep(reach - 0.45, reach, dist + (n0 - 0.5) * 0.5)) * smoothstep(0.0, 0.06, uHover);
    float frost = 1.0 - clear;

    vec2 w = vec2(fbm(muv * 2.3 + uSeed + uTime * 0.02), fbm(muv * 2.3 + uSeed + 5.2 - uTime * 0.02)) - 0.5;
    vec2 cellScale = vec2(34.0, 19.0);
    vec2 cc = cellCentre(muv * cellScale + w * 4.0, uTime * 0.25 + uSeed * 10.0) / cellScale;
    vec2 warped = muv + w * 0.07;
    vec2 puv = mix(muv, mix(warped, cc, 0.55), frost);
    float bias = frost * 1.6;
    vec3 img = texture2D(tMap, puv, bias).rgb;
    vec3 smear = texture2D(tMap, mix(muv, warped + w * 0.05, frost), bias + 1.0).rgb;
    if (uVideoMix > 0.001) {
      img = mix(img, texture2D(tVideo, puv, bias).rgb, uVideoMix);
      smear = mix(smear, texture2D(tVideo, mix(muv, warped + w * 0.05, frost), bias + 1.0).rgb, uVideoMix);
    }
    img = mix(img, smear, frost * 0.35);
    float luma = dot(img, vec3(0.2126, 0.7152, 0.0722));
    vec3 frosted = mix(vec3(luma), img, 0.82) * 0.78 + uTint * luma * 0.12 + 0.012;
    vec3 picture = mix(img * 1.06, frosted, frost);
    picture *= mix(0.55, 1.0, uFocus) * mix(0.7, 1.0, cap) * (side > 0.0 ? 1.0 : 0.62);

    float alpha = inside * mix(0.84, 0.97, clear) * uLoaded;
    vec3 col = mix(glass, picture, alpha);
    col *= 1.0 - 0.5 * smoothstep(0.022, 0.0, abs(sd)) * cap;

    // 3. surface: fresnel reflections, iridescent rim and a sheen sweeping across
    vec3 R = reflect(-Vv, Nv);
    float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    col += studio(R) * (F + 0.022) * (0.7 + 0.5 * rim);
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ndv * 1.4 + uSeed));
    col += rim * (irid * 0.09 + vec3(0.95, 0.97, 1.0) * pow(1.0 - ndv, 2.2) * 0.17);
    float sweep = smoothstep(0.9, 1.0, sin(vPosL.x * 1.4 + vPosL.y * 0.8 + R.x * 5.0) * 0.5 + 0.5);
    col += cap * sweep * 0.035 * (0.4 + uFocus);

    gl_FragColor = vec4(col * uDim, 1.0);
  }
`;

const titleFragment = /* glsl */ `
  uniform sampler2D tTitle;
  uniform float uFocus;
  uniform float uGlitch;
  uniform float uTime;
  uniform float uSeed;
  uniform float uDim;
  varying vec2 vUv;
  ${NOISE_GLSL}
  float ink(vec2 uv) { return texture2D(tTitle, uv).a; }
  void main() {
    float off = 1.0 - uFocus;
    float g = clamp(off * 1.25 + uGlitch, 0.0, 1.5);
    float tq = floor(uTime * 16.0);
    float band = floor(vUv.y * 22.0);
    float rj = hash(vec2(band, tq + uSeed * 31.0));
    float shift = (rj - 0.5) * 0.05 * g * step(0.5, rj);
    vec2 uv = vUv + vec2(shift, 0.0);
    // ghost copies that slide back into place as the card reaches the front
    float spread = off * 0.03 + uGlitch * 0.012;
    float a = ink(uv);
    float ghost = max(ink(uv - vec2(spread, 0.0)), ink(uv + vec2(spread * 0.55, 0.0)) * 0.7);
    float ca = 0.0025 + g * 0.009;
    vec3 col = vec3(ink(uv + vec2(ca, 0.0)), a, ink(uv - vec2(ca, 0.0)));
    col = max(col, vec3(ghost * min(1.0, off * 1.6 + uGlitch)));
    col *= 0.9 + 0.1 * sin(vUv.y * 420.0 + uTime * 6.0);
    gl_FragColor = vec4(col * vec3(1.0, 0.97, 0.93) * 0.8 * uDim, 1.0);
  }
`;

const TW = 1024;
const TH = 640;

function categoryIcon(g, cat, x, y, r) {
  g.save();
  g.translate(x, y);
  g.lineWidth = r * 0.12;
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  if (cat === 'bounties') {
    g.moveTo(0, -r * 0.62); g.lineTo(r * 0.62, 0); g.lineTo(0, r * 0.62); g.lineTo(-r * 0.62, 0); g.closePath(); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.14, 0, Math.PI * 2); g.fill();
  } else if (cat === 'duels') {
    g.moveTo(-r * 0.55, -r * 0.55); g.lineTo(r * 0.55, r * 0.55);
    g.moveTo(r * 0.55, -r * 0.55); g.lineTo(-r * 0.55, r * 0.55);
    g.moveTo(-r * 0.62, r * 0.25); g.lineTo(-r * 0.25, r * 0.62);
    g.moveTo(r * 0.62, r * 0.25); g.lineTo(r * 0.25, r * 0.62);
    g.stroke();
  } else if (cat === 'exorcisms') {
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
    }
    g.stroke();
  } else if (cat === 'escorts') {
    g.ellipse(0, 0, r * 0.36, r * 0.5, 0, 0, Math.PI * 2);
    g.moveTo(-r * 0.36, -r * 0.16); g.lineTo(r * 0.36, -r * 0.16);
    g.moveTo(-r * 0.36, r * 0.16); g.lineTo(r * 0.36, r * 0.16);
    g.moveTo(0, -r * 0.5); g.lineTo(0, -r * 0.72);
    g.stroke();
  } else {
    g.rect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.84); g.stroke();
    g.beginPath(); g.arc(0, -r * 0.08, r * 0.13, 0, Math.PI * 2); g.fill();
    g.fillRect(-r * 0.05, -r * 0.05, r * 0.1, r * 0.3);
  }
  g.restore();
}

function setFont(g, weight, size, stretch, spacing) {
  g.font = `${weight} ${size}px Archivo, 'Helvetica Neue', Arial, sans-serif`;
  if ('fontStretch' in g) g.fontStretch = stretch;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing * size}px`;
}

function titleTexture(svc, index, total) {
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const lines = svc.lines.map((l) => l.toUpperCase());
  const size = lines.some((l) => l.length > 10) ? 92 : 104;
  const block = lines.length * size * 0.98;
  const top = TH / 2 - block / 2 + 20;

  setFont(g, 600, 21, 'expanded', 0.22);
  g.globalAlpha = 0.82;
  g.fillText(`[ ${svc.client.toUpperCase()} ]`, TW / 2, top - 44);
  categoryIcon(g, svc.category, TW / 2, top - 98, 17);
  g.globalAlpha = 1;
  setFont(g, 300, size, 'expanded', 0.035);
  lines.forEach((l, i) => g.fillText(l, TW / 2, top + size * 0.8 + i * size * 0.98));

  setFont(g, 700, 15, 'expanded', 0.16);
  g.globalAlpha = 0.55;
  g.textAlign = 'left';
  g.fillText(`N°${String(index + 1).padStart(2, '0')} / ${total}`, 58, 64);
  g.textAlign = 'right';
  g.fillText((svc.coop ? 'CO-OP · ' : '') + categoryLabel(svc.category).toUpperCase(), 966, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const x = 58 + i * 15;
    if (i < svc.danger) g.fillRect(x, 576, 9, 16);
    else g.strokeRect(x + 0.75, 576.75, 7.5, 14.5);
  }
  g.fillText(svc.reward.toUpperCase(), 966, 590);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

const PLACEHOLDER = new THREE.DataTexture(new Uint8Array([10, 9, 8, 255]), 1, 1);
PLACEHOLDER.needsUpdate = true;

class Card {
  constructor(svc, index, total, shared) {
    this.service = svc;
    this.index = index;
    this.group = new THREE.Group();
    this.hover = 0;
    this.hoverTarget = 0;
    this.focus = 0;
    this.glitch = 0;
    this.video = null;
    this.videoMix = 0;
    const s = (index * 0.618) % 1;
    this.glass = new THREE.Mesh(shared.slab, new THREE.ShaderMaterial({
      vertexShader: cardVertex,
      fragmentShader: cardFragment,
      uniforms: {
        tBehind: shared.behind,
        uRes: shared.res,
        uTime: shared.time,
        tMap: { value: PLACEHOLDER },
        tVideo: { value: PLACEHOLDER },
        uVideoMix: { value: 0 },
        uMapAspect: { value: 16 / 9 },
        uSize: { value: new THREE.Vector3(CARD.W, CARD.H, CARD.T) },
        uCamLocal: { value: new THREE.Vector3() },
        uFocus: { value: 0 },
        uHover: { value: 0 },
        uHoverUV: { value: new THREE.Vector2(0.5, 0.5) },
        uSeed: { value: s },
        uTint: { value: new THREE.Vector3(...svc.tint) },
        uDim: { value: 1 },
        uLoaded: { value: 0 },
      },
    }));
    this.group.add(this.glass);
    this.title = new THREE.Mesh(shared.titlePlane, new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: titleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        tTitle: { value: titleTexture(svc, index, total) },
        uTime: shared.time,
        uFocus: { value: 0 },
        uGlitch: { value: 0 },
        uSeed: { value: s },
        uDim: { value: 1 },
      },
    }));
    this.title.position.z = CARD.T / 2 + 0.004;
    this.title.renderOrder = 2;
    this.group.add(this.title);
    this.u = this.glass.material.uniforms;
    this.tu = this.title.material.uniforms;
  }

  setMap(tex) {
    this.u.tMap.value = tex;
    const img = tex.image;
    if (img?.width) this.u.uMapAspect.value = img.width / img.height;
    this.loaded = true;
  }
}

// render world -> copy into the refraction texture -> cards -> particles
class SpiralPass extends Pass {
  constructor({ world, cards, fx, camera, behind }) {
    super();
    Object.assign(this, { world, cards, fx, camera, behind });
    this.needsSwap = false;
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }',
      depthTest: false,
      depthWrite: false,
    }));
  }

  render(renderer, writeBuffer, readBuffer) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    renderer.clear(true, true, false);
    renderer.render(this.world, this.camera);
    this.copy.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.behind);
    this.copy.render(renderer);
    renderer.setRenderTarget(readBuffer);
    renderer.render(this.cards, this.camera);
    renderer.render(this.fx, this.camera);
    renderer.autoClear = auto;
  }
}

export class ServicesScene {
  constructor(canvas, services, { mobile = false } = {}) {
    this.canvas = canvas;
    this.services = services;
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 80);
    this.world = new THREE.Scene();
    this.cardScene = new THREE.Scene();
    this.fx = new THREE.Scene();
    this.state = {
      progress: 0, target: FOCUS_RANGE[0], focus: FOCUS_RANGE[0],
      pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2(), pointerInside: false, reveal: 0,
    };
    this.time = 0;
    this.active = false;
    this.pixelRatioCap = mobile ? 1.25 : 1.5;
    this.hovered = -1;
    this.focusIndex = -1;
    this.heldHover = -1;
    this.listeners = { focus: [], hover: [], select: [] };
    this._ray = new THREE.Raycaster();
    this._inv = new THREE.Matrix4();
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this._uv = new THREE.Vector2();
    this._frameTimes = [];
    this.#build();
    this.resize();
    canvas.addEventListener('click', () => { if (this.hovered >= 0) this.#emit('select', this.hovered); });
  }

  on(type, fn) { this.listeners[type].push(fn); }
  #emit(type, v) { for (const fn of this.listeners[type]) fn(v); }

  #build() {
    const { renderer, world } = this;
    // a tiny dark studio for reflections in the steel and glass
    const studio = new THREE.Scene();
    studio.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: 0x050404, side: THREE.BackSide })));
    const panel = (color, w, h, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(0, 0, 0);
      studio.add(m);
    };
    panel(new THREE.Color(2.4, 2.2, 2), 6, 1.4, [-1.5, 6, 3]);
    panel(new THREE.Color(3.2, 0.7, 0.3), 0.7, 9, [6, 0, -1.5]);
    panel(new THREE.Color(0.5, 0.65, 1.1), 0.5, 7, [-6, -0.5, 1.5]);
    panel(new THREE.Color(1.6, 0.9, 0.45), 8, 0.6, [0, -6, 2]);
    panel(new THREE.Color(0.12, 0.11, 0.1), 5, 12, [1.2, 0, 7.5]);
    const pmrem = new THREE.PMREMGenerator(renderer);
    world.environment = pmrem.fromScene(studio, 0.02).texture;
    world.environmentIntensity = 0.9;
    pmrem.dispose();

    world.add(new THREE.HemisphereLight(0x3a2c24, 0x070605, 0.5));
    const key = new THREE.DirectionalLight(0xffe6cc, 1.6);
    key.position.set(-3, 5, 4);
    const rim = new THREE.DirectionalLight(0xff4a22, 2.4);
    rim.position.set(4, 1, -3);
    world.add(key, rim);

    this.backdrop = createBackdrop();
    world.add(this.backdrop);
    this.headline = textPlane('BLOOD CONTRACTS', { width: 7.6, color: '#5c524a' });
    this.headline.position.set(0, BLADE.top - 0.35, -2.6);
    world.add(this.headline);
    this.katana = createKatana();
    world.add(this.katana.group);

    this.lilies = createLilies();
    this.embers = createEmbers();
    this.fx.add(this.lilies, this.embers);

    this.behind = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    const slab = new RoundedBoxGeometry(CARD.W, CARD.H, CARD.T, 6, CARD.T / 2);
    this.shared = {
      slab,
      titlePlane: new THREE.PlaneGeometry(CARD.W, CARD.H),
      behind: { value: this.behind.texture },
      res: { value: new THREE.Vector2(1, 1) },
      time: { value: 0 },
    };
    this.cards = this.services.map((s, i) => new Card(s, i, this.services.length, this.shared));
    for (const c of this.cards) this.cardScene.add(c.group);

    const pass = new SpiralPass({ world, cards: this.cardScene, fx: this.fx, camera: this.camera, behind: this.behind });
    this.post = createComposer(renderer, world, this.camera, { renderPass: pass, bloom: [0.5, 0.55, 0.86] });
    this.post.lens.uniforms.uVignette.value = 0.32;
  }

  async loadMedia() {
    if (this.mediaPromise) return this.mediaPromise;
    const loader = new THREE.TextureLoader();
    const dir = this.mobile ? 'media/services/sm/' : 'media/services/';
    const order = this.cards.map((c) => c.index).sort((a, b) => Math.abs(a - this.state.focus) - Math.abs(b - this.state.focus));
    this.mediaPromise = (async () => {
      for (const i of order) {
        try {
          const tex = await loader.loadAsync(`${dir}${mediaName(i)}.webp`);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          this.renderer.initTexture(tex);
          this.cards[i].setMap(tex);
        } catch (err) {
          console.warn('card art failed to load', i, err);
        }
      }
    })();
    return this.mediaPromise;
  }

  #ensureVideo(card) {
    if (card.video || !card.service.video) return;
    const v = document.createElement('video');
    v.src = `media/services/${mediaName(card.index)}.mp4`;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    card.video = v;
    card.u.tVideo.value = tex;
  }

  setProgress(p) {
    this.state.progress = clamp(p, 0, 1);
    this.state.target = focusFromProgress(this.state.progress);
  }
  setPointer(x, y, inside) { this.state.pointer.set(x, y); this.state.pointerInside = inside; }
  setActive(v) {
    if (v === this.active) return;
    this.active = v;
    if (v) { this.lastTick = performance.now(); this._lastFrame = undefined; this._frameTimes.length = 0; }
    else for (const c of this.cards) c.video?.pause();
  }
  holdHover(i) { this.heldHover = i; }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
    const W = Math.floor(w * pr);
    const H = Math.floor(h * pr);
    this.behind.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    this.shared.res.value.set(W, H);
    this.backdrop.material.uniforms.uRes.value.set(W, H);
    const scale = H * 0.0105;
    this.lilies.material.uniforms.uScale.value = scale;
    this.embers.material.uniforms.uScale.value = scale;
  }

  start() {
    this.lastTick = performance.now();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  tick() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 1 / 20);
    this.lastTick = now;
    if (!this.active || !this.width) return;
    this.time += dt;
    const s = this.state;
    s.focus += (s.target - s.focus) * (1 - Math.exp(-dt * 6));
    s.pointerSmooth.lerp(s.pointer, 1 - Math.exp(-dt * 3));
    s.reveal = Math.min(1, s.reveal + dt * 0.8);
    this.shared.time.value = this.time;
    this.#camera();
    this.#layout(dt);
    this.#hover();
    this.#focus();
    this.katana.update(this.time);
    const bu = this.backdrop.material.uniforms;
    bu.uTime.value = this.time;
    bu.uScroll.value = s.focus * SPIRAL.drop;
    this.lilies.material.uniforms.uTime.value = this.time;
    this.embers.material.uniforms.uTime.value = this.time;
    this.post.render(this.time);
    this.#adaptQuality();
  }

  #camera() {
    const { camera, state: s } = this;
    const f = s.focus;
    const aspect = this.width / this.height;
    const portrait = clamp((1.2 - aspect) / 0.7, 0, 1);
    const fov = lerp(34, 46, portrait);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // distance so the front card fills a fixed share of the view width
    const share = lerp(0.47, 0.84, portrait);
    const fit = CARD.W / share / (2 * Math.tan(degToRad(fov / 2)) * aspect);
    const dist = Math.max(3.6, fit + SPIRAL.radius * 0.98);
    const intro = sstep(-0.3, -2.4, f) ** 1.3;
    const outro = sstep(13.1, FOCUS_RANGE[1], f);
    const y = -f * SPIRAL.drop;
    const t = this.time;
    const x = Math.sin(SPIRAL.front) * SPIRAL.radius * portrait;
    camera.position.set(
      x + s.pointerSmooth.x * 0.12 + Math.sin(t * 0.21) * 0.03,
      y + 0.2 + intro * 2.5 + s.pointerSmooth.y * 0.05 + Math.sin(t * 0.33) * 0.02,
      dist + intro * 1.3 + outro * 0.2
    );
    camera.lookAt(x, y - 0.14 + intro * 1.25 - outro * 0.4 - portrait * 0.32, 0);
  }

  #layout(dt) {
    const f = this.state.focus;
    const cam = this.camera;
    for (const c of this.cards) {
      const rel = c.index - f;
      const a = SPIRAL.front + rel * SPIRAL.step;
      const g = c.group;
      const visible = Math.abs(rel) < 5.2;
      g.visible = visible;
      if (!visible) { c.video?.pause(); continue; }
      g.position.set(Math.sin(a) * SPIRAL.radius, -c.index * SPIRAL.drop, Math.cos(a) * SPIRAL.radius);
      g.rotation.set(0, a, 0);
      g.updateMatrixWorld();
      const dist = Math.abs(rel);
      const facing = Math.cos(a);
      c.focus = 1 - sstep(0, 1, dist);
      const dim = lerp(0.5, 1, sstep(-0.4, 0.75, facing)) * sstep(4.8, 2.8, dist) * this.state.reveal;
      c.u.uFocus.value = c.focus;
      c.u.uDim.value = dim;
      c.tu.uFocus.value = c.focus;
      c.tu.uDim.value = dim * lerp(0.5, 1, c.focus) * sstep(-0.1, 0.4, facing);
      g.worldToLocal(c.u.uCamLocal.value.copy(cam.position));
      c.u.uLoaded.value += ((c.loaded ? 1 : 0) - c.u.uLoaded.value) * (1 - Math.exp(-dt * 3));
      const rate = c.hoverTarget > c.hover ? 2.4 : 1.4;
      c.hover += (c.hoverTarget - c.hover) * (1 - Math.exp(-dt * rate));
      c.u.uHover.value = c.hover;
      c.glitch = Math.max(0, c.glitch - dt * 2.2);
      if (c.hoverTarget > 0 && Math.random() < dt * 0.5) c.glitch = Math.max(c.glitch, 0.35);
      c.tu.uGlitch.value = c.glitch * c.glitch;
      if (c.service.video) {
        if ((dist < 0.6 || c.hoverTarget > 0) && this.active) {
          this.#ensureVideo(c);
          if (c.video.paused) c.video.play().catch(() => {});
        } else if (c.video && !c.video.paused) c.video.pause();
        const playing = c.video && !c.video.paused && c.video.readyState >= 2 ? 1 : 0;
        c.videoMix += (playing - c.videoMix) * (1 - Math.exp(-dt * 4));
        c.u.uVideoMix.value = c.videoMix;
      }
    }
  }

  // ray vs. the front face of the nearby cards
  pick(x, y) {
    this._ray.setFromCamera(this._ndc.set(x, y), this.camera);
    const { origin, direction } = this._ray.ray;
    let best = null;
    let bestD = Infinity;
    for (const c of this.cards) {
      if (!c.group.visible || Math.abs(c.index - this.state.focus) > 2.2) continue;
      this._inv.copy(c.group.matrixWorld).invert();
      const o = this._o.copy(origin).applyMatrix4(this._inv);
      const d = this._d.copy(direction).transformDirection(this._inv);
      if (d.z >= -1e-4) continue;
      const t = (CARD.T / 2 - o.z) / d.z;
      if (t <= 0) continue;
      const px = o.x + d.x * t;
      const py = o.y + d.y * t;
      if (Math.abs(px) > CARD.W / 2 || Math.abs(py) > CARD.H / 2) continue;
      const dd = this._v.set(px, py, CARD.T / 2).applyMatrix4(c.group.matrixWorld).distanceTo(origin);
      if (dd < bestD) { bestD = dd; best = { index: c.index, uv: [px / CARD.W + 0.5, py / CARD.H + 0.5] }; }
    }
    return best;
  }

  #hover() {
    const s = this.state;
    let hit = s.pointerInside ? this.pick(s.pointer.x, s.pointer.y) : null;
    if (!hit && this.heldHover >= 0 && Math.abs(this.heldHover - s.focus) < 0.6) hit = { index: this.heldHover, uv: [0.5, 0.5] };
    const idx = hit ? hit.index : -1;
    for (const c of this.cards) {
      const on = c.index === idx;
      if (on && c.hoverTarget === 0) { c.u.uHoverUV.value.set(...hit.uv); c.glitch = 0.9; }
      if (on) c.u.uHoverUV.value.lerp(this._uv.set(...hit.uv), 0.04);
      c.hoverTarget = on ? 1 : 0;
    }
    if (idx !== this.hovered) {
      this.hovered = idx;
      this.canvas.style.cursor = idx >= 0 && s.pointerInside ? 'pointer' : '';
      this.#emit('hover', idx);
    }
  }

  #focus() {
    const f = this.state.focus;
    const i = clamp(Math.round(f), 0, this.cards.length - 1);
    const idx = f > -0.6 && f < this.cards.length - 0.4 ? i : -1;
    if (idx !== this.focusIndex) {
      if (idx >= 0) this.cards[idx].glitch = 1;
      this.focusIndex = idx;
      this.#emit('focus', idx);
    }
  }

  #adaptQuality() {
    const now = performance.now();
    const dt = (now - (this._lastFrame ?? now)) / 1000;
    this._lastFrame = now;
    if (this.time < 4) return;
    const f = this._frameTimes;
    f.push(dt);
    if (f.length < 90) return;
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    f.length = 0;
    if (avg > 1 / 45 && this.pixelRatioCap > 0.5) {
      this.pixelRatioCap = avg > 1 / 15 ? 0.5 : Math.max(0.5, this.pixelRatioCap - 0.25);
      this.resize();
    }
  }
}

export { SERVICES };
