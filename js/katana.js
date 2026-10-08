// A giant cursed katana, built procedurally: curved blade with a glowing temper line,
// tsuba, silk-wrapped handle, two chains spiralling down the blade and paper talismans.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BLADE = { top: 2.6, tip: -9.2, width: 0.5, thickness: 0.1, sori: 0.12 };

// deterministic random so the talismans land in the same place every load
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function bladeGeometry({ top, tip, width, thickness, sori }, segments = 320) {
  const length = top - tip;
  const kissaki = 0.9; // where the point starts curving in
  const section = (t) => {
    const k = Math.max(0, (t - kissaki) / (1 - kissaki));
    const w = width * (1 - 0.24 * Math.min(t / kissaki, 1));
    const th = (thickness / 2) * (1 - 0.35 * t) * (1 - k * k);
    const round = Math.sqrt(Math.max(0, 1 - k * k));
    const back = -width / 2 + sori * 4 * t * (1 - t); // the gentle curve
    return { y: top - t * length, x: (e) => back + e * w * round, th };
  };
  // cross-section strips: the flat (ji), the bevel (shinogi -> edge), the edge itself
  const strips = [
    [7, (s, i, n) => { const r = i / (n - 1); return [s.x(1 - 0.7 * r), s.th * (1 - (1 - r) ** 2.4), r]; }],
    [2, (s, i) => (i === 0 ? [s.x(0.3), s.th, 1] : [s.x(0.045), s.th * 0.6, 1.8])],
    [2, (s, i) => (i === 0 ? [s.x(0.045), s.th * 0.6, 1.8] : [s.x(0), 0, 2])],
  ];
  const parts = [];
  for (const face of [1, -1]) {
    for (const [n, fn] of strips) {
      const pos = [];
      const uv = [];
      const idx = [];
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const s = section(t);
        for (let i = 0; i < n; i++) {
          const [x, z, e] = fn(s, i, n);
          pos.push(x, s.y, z * face);
          uv.push(e, t); // uv.x: 0 at the spine side of the flat .. 2 at the edge
        }
      }
      for (let j = 0; j < segments; j++) {
        for (let i = 0; i < n - 1; i++) {
          const a = j * n + i;
          const b = a + 1;
          const c = a + n;
          const d = c + 1;
          if (face > 0) idx.push(a, b, d, a, d, c);
          else idx.push(a, d, b, a, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

function bladeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: 0.2, envMapIntensity: 1.25 });
  const uniforms = { uTime: { value: 0 }, uGlow: { value: 1 }, uGlowColor: { value: new THREE.Color(1, 0.16, 0.05) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBlade;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBlade = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vBlade;
        uniform float uTime;
        uniform float uGlow;
        uniform vec3 uGlowColor;
        float bh(float n) { return fract(sin(n * 91.345) * 47453.21); }
        float bnoise(float x) { float i = floor(x), f = fract(x); return mix(bh(i), bh(i + 1.0), f * f * (3.0 - 2.0 * f)); }
        // wavy hamon: rounded gunome waves riding a slow notare undulation
        float hamonLine(float s) {
          float L = s * 84.0;
          float g = pow(abs(sin(L)), 0.6) * (0.55 + 0.45 * bnoise(L * 0.37));
          return 0.36 + 0.13 * g + 0.08 * bnoise(s * 9.0);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float e = vBlade.x;
        float s = vBlade.y;
        float line = hamonLine(s);
        float hamon = 1.0 - smoothstep(line - 0.035, line + 0.035, e);
        float nie = step(0.82, bh(floor(e * 120.0) + floor(s * 3000.0) * 13.0)) * smoothstep(0.12, 0.0, abs(e - line));
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.46, vec3(0.74, 0.75, 0.78), hamon * 0.9) + nie * 0.3;
        float hada = bnoise(e * 14.0 + s * 900.0) * bnoise(s * 260.0 - e * 3.0);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.08 + hada * 0.07, 0.4, hamon * smoothstep(1.0, 0.95, e));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // the demon in the steel: crimson light pulsing down the temper line
        float glowLine = exp(-pow((e - line) / 0.028, 2.0)) * step(e, 1.0);
        float pulse = 0.55 + 0.45 * sin(s * 26.0 - uTime * 1.6);
        float tipFade = smoothstep(1.0, 0.93, s);
        totalEmissiveRadiance += uGlowColor * glowLine * pulse * uGlow * 1.6 * tipFade;
        totalEmissiveRadiance += vec3(1.0, 0.55, 0.4) * smoothstep(0.02, 0.0, e) * 0.35 * uGlow;`);
  };
  mat.customProgramCacheKey = () => 'oni-blade';
  return { material: mat, uniforms };
}

const metal = (color, roughness, metalness = 1) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function extrudeFlat(shape, depth, y, bevel = 0.01) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 48 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
const ellipseShape = (rx, ry, n = 72) => {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rx, Math.sin(a) * ry);
  }
  return s;
};
const bladeHole = (w, h) => {
  const p = new THREE.Path();
  p.moveTo(-w / 2, 0);
  p.quadraticCurveTo(0, h * 1.6, w / 2, 0);
  p.quadraticCurveTo(0, -h * 1.6, -w / 2, 0);
  return p;
};

// rounded-square tsuba with openwork petals
function tsubaShape() {
  const s = new THREE.Shape();
  const ex = 2.7;
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const k = 1 - 0.035 * Math.abs(Math.sin(2 * a)) ** 8;
    s[i ? 'lineTo' : 'moveTo'](Math.sign(c) * Math.abs(c) ** (2 / ex) * 0.8 * k, Math.sign(sn) * Math.abs(sn) ** (2 / ex) * 0.72 * k);
  }
  s.holes.push(bladeHole(0.54, 0.075));
  for (const side of [-1, 1]) {
    const h = new THREE.Path();
    h.absarc(0, side * 0.38, 0.1, 0, Math.PI * 2, false);
    s.holes.push(h);
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const cx = Math.cos(a) * 0.53;
    const cy = Math.sin(a) * 0.47;
    const r = 0.13;
    const h = new THREE.Path();
    const back = a + Math.PI;
    h.absarc(cx, cy, r, back + 0.35 * Math.PI, back - 0.35 * Math.PI + Math.PI * 2, false);
    h.absarc(cx + Math.cos(a) * 0.07, cy + Math.sin(a) * 0.07, r * 0.86, back - 0.29 * Math.PI + Math.PI * 2, back + 0.29 * Math.PI, true);
    s.holes.push(h);
  }
  return s;
}

function tsubaRim(y, rx = 0.8, rz = 0.72, ex = 2.7) {
  const pts = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = 1 - 0.035 * Math.abs(Math.sin(2 * a)) ** 8;
    pts.push(new THREE.Vector3(Math.sign(c) * Math.abs(c) ** (2 / ex) * rx * k, y, Math.sign(s) * Math.abs(s) ** (2 / ex) * rz * k));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, 0.016, 8, true);
}

// elliptical tube along Y with uv (around, along)
function sleeve(rx, rz, y0, y1, profile = () => 1, rows = 72, cols = 56) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const k = profile(v);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const a = u * Math.PI * 2;
      pos.push(Math.cos(a) * rx * k, y0 + (y1 - y0) * v, Math.sin(a) * rz * k);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function wrapMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWrap;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWrap = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWrap;\nfloat wrapMask;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float a = vWrap.x * 2.0;
        float l = vWrap.y * 11.0;
        float d1 = abs(fract(l + a) - 0.5);
        float d2 = abs(fract(l - a) - 0.5);
        float band = smoothstep(0.31, 0.34, min(d1, d2));
        float ridge = smoothstep(0.0, 0.31, min(d1, d2));
        wrapMask = 1.0 - band;
        vec3 silk = vec3(0.2, 0.016, 0.022) * (0.55 + 0.45 * ridge);
        float grain = fract(sin(dot(floor(vWrap * vec2(260.0, 900.0)), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 same = vec3(0.78, 0.74, 0.66) * (0.85 + 0.15 * grain);
        diffuseColor.rgb = mix(same, silk, wrapMask);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.45, 0.72, wrapMask);');
  };
  mat.customProgramCacheKey = () => 'oni-handle';
  return mat;
}

// a chain of alternating links wound around the blade; returns anchor points for talismans
function addChain(group, { y0, y1, turns, radius, phase, linkLen = 0.18 }) {
  const curve = new THREE.Curve();
  curve.getPoint = (t, out = new THREE.Vector3()) => {
    const a = phase + t * turns * Math.PI * 2;
    const r = radius * (1 + 0.12 * Math.sin(t * turns * Math.PI * 4 + phase));
    return out.set(Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r);
  };
  const count = Math.floor(curve.getLength() / linkLen);
  const link = new THREE.TorusGeometry(0.07, 0.019, 8, 18);
  link.scale(1, 1.55, 1);
  const mesh = new THREE.InstancedMesh(link, metal(0x2a2826, 0.38), count);
  const frames = curve.computeFrenetFrames(count, false);
  const m = new THREE.Matrix4();
  const side = new THREE.Vector3();
  const third = new THREE.Vector3();
  const anchors = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = curve.getPointAt(t);
    const tan = frames.tangents[i];
    side.copy(i % 2 ? frames.normals[i] : frames.binormals[i]);
    third.crossVectors(side, tan);
    m.makeBasis(side, tan, third).setPosition(p);
    mesh.setMatrixAt(i, m);
    if (i % 5 === 2) anchors.push(p.clone());
  }
  group.add(mesh);
  return anchors;
}

function talismanTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 448;
  const g = c.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const x = k * 128;
    const paper = g.createLinearGradient(0, 0, 0, 448);
    paper.addColorStop(0, '#d9ccb0');
    paper.addColorStop(1, '#b9a581');
    g.fillStyle = paper;
    g.fillRect(x + 4, 0, 120, 448);
    g.strokeStyle = 'rgba(120, 20, 18, 0.9)';
    g.lineWidth = 3;
    g.strokeRect(x + 12, 10, 104, 428);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(25, 14, 12, 0.92)';
    let y = 46;
    while (y < 330) {
      const kind = Math.floor(rand() * 4);
      g.lineWidth = 6 + rand() * 5;
      g.beginPath();
      if (kind === 0) { g.moveTo(x + 34, y); g.lineTo(x + 94, y + 4); }
      else if (kind === 1) { g.moveTo(x + 64, y - 6); g.lineTo(x + 62, y + 34); }
      else if (kind === 2) g.arc(x + 64, y + 14, 16, 0.4, Math.PI * 1.8);
      else { g.moveTo(x + 40, y + 30); g.lineTo(x + 64, y); g.lineTo(x + 88, y + 30); }
      g.stroke();
      y += 22 + rand() * 18;
    }
    // red seal
    g.fillStyle = 'rgba(180, 24, 20, 0.92)';
    g.fillRect(x + 40, 352, 48, 48);
    g.strokeStyle = 'rgba(230, 200, 170, 0.7)';
    g.lineWidth = 3;
    g.strokeRect(x + 46, 358, 36, 36);
    g.beginPath();
    g.moveTo(x + 64, 362); g.lineTo(x + 64, 390);
    g.moveTo(x + 52, 376); g.lineTo(x + 76, 376);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function addTalismans(group, anchors) {
  const H = 0.56;
  const geo = new THREE.PlaneGeometry(0.15, H, 1, 10);
  geo.translate(0, -H / 2, 0);
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ map: talismanTexture(), side: THREE.DoubleSide, roughness: 0.85, metalness: 0, emissive: 0x2a0503 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = (vMapUv.x + float(gl_InstanceID % 4)) * 0.25;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hang = pow(-position.y / ${H.toFixed(3)}, 1.6);
        float ph = float(gl_InstanceID) * 1.93;
        transformed.z += sin(uTime * 1.4 + ph) * 0.05 * hang + sin(uTime * 3.1 + ph * 2.0) * 0.012 * hang;
        transformed.x += sin(uTime * 0.9 + ph * 0.7) * 0.025 * hang;`);
  };
  mat.customProgramCacheKey = () => 'oni-talisman';
  const mesh = new THREE.InstancedMesh(geo, mat, anchors.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  anchors.forEach((p, i) => {
    const out = Math.atan2(p.x, p.z);
    e.set((rand() - 0.5) * 0.25, out + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.2);
    q.setFromEuler(e);
    m.compose(p.clone().multiplyScalar(1.04), q, one);
    mesh.setMatrixAt(i, m);
  });
  group.add(mesh);
  return uniforms;
}

export function createKatana() {
  const group = new THREE.Group();
  const B = BLADE;
  const blade = bladeMaterial();
  group.add(new THREE.Mesh(bladeGeometry(B), blade.material));

  const gold = metal(0xc9973f, 0.3);
  const iron = metal(0x241f1d, 0.55, 0.85);
  const black = metal(0x161412, 0.42, 0.9);

  // habaki (blade collar)
  const habaki = new THREE.Shape();
  habaki.moveTo(-0.29, 0);
  habaki.quadraticCurveTo(-0.27, 0.085, 0, 0.085);
  habaki.quadraticCurveTo(0.24, 0.07, 0.3, 0);
  habaki.quadraticCurveTo(0.24, -0.07, 0, -0.085);
  habaki.quadraticCurveTo(-0.27, -0.085, -0.29, 0);
  group.add(new THREE.Mesh(extrudeFlat(habaki, 0.4, B.top - 0.42, 0.012), metal(0xb7843e, 0.26)));

  const seppa = ellipseShape(0.36, 0.17);
  seppa.holes.push(bladeHole(0.54, 0.075));
  group.add(new THREE.Mesh(extrudeFlat(seppa, 0.03, B.top - 0.02, 0.004), gold));
  group.add(new THREE.Mesh(extrudeFlat(tsubaShape(), 0.07, B.top + 0.03, 0.012), iron));
  group.add(new THREE.Mesh(tsubaRim(B.top + 0.03), gold));
  group.add(new THREE.Mesh(tsubaRim(B.top + 0.11), gold));
  group.add(new THREE.Mesh(extrudeFlat(seppa, 0.03, B.top + 0.14, 0.004), gold));

  // fuchi, wrapped tsuka, menuki and kashira
  const f0 = B.top + 0.18;
  group.add(new THREE.Mesh(sleeve(0.235, 0.165, f0, f0 + 0.16), black));
  group.add(new THREE.Mesh(sleeve(0.24, 0.17, f0, f0 + 0.025), gold));
  const h0 = f0 + 0.16;
  const h1 = h0 + 3.3;
  group.add(new THREE.Mesh(sleeve(0.215, 0.15, h0, h1, (v) => 1 - 0.05 * Math.sin(Math.PI * v), 96, 64), wrapMaterial()));
  for (const s of [-1, 1]) {
    const menuki = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), gold);
    menuki.scale.set(0.09, 0.22, 0.035);
    menuki.position.set(s * 0.02, h0 + 1.1 + (s > 0 ? 0 : 0.7), s * 0.15);
    group.add(menuki);
  }
  const kashira = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), black);
  kashira.scale.set(0.225, 0.14, 0.158);
  kashira.position.y = h1;
  group.add(kashira);
  group.add(new THREE.Mesh(sleeve(0.228, 0.161, h1 - 0.03, h1 + 0.02), gold));

  const anchors = [
    ...addChain(group, { y0: B.top - 0.55, y1: -6.6, turns: 2.25, radius: 0.37, phase: 0 }),
    ...addChain(group, { y0: B.top - 1.4, y1: -7.4, turns: 1.85, radius: 0.4, phase: Math.PI }),
  ].filter((_, i) => i % 2 === 0);
  const talismans = addTalismans(group, anchors);

  return {
    group,
    update(t) {
      blade.uniforms.uTime.value = t;
      talismans.uTime.value = t;
    },
    setGlow(v) { blade.uniforms.uGlow.value = v; },
  };
}
