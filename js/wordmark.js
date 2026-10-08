// Draws the DOM wordmark inside the hero's WebGL scene so the oni walks in front of it.
// Each letter is a screen-space quad that tracks its DOM rect (so GSAP intro tweens and
// scrolling still drive it), clipped to the line's overflow box.
import * as THREE from 'three';

const STRETCH = [[50, 'ultra-condensed'], [62.5, 'extra-condensed'], [75, 'condensed'], [87.5, 'semi-condensed'], [100, 'normal'], [112.5, 'semi-expanded'], [125, 'expanded'], [150, 'extra-expanded'], [200, 'ultra-expanded']];
const stretchKeyword = (v) => {
  const n = parseFloat(v) || 100;
  return STRETCH.reduce((best, s) => (Math.abs(s[0] - n) < Math.abs(best[0] - n) ? s : best))[1];
};

function letterMaterial(atlas) {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uAtlas: { value: atlas },
      uRect: { value: new THREE.Vector4() },
      uUV: { value: new THREE.Vector4() },
      uView: { value: new THREE.Vector2(1, 1) },
      uColor: { value: new THREE.Color() },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec4 uRect;
      uniform vec2 uView;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec2 css = uRect.xy + vec2(uv.x, 1.0 - uv.y) * uRect.zw;
        gl_Position = vec4(css.x / uView.x * 2.0 - 1.0, 1.0 - css.y / uView.y * 2.0, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec4 uUV;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 st = vec2(mix(uUV.x, uUV.z, vUv.x), mix(uUV.y, uUV.w, 1.0 - vUv.y));
        gl_FragColor = vec4(uColor, texture2D(uAtlas, st).a * uOpacity);
      }
    `,
  });
}

export class GLWordmark {
  constructor({ wordmark, line, chars }) {
    this.wordmark = wordmark;
    this.line = line;
    this.chars = chars;
    this.group = new THREE.Group();
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.letters = [];
    this.texture = null;
  }

  build(pixelRatio = 1) {
    for (const l of this.letters) {
      this.group.remove(l.mesh);
      l.mesh.material.dispose();
    }
    this.texture?.dispose();
    this.letters = [];

    const probe = document.createElement('span');
    probe.style.color = 'var(--wordmark, rgba(7, 6, 5, 0.9))';
    document.body.append(probe);
    const css = getComputedStyle(probe).color;
    probe.remove();
    const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(css);
    this.alpha = alpha ? parseFloat(alpha[1]) : 1;
    this.color = new THREE.Color().setStyle(css.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)'));

    const items = this.chars.map((el) => {
      const s = getComputedStyle(el);
      const size = parseFloat(s.fontSize);
      const pad = size * 0.3;
      return { el, s, size, pad, text: el.textContent, w: el.offsetWidth + pad * 2, h: el.offsetHeight + pad * 2, boxH: el.offsetHeight };
    });

    const W = Math.ceil(items.reduce((sum, it) => sum + it.w + 4, 0) * pixelRatio);
    const H = Math.ceil(Math.max(...items.map((it) => it.h)) * pixelRatio);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, W);
    canvas.height = Math.max(1, H);
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    let x = 0;
    for (const it of items) {
      const { s } = it;
      g.font = `${s.fontStyle} ${s.fontWeight} ${it.size * pixelRatio}px ${s.fontFamily}`;
      if ('fontStretch' in g) g.fontStretch = stretchKeyword(s.fontStretch);
      const m = g.measureText(it.text);
      const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
      const baseline = (it.boxH * pixelRatio - (asc + desc)) / 2 + asc;
      g.fillText(it.text, x + it.pad * pixelRatio, it.pad * pixelRatio + baseline);
      it.uv = [x / canvas.width, 0, (x + it.w * pixelRatio) / canvas.width, (it.h * pixelRatio) / canvas.height];
      x += (it.w + 4) * pixelRatio;
    }

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.flipY = false;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;

    for (const it of items) {
      const mesh = new THREE.Mesh(this.geometry, letterMaterial(this.texture));
      mesh.frustumCulled = false;
      mesh.renderOrder = -999;
      mesh.layers.set(2);
      mesh.material.uniforms.uColor.value.copy(this.color);
      this.group.add(mesh);
      this.letters.push({ ...it, mesh });
    }
  }

  update(viewW, viewH) {
    if (!this.letters.length) return;
    const line = this.line.getBoundingClientRect();
    const visible = line.bottom > 0 && line.top < viewH;
    this.group.visible = visible;
    if (!visible) return;
    for (const l of this.letters) {
      const r = l.el.getBoundingClientRect();
      const x0 = r.left - l.pad;
      const y0 = r.top - l.pad;
      const left = Math.max(x0, line.left);
      const right = Math.min(x0 + l.w, line.right);
      const top = Math.max(y0, line.top);
      const bottom = Math.min(y0 + l.h, line.bottom);
      if (right <= left || bottom <= top) {
        l.mesh.visible = false;
        continue;
      }
      l.mesh.visible = true;
      const u = l.mesh.material.uniforms;
      u.uRect.value.set(left, top, right - left, bottom - top);
      const [a, b, c, d] = l.uv;
      u.uUV.value.set(
        a + ((left - x0) / l.w) * (c - a),
        b + ((top - y0) / l.h) * (d - b),
        a + ((right - x0) / l.w) * (c - a),
        b + ((bottom - y0) / l.h) * (d - b)
      );
      u.uView.value.set(viewW, viewH);
      u.uOpacity.value = this.alpha;
    }
  }
}
