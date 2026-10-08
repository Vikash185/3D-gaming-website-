// Hero: the oni walks in place on a lacquered floor while the camera orbits with scroll.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { OniWalk } from './walk.js';
import { createComposer, NOISE_GLSL } from './post.js';

const { clamp, lerp, degToRad, smoothstep } = THREE.MathUtils;

// ---------- camera path (scroll progress -> orbit) ----------
// theta in degrees around the oni, radius, camera height, look-at height, horizontal frame shift
const SHOTS = [
  { p: 0.0, theta: -12, radius: 1.62, y: 1.5, ty: 1.6, shift: 0 },
  { p: 0.1, theta: -50, radius: 1.85, y: 1.4, ty: 1.56, shift: 0 },
  { p: 0.19, theta: -96, radius: 2.05, y: 1.26, ty: 1.52, shift: 0 },
  { p: 0.28, theta: -158, radius: 2.0, y: 1.32, ty: 1.47, shift: 0 },
  { p: 0.36, theta: -204, radius: 2.1, y: 1.28, ty: 1.42, shift: 0 },
  { p: 0.46, theta: -262, radius: 2.65, y: 1.02, ty: 1.3, shift: -0.2 },
  { p: 0.56, theta: -302, radius: 3.25, y: 0.8, ty: 1.14, shift: -0.18 },
  { p: 0.66, theta: -338, radius: 4.1, y: 0.6, ty: 1.0, shift: 0.02 },
  { p: 0.76, theta: -358, radius: 4.45, y: 0.56, ty: 0.98, shift: 0.24 },
  { p: 0.88, theta: -368, radius: 4.8, y: 0.66, ty: 0.97, shift: 0.24 },
  { p: 1.0, theta: -374, radius: 5.05, y: 0.74, ty: 0.95, shift: 0.24 },
];
const SHOT_KEYS = ['theta', 'radius', 'y', 'ty', 'shift'];

// monotone cubic (Fritsch–Carlson) tangents so the orbit never overshoots
function tangents(key) {
  const n = SHOTS.length;
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((SHOTS[i + 1][key] - SHOTS[i][key]) / (SHOTS[i + 1].p - SHOTS[i].p));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}
const TANGENTS = Object.fromEntries(SHOT_KEYS.map((k) => [k, tangents(k)]));

function sampleShot(p, out = {}) {
  p = clamp(p, 0, 1);
  let i = 0;
  while (i < SHOTS.length - 2 && p > SHOTS[i + 1].p) i++;
  const a = SHOTS[i];
  const b = SHOTS[i + 1];
  const h = b.p - a.p;
  const t = (p - a.p) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  for (const k of SHOT_KEYS) {
    const m = TANGENTS[k];
    out[k] = h00 * a[k] + h10 * h * m[i] + h01 * b[k] + h11 * h * m[i + 1];
  }
  return out;
}

// ---------- moods: calm (0) and enraged (1) ----------
const MOODS = [
  {
    key: [0xffc07a, 3.6], rim: [0xff8a3d, 4.6], rim2: [0xffb070, 1.8], fill: [0x6a7fa8, 0.95],
    hemi: 0.3, env: 0.16, glow: new THREE.Color(0.5, 0.42, 0.32), dust: new THREE.Color(1, 0.78, 0.5), ember: 0,
    aura: { inner: new THREE.Color(0.9, 0.24, 0.06), outer: new THREE.Color(0.22, 0.012, 0.008), intensity: 0.42, flame: 0.9, haze: 0.0012 },
  },
  {
    key: [0xffa080, 2.6], rim: [0xff2a10, 5.2], rim2: [0xff5c3a, 2.0], fill: [0x5a4a68, 0.85],
    hemi: 0.32, env: 0.12, glow: new THREE.Color(0.8, 0.1, 0.04), dust: new THREE.Color(1, 0.45, 0.3), ember: 1,
    aura: { inner: new THREE.Color(1, 0.13, 0.04), outer: new THREE.Color(0.4, 0, 0.06), intensity: 1, flame: 1.45, haze: 0.0028 },
  },
];
const LIGHT_KEYS = ['key', 'rim', 'rim2', 'fill'];
for (const m of MOODS) for (const k of LIGHT_KEYS) m[k][0] = new THREE.Color(m[k][0]);

// ---------- scene pieces ----------
function createBackdrop() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uGlowPos: { value: new THREE.Vector2(0.5, 0.55) },
      uGlowColor: { value: MOODS[0].glow.clone() },
      uBase: { value: new THREE.Color(0.0235, 0.0226, 0.0214) },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec2 uRes;
      uniform vec2 uGlowPos;
      uniform vec3 uGlowColor;
      uniform vec3 uBase;
      uniform float uTime;
      uniform float uIntensity;
      ${NOISE_GLSL}
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        float aspect = uRes.x / uRes.y;
        vec2 d = (uv - uGlowPos) * vec2(aspect, 1.0);
        float glow = exp(-dot(d, d) * 3.2) * 0.022 + exp(-dot(d, d) * 0.9) * 0.008;
        // faint dusty light shaft falling from the upper left
        vec2 q = (uv - vec2(0.16, 1.06)) * vec2(aspect, 1.0);
        float along = dot(q, normalize(vec2(0.5, -1.0)));
        float across = dot(q, normalize(vec2(1.0, 0.5)));
        float shaft = exp(-across * across * 22.0) * smoothstep(1.4, 0.0, along) * smoothstep(-0.1, 0.25, along);
        shaft *= 0.5 + 0.5 * noise(vec2(across * 6.0, along * 2.0 - uTime * 0.05));
        float vig = smoothstep(1.25, 0.15, length((uv - 0.5) * vec2(aspect * 0.75, 1.0)));
        vec3 col = uBase * (0.78 + 0.34 * vig);
        col += uGlowColor * (glow + shaft * 0.012) * uIntensity;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

const GlossyFloorShader = {
  name: 'GlossyFloor',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uOpacity: { value: 1 },
    uGlow: { value: new THREE.Color(0.55, 0.33, 0.14) },
    uReflect: { value: 1.35 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uOpacity;
    uniform vec3 uGlow;
    uniform float uReflect;
    varying vec4 vUv;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv.xy / vUv.w;
      float r = length(vWorld.xz);
      // blur grows away from the feet, like rough lacquer
      float blur = 0.0025 + 0.01 * smoothstep(0.0, 2.5, r);
      vec3 refl = texture2D(tDiffuse, uv).rgb * 0.2;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        float k = mod(float(i), 2.0) < 0.5 ? 1.0 : 1.8;
        refl += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * blur * k).rgb * 0.1;
      }
      float pool = exp(-r * r * 0.45);
      float grain = hash(floor(vWorld.xz * 400.0)) * 0.04;
      vec3 col = color * (0.85 + grain) + uGlow * pool * 0.05;
      col += refl * uReflect * (0.35 + 0.65 * pool);
      float fade = 1.0 - smoothstep(1.2, 6.5, r);
      gl_FragColor = vec4(col, fade * uOpacity);
    }
  `,
};

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createFloor(resolution = 1024) {
  const group = new THREE.Group();
  const reflector = new Reflector(new THREE.CircleGeometry(8, 72), {
    textureWidth: resolution,
    textureHeight: resolution,
    clipBias: 0.002,
    color: new THREE.Color(0.021, 0.0202, 0.0192),
    multisample: 0,
    shader: GlossyFloorShader,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.material.transparent = true;
  reflector.material.depthWrite = false;
  reflector.renderOrder = -10;
  group.add(reflector);

  const blob = blobTexture();
  const shadowMat = (o) => new THREE.MeshBasicMaterial({ map: blob, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.25), shadowMat(0.75));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.002;
  contact.renderOrder = -9;
  group.add(contact);
  const feet = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), shadowMat(0.8));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.003;
    m.renderOrder = -8;
    group.add(m);
    return m;
  });

  const v = new THREE.Vector3();
  let opacity = 1;
  return {
    group,
    reflector,
    updateFeet(bones) {
      bones.forEach((b, i) => {
        b.getWorldPosition(v);
        const lift = clamp((v.y - 0.12) / 0.2, 0, 1);
        feet[i].position.x = v.x;
        feet[i].position.z = v.z + 0.06;
        feet[i].material.opacity = 0.8 * (1 - lift * 0.75) * opacity;
        feet[i].scale.setScalar(1 + lift * 0.5);
      });
    },
    setOpacity(o) {
      opacity = o;
      reflector.material.uniforms.uOpacity.value = o;
      contact.material.opacity = 0.75 * o;
      reflector.visible = o > 0.01;
    },
  };
}

function createDust({ count = 280, radius = 4.2, height = 3.4 } = {}) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const r = 0.35 + Math.sqrt(Math.random()) * radius;
    const a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, Math.random() * height, Math.sin(a) * r], i * 3);
    seed.set([Math.random() * 100, 0.4 + Math.random() * 0.8, 0.5 + Math.random() ** 3 * 2.4, Math.random() < 0.24 ? 1 : 0], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: height },
      uScale: { value: 1 },
      uDust: { value: new THREE.Color(1, 0.78, 0.5) },
      uEmber: { value: new THREE.Color(1, 0.32, 0.12) },
      uEmberBoost: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uHeight;
      uniform float uScale;
      uniform float uEmberBoost;
      varying float vAlpha;
      varying float vEmber;
      void main() {
        vec3 p = position;
        float t = uTime * aSeed.y;
        float rise = aSeed.w > 0.5 ? (0.11 + uEmberBoost * 0.25) : 0.035;
        p.y = mod(p.y + uTime * rise * aSeed.y, uHeight);
        p.x += sin(t * 0.37 + aSeed.x) * 0.22;
        p.z += cos(t * 0.29 + aSeed.x * 1.3) * 0.22;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float size = aSeed.z * (aSeed.w > 0.5 ? 1.15 + uEmberBoost * 0.6 : 1.0);
        gl_PointSize = size * uScale / max(0.2, -mv.z);
        gl_Position = projectionMatrix * mv;
        float edge = smoothstep(0.0, 0.35, p.y) * smoothstep(uHeight, uHeight - 0.6, p.y);
        float flicker = 0.65 + 0.35 * sin(uTime * (1.5 + aSeed.y * 3.0) + aSeed.x * 7.0);
        vAlpha = edge * flicker * smoothstep(0.35, 1.6, -mv.z);
        vEmber = aSeed.w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDust;
      uniform vec3 uEmber;
      uniform float uEmberBoost;
      uniform float uOpacity;
      varying float vAlpha;
      varying float vEmber;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        vec3 col = mix(uDust * 0.55, uEmber * (1.6 + uEmberBoost * 2.5), vEmber);
        gl_FragColor = vec4(col * a * vAlpha * uOpacity, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

// ---------- the scene ----------
export class HeroScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
    this.camera.position.set(0, 1.4, 3);
    this.camera.layers.enable(2);
    this.state = {
      progress: 0, smooth: 0,
      pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2(),
      reveal: 0, mood: 0, moodTarget: 0, glitch: 0,
    };
    this.time = 0;
    this.active = true;
    this.pixelRatioCap = 2;
    this._shot = {};
    this._glowTarget = new THREE.Vector2(0.5, 0.6);
    this._v = new THREE.Vector3();
    this._headQ = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._frameTimes = [];
    this.#build();
    this.post = createComposer(this.renderer, this.scene, this.camera, { aura: true, samples: 4, bloom: [0.24, 0.6, 0.88] })
    this.post.grain.uniforms.uAmount.value = 0.028;;
    // silhouette mask for the aura pass
    this.maskTarget = new THREE.WebGLRenderTarget(1, 1, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, depthBuffer: true });
    this.maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.post.aura.uniforms.tMask.value = this.maskTarget.texture;
    this.resize();
  }

  #build() {
    const { scene, renderer } = this;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.environmentIntensity = MOODS[0].env;
    pmrem.dispose();

    this.backdrop = createBackdrop();
    scene.add(this.backdrop);

    this.hemi = new THREE.HemisphereLight(0x3a3128, 0x050404, MOODS[0].hemi);
    scene.add(this.hemi);
    const dir = (pos) => {
      const l = new THREE.DirectionalLight(0xffffff, 1);
      l.position.set(...pos);
      l.target.position.set(0, 1, 0);
      scene.add(l, l.target);
      return l;
    };
    this.lights = { key: dir([2.4, 3.8, 2.6]), rim: dir([-2.6, 2.8, -3]), rim2: dir([2.8, 2.2, -2.4]), fill: dir([-3, 1, 2.6]) };

    this.floor = createFloor();
    scene.add(this.floor.group);
    this.dust = createDust();
    scene.add(this.dust);
  }

  async load(url, onProgress) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, (e) => { if (e.total) onProgress?.(e.loaded / e.total); });
    const model = gltf.scene;
    model.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        o.material.envMapIntensity = 1;
        o.layers.enable(1);
        // sharpest possible texture filtering at grazing angles
        const aniso = this.renderer.capabilities.getMaxAnisotropy();
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
          const tex = o.material[key];
          if (tex) { tex.anisotropy = aniso; tex.needsUpdate = true; }
        }
      }
    });
    this.character = model;
    this.scene.add(model);
    this.walk = new OniWalk(model);
    this.walk.time = 0.35;
    this.bones = this.walk.bones;
    this.footBones = [this.bones.LeftFoot, this.bones.RightFoot];
    this.walk.update(0);
    await this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    onProgress?.(1);
  }

  attachWordmark(wm) {
    this.wordmark = wm;
    wm.build(this.pixelRatio);
    this.scene.add(wm.group);
  }

  setProgress(p) { this.state.progress = clamp(p, 0, 1); }
  setPointer(x, y) { this.state.pointer.set(x, y); }
  setMood(on) { this.state.moodTarget = on ? 1 : 0; this.state.glitch = 1; }
  setActive(v) {
    this.active = v;
    if (v) { this.lastTick = performance.now(); this._lastFrame = undefined; this._frameTimes.length = 0; }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    // render at least at 1x (and up to 2x on retina) so the oni stays crisp
    const pr = Math.max(1, Math.min(window.devicePixelRatio || 1, w < 760 ? Math.min(1.75, this.pixelRatioCap) : this.pixelRatioCap));
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
    this.maskTarget.setSize(Math.max(1, Math.floor((w * pr) / 2)), Math.max(1, Math.floor((h * pr) / 2)));
    this.backdrop.material.uniforms.uRes.value.set(w * pr, h * pr);
    this.dust.material.uniforms.uScale.value = h * pr * 0.0125;
    this.wordmark?.build(pr);
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
    s.smooth += (s.progress - s.smooth) * (1 - Math.exp(-dt * 5));
    s.pointerSmooth.lerp(s.pointer, 1 - Math.exp(-dt * 2.5));
    s.mood += (s.moodTarget - s.mood) * (1 - Math.exp(-dt * 3.2));
    s.glitch = Math.max(0, s.glitch - dt * 2.4);

    if (this.walk) {
      this.walk.speed = lerp(1, 1.12, s.mood);
      this.walk.update(dt);
      // the oni glances towards the cursor
      const head = this.bones.Head;
      this._headQ.setFromEuler(this._e.set(-s.pointerSmooth.y * 0.12, s.pointerSmooth.x * 0.3 * (1 - smoothstep(s.smooth, 0.05, 0.25)), 0, 'YXZ'));
      head.quaternion.multiply(this._headQ);
    }
    this.#camera();
    this.#lighting(dt);
    this.wordmark?.update(this.width, this.height);
    this.#renderMask();
    this.post.render(this.time);
    this.#adaptQuality();
  }

  #camera() {
    const s = this.state;
    const cam = this.camera;
    const shot = sampleShot(s.smooth, this._shot);
    const portrait = clamp((1.15 - this.width / this.height) / 0.65, 0, 1);
    const fov = lerp(30, 40, portrait);
    if (Math.abs(cam.fov - fov) > 0.01) cam.fov = fov;
    const t = this.time;
    const theta = degToRad(shot.theta + s.pointerSmooth.x * 2.2 + Math.sin(t * 0.31) * 0.5);
    const r = shot.radius * lerp(1, 1.32, portrait);
    const y = shot.y - s.pointerSmooth.y * 0.05 + Math.sin(t * 0.47) * 0.012;
    cam.position.set(Math.sin(theta) * r, y, Math.cos(theta) * r);
    cam.lookAt(0, shot.ty, 0);
    const shift = shot.shift * (1 - portrait);
    cam.setViewOffset(this.width, this.height, (-shift * this.width) / 2, 0, this.width, this.height);
  }

  #lighting(dt) {
    const s = this.state;
    const m = s.mood;
    const r = s.reveal;
    const [a, b] = MOODS;
    for (const k of LIGHT_KEYS) {
      const l = this.lights[k];
      l.color.lerpColors(a[k][0], b[k][0], m);
      l.intensity = lerp(a[k][1], b[k][1], m) * r;
    }
    this.hemi.intensity = lerp(a.hemi, b.hemi, m) * (0.25 + 0.75 * r);
    this.scene.environmentIntensity = lerp(a.env, b.env, m) * r;

    const bu = this.backdrop.material.uniforms;
    if (this.bones) {
      this.bones.Chest.getWorldPosition(this._v).project(this.camera);
      this._glowTarget.set(this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5);
    }
    bu.uGlowPos.value.lerp(this._glowTarget, 1 - Math.exp(-dt * 4));
    bu.uGlowColor.value.copy(a.glow).lerp(b.glow, m);
    bu.uIntensity.value = r;
    bu.uTime.value = this.time;

    const du = this.dust.material.uniforms;
    du.uTime.value = this.time;
    du.uEmberBoost.value = lerp(a.ember, b.ember, m);
    du.uDust.value.copy(a.dust).lerp(b.dust, m);
    du.uOpacity.value = r;

    // the floor fades in once the camera drops low enough to see it
    this.floor.setOpacity(smoothstep(s.smooth, 0.36, 0.56) * r);
    if (this.footBones) this.floor.updateFeet(this.footBones);

    const lens = this.post.lens.uniforms;
    lens.uGlitch.value = s.glitch * s.glitch;
    lens.uCA.value = 0.0006 + m * 0.0009;
    this.post.bloom.strength = lerp(0.24, 0.42, m);
    const au = this.post.aura.uniforms;
    au.uInner.value.lerpColors(a.aura.inner, b.aura.inner, m);
    au.uOuter.value.lerpColors(a.aura.outer, b.aura.outer, m);
    au.uIntensity.value = lerp(a.aura.intensity, b.aura.intensity, m) * r * (1 + s.glitch * 1.5);
    au.uFlame.value = lerp(a.aura.flame, b.aura.flame, m);
    au.uHaze.value = lerp(a.aura.haze, b.aura.haze, m);
  }

  #renderMask() {
    if (!this.character) return;
    const { renderer, scene, camera } = this;
    const layers = camera.layers.mask;
    const bg = scene.background;
    camera.layers.set(1);
    scene.overrideMaterial = this.maskMaterial;
    scene.background = null;
    renderer.setRenderTarget(this.maskTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;
    scene.background = bg;
    camera.layers.mask = layers;
  }

  // drop the resolution on slow machines
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
    if (avg > 1 / 45 && this.pixelRatioCap > 1) {
      this.pixelRatioCap = Math.max(1, this.pixelRatioCap - 0.25);
      this.resize();
    }
  }
}
