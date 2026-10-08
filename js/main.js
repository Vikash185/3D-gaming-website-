import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { HeroScene } from './hero.js';
import { GLWordmark } from './wordmark.js';
import { Soundtrack } from './audio.js';
import {
  SERVICES, CATEGORIES, FEATURES, TRAILER, DOMAINS, pad2, mediaName, titleOf, categoryLabel, progressFromFocus,
} from './data.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// ---------- smooth scroll ----------
const lenis = reduceMotion ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.85, touchMultiplier: 1.3 });
if (lenis) {
  lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

function goTo(target, done) {
  const el = typeof target === 'string' ? (target === '#hero' ? 0 : $(target)) : target;
  if (el == null) return;
  if (lenis) {
    lenis.scrollTo(el, { duration: 1.6, easing: (t) => 1 - (1 - t) ** 4, onComplete: done });
  } else {
    const top = typeof el === 'number' ? el : el.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    if (done) setTimeout(done, reduceMotion ? 0 : 900);
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented) return;
  const href = a.getAttribute('href');
  e.preventDefault();
  if (href.length > 1) goTo(href);
});

// ---------- scramble text ----------
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\[]';
const scrambles = new WeakMap();
function scramble(el, text, { duration = 0.55, delay = 0 } = {}) {
  cancelAnimationFrame(scrambles.get(el));
  if (reduceMotion || !el.isConnected) { el.textContent = text; return; }
  const from = el.textContent;
  const len = Math.max(from.length, text.length);
  const start = performance.now() + delay * 1000;
  const step = (now) => {
    const p = (now - start) / (duration * 1000);
    let out = '';
    for (let i = 0; i < len; i++) {
      const settle = 0.35 + (i / len) * 0.65;
      const ch = text[i] ?? '';
      if (p >= settle) out += ch;
      else if (p >= settle - 0.45 && ch !== ' ') out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      else out += from[i] ?? '';
    }
    el.textContent = out;
    if (p < 1) scrambles.set(el, requestAnimationFrame(step));
    else el.textContent = text;
  };
  scrambles.set(el, requestAnimationFrame(step));
}

// ==========================================================
// HERO
// ==========================================================
let hero;
try {
  hero = new HeroScene($('[data-canvas]'));
} catch (err) {
  console.error(err);
  hero = {
    noWebGL: true,
    state: { progress: 0, smooth: 0, reveal: 0 },
    setProgress(p) { this.state.progress = this.state.smooth = p; },
    load: async () => {}, start() {}, resize() {}, setActive() {}, setPointer() {}, setMood() {},
  };
}

// chapters flip in line by line as the camera circles
class Chapter {
  constructor(el, { enter, dim, exit }) {
    Object.assign(this, { el, enter, dim, exit });
    this.state = 'hidden';
    this.index = $('.chapter__index', el);
    this.lines = $$('.chapter__line', el);
    this.colors = this.lines.map((l) => getComputedStyle(l).color);
    gsap.set(this.lines, { transformPerspective: 520, transformOrigin: '0% 50% -12px', opacity: 0 });
    gsap.set(this.index, { opacity: 0 });
  }

  update(p) {
    let next = 'hidden';
    if (p >= this.enter && p < this.exit) next = p >= this.dim ? 'dimmed' : 'active';
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.tl?.kill();
    const tl = (this.tl = gsap.timeline());
    const dimmed = next === 'dimmed';
    const look = { opacity: dimmed ? 0.55 : 1, color: (i) => (dimmed ? '#6d6861' : this.colors[i]) };
    if (next !== 'hidden' && prev === 'hidden') {
      gsap.set(this.el, { visibility: 'visible' });
      tl.fromTo(this.index, { opacity: 0, x: -6 }, { opacity: dimmed ? 0.4 : 1, x: 0, duration: 0.5, ease: 'power2.out' }, 0);
      tl.fromTo(this.lines, { rotateX: -92, rotateZ: 4, y: 10, opacity: 0, color: '#4a4640' },
        { rotateX: 0, rotateZ: 0, y: 0, ...look, duration: 0.75, ease: 'power3.out', stagger: 0.075 }, 0.05);
    } else if (next === 'hidden') {
      tl.to(this.lines, { rotateX: 75, rotateZ: -2, y: -6, opacity: 0, duration: 0.4, stagger: 0.035, ease: 'power2.in' }, 0);
      tl.to(this.index, { opacity: 0, duration: 0.3 }, 0);
      tl.set(this.el, { visibility: 'hidden' });
    } else {
      tl.to(this.lines, { ...look, duration: 0.5, stagger: 0.025, ease: 'power2.out' }, 0);
      tl.to(this.index, { opacity: dimmed ? 0.4 : 1, duration: 0.5 }, 0);
    }
  }
}

const chapters = [
  new Chapter($('[data-chapter="2"]'), { enter: 0.42, dim: 0.6, exit: 0.665 }),
  new Chapter($('[data-chapter="3"]'), { enter: 0.705, dim: 0.985, exit: 1.01 }),
];

ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom bottom', onUpdate: (st) => hero.setProgress(st.progress) });

// the top bar swaps its intro pills for the small logo once you start scrolling
let scrolledPast = false;
const introOnly = $$('[data-intro-only]');
const logo = $('[data-logo]');
function updateTopbar(p) {
  const past = p > 0.035;
  if (past === scrolledPast) return;
  scrolledPast = past;
  $('[data-topbar]').classList.toggle('is-solid', past);
  gsap.to(introOnly, { autoAlpha: past ? 0 : 1, y: past ? -6 : 0, duration: 0.45, stagger: 0.04, ease: 'power2.out' });
  gsap.to(logo, { autoAlpha: past ? 1 : 0, x: past ? 0 : -8, duration: 0.55, ease: 'power3.out', delay: past ? 0.15 : 0 });
}
gsap.ticker.add(() => {
  const p = hero.state.smooth;
  for (const c of chapters) c.update(p);
  updateTopbar(hero.state.progress);
});

new IntersectionObserver(([e]) => hero.setActive(e.isIntersecting), { threshold: 0 }).observe($('[data-stage]'));
addEventListener('resize', () => hero.resize());
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') hero.setPointer((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

// Space: unleash / restrain the demon
const switchBtn = $('[data-switch]');
const switchVerb = $('[data-switch-verb]');
const switchLabel = $('[data-switch-label]');
const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
if (touch) switchLabel.textContent = 'Unleash';
let unleashed = false;
function toggleMood() {
  unleashed = !unleashed;
  hero.setMood(unleashed);
  switchBtn.setAttribute('aria-pressed', String(unleashed));
  switchVerb.textContent = unleashed ? 'restrain' : 'unleash';
  if (touch) switchLabel.textContent = unleashed ? 'Restrain' : 'Unleash';
  switchBtn.classList.add('is-pressed');
  setTimeout(() => switchBtn.classList.remove('is-pressed'), 140);
}
switchBtn.addEventListener('click', toggleMood);
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (document.body.classList.contains('is-loading')) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (hero.state.progress >= 1) return;
  e.preventDefault();
  toggleMood();
});

// ==========================================================
// 04 · THE REALM — title reveal + endless reel of paintings
// ==========================================================
function initRealm() {
  const section = $('#realm');
  if (!section) return;

  const lines = $$('.realm__line > span', section);
  if (!reduceMotion) {
    gsap.set(lines, { yPercent: 110 });
    gsap.set('.realm__lede p', { autoAlpha: 0, y: 16 });
    ScrollTrigger.create({
      trigger: '.realm__head', start: 'top 80%', once: true,
      onEnter: () => {
        gsap.to(lines, { yPercent: 0, duration: 1.4, stagger: 0.09, ease: 'expo.out' });
        gsap.to('.realm__lede p', { autoAlpha: 1, y: 0, duration: 1, stagger: 0.12, ease: 'power3.out', delay: 0.3 });
      },
    });
  }

  // two rows, each filled twice so the loop is seamless
  const rows = $$('[data-reel-row]', section).map((row, r) => {
    const items = SERVICES.slice(r * 7, r * 7 + 7).map((svc, k) => {
      const i = r * 7 + k;
      return `<figure class="reel__card"><img src="media/services/${mediaName(i)}.webp" alt="${titleOf(svc)}" loading="lazy" decoding="async" draggable="false" /><figcaption><b>${titleOf(svc)}</b><span>${categoryLabel(svc.category)}</span></figcaption></figure>`;
    }).join('');
    row.innerHTML = items + items;
    return { el: row, dir: Number(row.dataset.reelRow), x: r === 0 ? 0 : -0.5, speed: 1 };
  });

  let visible = false;
  let flow = 1; // eases towards the scroll direction
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '10% 0px' }).observe($('[data-reel]', section));

  gsap.ticker.add((_, dtMs) => {
    if (!visible) return;
    const dt = Math.min(dtMs, 50) / 1000;
    const v = lenis ? lenis.velocity : 0;
    if (Math.abs(v) > 0.5) flow += ((v > 0 ? 1 : -1) - flow) * 0.08;
    const boost = 1 + Math.min(8, Math.abs(v) * 0.35);
    for (const row of rows) {
      const half = row.el.scrollWidth / 2;
      if (!half) continue;
      const hover = row.el.matches(':hover');
      row.speed += ((hover ? 0.12 : 1) - row.speed) * 0.06;
      const px = (reduceMotion ? 0 : 42) * boost * row.speed * flow * row.dir * dt;
      row.x = (((row.x * half + px) % half) - half) % half / half; // keep in (-1, 0]
      row.el.style.transform = `translate3d(${(row.x * half).toFixed(2)}px,0,0)`;
    }
  });

  const counters = $$('.world__stats [data-count]', section);
  ScrollTrigger.create({
    trigger: '.realm__stats', start: 'top 88%', once: true,
    onEnter: () => {
      if (reduceMotion) return;
      for (const el of counters) {
        const v = { n: 0 };
        gsap.to(v, { n: Number(el.dataset.count), duration: 1.6, ease: 'expo.out', onUpdate: () => { el.textContent = String(Math.round(v.n)); } });
      }
    },
  });
}

// ==========================================================
// 05 · BLOOD CONTRACTS
// ==========================================================
function initContracts() {
  const section = $('#contracts');
  const q = (s) => $(s, section);
  const stage = q('[data-services-stage]');
  const canvas = q('[data-services-canvas]');
  const head = q('.services__head');
  const hint = q('[data-services-hint]');
  const d = {
    root: q('[data-detail]'), index: q('[data-d-index]'), cat: q('[data-d-cat]'), title: q('[data-d-title]'),
    client: q('[data-d-client]'), text: q('[data-d-text]'), reward: q('[data-d-reward]'), danger: q('[data-d-danger]'),
  };
  const mobile = matchMedia('(max-width: 760px)').matches;

  q('[data-services-list]').innerHTML = SERVICES.map((s, i) => `
    <li class="svc">
      <img src="media/services/sm/${mediaName(i)}.webp" alt="" loading="lazy" decoding="async" />
      <div class="svc__body">
        <p class="svc__n">${pad2(i)} · ${categoryLabel(s.category)}${s.coop ? ' · Co-op' : ''}</p>
        <h3>${titleOf(s)}</h3>
        <p>Patron: ${s.client}</p>
        <p>${s.text}</p>
        <p>Bounty: ${s.reward} · Threat ${s.danger}/5</p>
      </div>
    </li>`).join('');

  const finder = q('[data-finder-list]');
  finder.innerHTML = CATEGORIES.map((c) => {
    const n = SERVICES.filter((s) => s.category === c.id).length;
    return `<li><button type="button" data-cat="${c.id}"><span class="arrow" aria-hidden="true">-&gt;</span>${c.label}<i>${String(n).padStart(2, '0')}</i></button></li>`;
  }).join('');
  const catButtons = $$('button', finder);

  const rail = q('[data-rail]');
  rail.innerHTML = SERVICES.map((s, i) => `<li><button type="button" aria-label="${pad2(i)} ${titleOf(s)}"></button></li>`).join('');
  const railButtons = $$('button', rail);

  if (matchMedia('(hover: none)').matches) hint.lastElementChild.textContent = 'Tap a card to thaw the glass';
  d.danger.innerHTML = '<i></i>'.repeat(5);
  const pips = [...d.danger.children];
  d.root.classList.add('is-idle');

  let scene = null;
  let progress = 0;
  let current = -1;
  const st = ScrollTrigger.create({
    trigger: section, start: 'top top', end: 'bottom bottom',
    onUpdate: (s) => {
      progress = s.progress;
      scene?.setProgress(progress);
      hint.classList.toggle('is-hidden', progress > 0.09);
      head.classList.toggle('is-compact', progress > 0.09);
    },
  });

  function scrollToCard(i) {
    const y = st.start + (st.end - st.start) * progressFromFocus(i);
    if (lenis) lenis.scrollTo(y, { duration: 1.6, easing: (t) => 1 - (1 - t) ** 4 });
    else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function showDetail(i) {
    current = i;
    d.root.classList.toggle('is-idle', i < 0);
    railButtons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    const cat = SERVICES[i]?.category;
    catButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.cat === cat));
    if (i < 0) return;
    const s = SERVICES[i];
    scramble(d.index, pad2(i), { duration: 0.35 });
    scramble(d.cat, (s.coop ? 'Co-op hunt · ' : '') + categoryLabel(s.category), { duration: 0.4 });
    scramble(d.title, titleOf(s), { duration: 0.6 });
    scramble(d.client, s.client, { duration: 0.5, delay: 0.05 });
    d.reward.textContent = s.reward;
    pips.forEach((p, k) => p.classList.toggle('is-on', k < s.danger));
    d.danger.setAttribute('aria-label', `${s.danger} of 5`);
    gsap.killTweensOf(d.text);
    d.text.textContent = s.text;
    if (!reduceMotion) gsap.fromTo(d.text, { autoAlpha: 0, y: 5 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' });
  }

  for (const b of catButtons) {
    b.addEventListener('click', () => {
      const ids = SERVICES.map((s, i) => (s.category === b.dataset.cat ? i : -1)).filter((i) => i >= 0);
      scrollToCard(ids.find((i) => i > current) ?? ids[0]);
    });
  }
  railButtons.forEach((b, i) => b.addEventListener('click', () => scrollToCard(i)));

  const ask = q('[data-ask]');
  const askMsg = q('[data-ask-msg]');
  ask.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('input', ask);
    const query = input.value.trim().toLowerCase();
    if (!query) return;
    const words = query.split(/\s+/).filter((w) => w.length > 1);
    let best = -1;
    let bestScore = 0;
    SERVICES.forEach((s, i) => {
      const fields = [[titleOf(s), 5], [categoryLabel(s.category), 4], [s.client, 3], [s.keywords, 2], [s.text, 1], [s.reward, 1]];
      let score = 0;
      for (const w of words) for (const [f, weight] of fields) if (f.toLowerCase().includes(w)) score += weight;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best < 0) { askMsg.textContent = `No contract mentions “${input.value.trim()}”.`; return; }
    askMsg.textContent = `-> ${pad2(best)} ${titleOf(SERVICES[best])}`;
    scrollToCard(best);
  });

  async function create() {
    try {
      await Promise.all(['300', '500', '600', '700'].map((w) => document.fonts.load(`${w} 100px Archivo`, 'AŌō'))).catch(() => {});
      const { ServicesScene } = await import('./services-scene.js');
      scene = new ServicesScene(canvas, SERVICES, { mobile });
    } catch (err) {
      console.error(err);
      section.classList.add('services--fallback');
      ScrollTrigger.refresh();
      return null;
    }
    scene.setProgress(progress);
    scene.on('focus', showDetail);
    scene.on('select', (i) => { if (i !== current) scrollToCard(i); });
    scene.start();
    new IntersectionObserver(([e]) => scene.setActive(e.isIntersecting), { threshold: 0 }).observe(stage);
    new IntersectionObserver(([e]) => { if (e.isIntersecting) scene.loadMedia(); }, { rootMargin: '150% 0px' }).observe(section);
    addEventListener('resize', () => scene.resize());
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      scene.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, true);
    });
    canvas.addEventListener('pointerleave', () => scene.setPointer(0, 0, false));
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      const r = canvas.getBoundingClientRect();
      const hit = scene.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (!hit) return scene.holdHover(-1);
      if (hit.index === current) scene.holdHover(scene.heldHover === hit.index ? -1 : hit.index);
      else scrollToCard(hit.index);
    });
    return scene;
  }
  return { create };
}

// ==========================================================
// 06 · WAY OF THE BLADE
// ==========================================================
function initWay() {
  const section = $('#way');
  const buttons = $$('[data-feature]', section);
  const layers = $$('.arsenal__layer', section);
  const count = $('[data-arsenal-count]', section);
  const text = $('[data-arsenal-text]', section);
  const tags = $('[data-arsenal-tags]', section);
  const n = FEATURES.length;
  let active = -1;
  let visible = false;

  const syncVideo = () => layers.forEach((l, i) => {
    if (l.tagName !== 'VIDEO') return;
    if (visible && i === active) l.play().catch(() => {});
    else l.pause();
  });

  function show(i, animate = true) {
    if (i === active) return;
    active = i;
    buttons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    count.textContent = `${pad2(i)} / ${String(n).padStart(2, '0')}`;
    const layer = layers[i];
    layers.forEach((l, k) => { l.style.zIndex = k === i ? '1' : '0'; });
    gsap.killTweensOf(layer);
    if (animate && !reduceMotion) {
      gsap.fromTo(layer, { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.14 }, {
        clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 1.15, ease: 'expo.inOut',
        onComplete: () => { if (active === i) layers.forEach((l, k) => { if (k !== i) gsap.set(l, { clipPath: 'inset(100% 0% 0% 0%)' }); }); },
      });
    } else {
      layers.forEach((l, k) => gsap.set(l, { clipPath: k === i ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)', scale: 1 }));
    }
    syncVideo();
    const f = FEATURES[i];
    text.textContent = f.text;
    tags.innerHTML = f.tags.map((t) => `<li>${t}</li>`).join('');
    if (animate && !reduceMotion) {
      gsap.fromTo(text, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.15 });
      gsap.fromTo(tags.children, { autoAlpha: 0, x: 8 }, { autoAlpha: 1, x: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out', delay: 0.25 });
    }
  }

  const st = ScrollTrigger.create({
    trigger: section, start: 'top top', end: 'bottom bottom',
    onUpdate: (s) => show(Math.min(n - 1, Math.floor(s.progress * n))),
  });
  show(0, false);
  buttons.forEach((b, i) => b.addEventListener('click', () => {
    const y = st.start + (st.end - st.start) * ((i + 0.5) / n);
    if (lenis) lenis.scrollTo(y, { duration: 1.2 });
    else window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
  }));
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; syncVideo(); }).observe($('[data-arsenal-frame]', section));
}

// ==========================================================
// 07 · THE DOMAINS — drag slider
// ==========================================================
function initDomains() {
  const section = $('#domains');
  const viewport = $('[data-dom-viewport]', section);
  const track = $('[data-dom-track]', section);
  const indexEl = $('[data-dom-index]', section);
  const lordEl = $('[data-dom-lord]', section);
  const progressEl = $('[data-dom-progress]', section);
  const n = DOMAINS.length;
  $('.domains__count span', section).textContent = `/ ${String(n).padStart(2, '0')}`;

  track.innerHTML = DOMAINS.map((d, i) => `
    <li class="dom" aria-roledescription="slide" aria-label="${i + 1} of ${n}: ${d.name}">
      <figure class="dom__art">
        <img src="media/services/${d.img}.webp" alt="${d.name}" loading="lazy" decoding="async" draggable="false" />
        <span class="dom__tag">${d.tag}</span>
      </figure>
      <div class="dom__info">
        <span class="dom__n">Domain ${String(i + 1).padStart(2, '0')}</span>
        <h3>${d.name}</h3>
        <p>${d.text}</p>
      </div>
    </li>`).join('');
  const slides = $$('.dom', track);
  const imgs = slides.map((sl) => $('img', sl));

  let x = 0; // current offset (px, negative = scrolled right)
  let target = 0;
  let active = -1;
  let positions = [];
  let maxX = 0;
  let dragging = false;
  let startX = 0;
  let startTarget = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = 0;
  let visible = false;
  let idleSince = performance.now();

  function measure() {
    const pad = slides[0].offsetLeft;
    positions = slides.map((sl) => -(sl.offsetLeft - pad));
    maxX = Math.min(0, -(track.scrollWidth - viewport.clientWidth));
    target = clamp(target);
  }
  const clamp = (v) => Math.max(Math.min(v, 0), Math.min(maxX, positions[n - 1] ?? 0));
  const nearest = (v) => positions.reduce((best, p, i) => (Math.abs(p - v) < Math.abs(positions[best] - v) ? i : best), 0);

  function goToSlide(i) {
    i = (i + n) % n;
    target = clamp(positions[i]);
    idleSince = performance.now();
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    slides.forEach((sl, k) => sl.classList.toggle('is-active', k === i));
    scramble(indexEl, String(i + 1).padStart(2, '0'), { duration: 0.35 });
    scramble(lordEl, DOMAINS[i].lord, { duration: 0.5 });
  }

  viewport.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    startX = lastX = e.clientX;
    startTarget = target;
    lastT = performance.now();
    velocity = 0;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    // rubber band past the ends
    let t = startTarget + dx;
    const lo = Math.min(maxX, positions[n - 1]);
    if (t > 0) t *= 0.35;
    else if (t < lo) t = lo + (t - lo) * 0.35;
    target = t;
    velocity = (e.clientX - lastX) / Math.max(1, now - lastT);
    lastX = e.clientX;
    lastT = now;
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('is-dragging');
    // fling with inertia, then snap to the closest slide
    goToSlide(nearest(clamp(target + velocity * 260)));
  };
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('click', (e) => { if (moved > 6) e.preventDefault(); }, true);
  viewport.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // leave vertical scrolling alone
    e.preventDefault();
    target = clamp(target - e.deltaX);
    clearTimeout(viewport._snap);
    viewport._snap = setTimeout(() => goToSlide(nearest(target)), 160);
  }, { passive: false });
  viewport.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goToSlide(active + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goToSlide(active - 1); }
  });
  $('[data-dom-prev]', section).addEventListener('click', () => goToSlide(active - 1));
  $('[data-dom-next]', section).addEventListener('click', () => goToSlide(active + 1));

  addEventListener('resize', () => { measure(); goToSlide(active < 0 ? 0 : active); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; idleSince = performance.now(); }).observe(viewport);

  gsap.ticker.add(() => {
    if (!positions.length) return;
    const k = dragging ? 0.35 : 0.09;
    x += (target - x) * k;
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    const vw = viewport.clientWidth;
    slides.forEach((sl, i) => {
      // parallax: the painting drifts against the movement
      const centre = sl.offsetLeft + x + sl.offsetWidth / 2;
      const off = (centre - vw / 2) / vw;
      imgs[i].style.setProperty('--px', `${(-off * 9).toFixed(2)}%`);
      sl.style.opacity = String(Math.max(0.35, 1 - Math.abs(off) * 0.55));
    });
    setActive(nearest(x));
    const lo = Math.min(maxX, positions[n - 1]) || -1;
    progressEl.style.transform = `scaleX(${Math.min(1, Math.max(0.06, x / lo)).toFixed(3)})`;
    // autoplay while on screen and untouched
    if (visible && !dragging && !reduceMotion && performance.now() - idleSince > 5200) goToSlide(active + 1);
  });

  // title lines rise in
  const lines = $$('.domains__line', section).map((el) => {
    const inner = document.createElement('span');
    inner.innerHTML = el.innerHTML;
    el.replaceChildren(inner);
    return inner;
  });
  if (!reduceMotion) {
    gsap.set(lines, { yPercent: 110 });
    gsap.set(slides, { autoAlpha: 0, x: 80 });
    ScrollTrigger.create({
      trigger: section, start: 'top 70%', once: true,
      onEnter: () => {
        gsap.to(lines, { yPercent: 0, duration: 1.4, stagger: 0.08, ease: 'expo.out' });
        gsap.to(slides, { autoAlpha: 1, x: 0, duration: 1.2, stagger: 0.06, ease: 'expo.out', clearProps: 'opacity,visibility,transform' });
      },
    });
  }

  const ready = () => { measure(); goToSlide(0); x = target; };
  if (document.readyState === 'complete') ready();
  else addEventListener('load', ready, { once: true });
  imgs[0].addEventListener('load', measure, { once: true });
}

// ==========================================================
// 08 · PACTS
// ==========================================================
const LAUNCH = Date.UTC(2027, 7, 13, 0, 0, 0);

function initPacts() {
  const section = $('#pacts');
  const lines = $$('.editions__line', section).map((el) => {
    const inner = document.createElement('span');
    inner.textContent = el.textContent;
    el.replaceChildren(inner);
    return inner;
  });
  if (!reduceMotion) {
    gsap.set(lines, { yPercent: 110 });
    gsap.set('.edition', { autoAlpha: 0, y: 40 });
    ScrollTrigger.create({ trigger: '.editions__head', start: 'top 82%', once: true, onEnter: () => gsap.to(lines, { yPercent: 0, duration: 1.4, stagger: 0.08, ease: 'expo.out' }) });
    ScrollTrigger.create({ trigger: '.editions__grid', start: 'top 85%', once: true, onEnter: () => gsap.to('.edition', { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.1, ease: 'expo.out' }) });
  }

  const cd = Object.fromEntries($$('[data-cd]', section).map((el) => [el.dataset.cd, el]));
  const pad = (v, n = 2) => String(v).padStart(n, '0');
  const tick = () => {
    const s = Math.floor(Math.max(0, LAUNCH - Date.now()) / 1000);
    cd.d.textContent = pad(Math.floor(s / 86400), 3);
    cd.h.textContent = pad(Math.floor((s % 86400) / 3600));
    cd.m.textContent = pad(Math.floor((s % 3600) / 60));
    cd.s.textContent = pad(s % 60);
  };
  tick();
  setInterval(tick, 1000);

  const radios = $$('[role="radio"]', $('[data-platforms]', section));
  const labels = $$('[data-platform-label]', section);
  const pick = (btn, focus = false) => {
    for (const r of radios) {
      const on = r === btn;
      r.setAttribute('aria-checked', String(on));
      r.tabIndex = on ? 0 : -1;
    }
    for (const l of labels) l.textContent = `on ${btn.dataset.platform}`;
    if (focus) btn.focus();
  };
  radios.forEach((r, i) => {
    r.addEventListener('click', () => pick(r));
    r.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      pick(radios[(i + dir + radios.length) % radios.length], true);
    });
  });
  pick(radios[0]);

  for (const a of $$('[data-preorder]', section)) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const tier = a.closest('.edition')?.querySelector('h3')?.textContent ?? '';
      goTo('#footer', () => {
        const msg = $('[data-newsletter-msg]');
        msg.classList.remove('is-error');
        msg.textContent = `Reservations open with the next teaser. Take the vow to get the ${tier} link first.`;
        $('#nl-email')?.focus({ preventScroll: true });
      });
    });
  }
}

// ==========================================================
// FOOTER, MENU, TEASER
// ==========================================================
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function initFooter() {
  const form = $('[data-newsletter]');
  const msg = $('[data-newsletter-msg]');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('input[type="email"]', form);
    if (!EMAIL.test(input.value.trim())) {
      msg.classList.add('is-error');
      msg.textContent = 'That address will never reach the shadow. Check it and try again.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    msg.classList.remove('is-error');
    msg.textContent = 'Vow taken. Watch your inbox, wanderer.';
    form.reset();
  });
  const letters = $$('[data-footer-mark] .footer__mark-line > span');
  if (!reduceMotion && letters.length) {
    gsap.set(letters, { yPercent: 110 });
    ScrollTrigger.create({ trigger: '[data-footer-mark]', start: 'top 92%', once: true, onEnter: () => gsap.to(letters, { yPercent: 0, duration: 1.5, stagger: 0.055, ease: 'expo.out' }) });
  }
  $('[data-to-top]')?.addEventListener('click', () => goTo(0));
}

const MENU_OPEN = 'M3 4.5h6M3 7.5h6';
const MENU_CLOSE = 'M3.5 3.5l5 5M8.5 3.5l-5 5';
function initMenu() {
  const menu = $('[data-menu]');
  const toggle = $('[data-menu-toggle]');
  const path = $('path', toggle);
  const links = $$('[data-menu-link]', menu);
  let open = false;
  function set(v, { restoreFocus = true } = {}) {
    if (v === open) return;
    open = v;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    path.setAttribute('d', open ? MENU_CLOSE : MENU_OPEN);
    gsap.killTweensOf(menu);
    if (open) {
      menu.hidden = false;
      gsap.set(menu, { opacity: 1 });
      lenis?.stop();
      if (!reduceMotion) {
        gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' });
        gsap.fromTo(links, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, stagger: 0.045, ease: 'expo.out' });
      }
      links[0].focus({ preventScroll: true });
    } else {
      lenis?.start();
      const hide = () => { menu.hidden = true; };
      if (reduceMotion) hide();
      else gsap.to(menu, { opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: hide });
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }
  }
  toggle.addEventListener('click', () => set(!open));
  addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') set(false);
    if (e.key === 'Tab') {
      const items = [toggle, ...links];
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    }
  });
  for (const a of links) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      set(false, { restoreFocus: false });
      goTo(a.getAttribute('href'));
    });
  }
}

function initTeaser() {
  const modal = $('[data-trailer-modal]');
  const video = $('[data-trailer-video]');
  const caption = $('[data-trailer-caption]');
  let clip = 0;
  const playClip = (i) => {
    clip = i % TRAILER.length;
    video.src = TRAILER[clip].src;
    caption.textContent = TRAILER[clip].caption;
    video.play().catch(() => {});
  };
  video.addEventListener('ended', () => playClip(clip + 1));
  const open = () => {
    modal.hidden = false;
    lenis?.stop();
    gsap.fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
    playClip(0);
  };
  const close = () => {
    video.pause();
    gsap.to(modal, { opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: () => { modal.hidden = true; } });
    lenis?.start();
  };
  $('[data-trailer]').addEventListener('click', open);
  $('[data-trailer-close]').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
}

initRealm();
const contracts = initContracts();
initWay();
initDomains();
initPacts();
initFooter();
initMenu();
initTeaser();

// ==========================================================
// LOADER / ENTER GATE
// ==========================================================
const music = new Soundtrack({ button: $('[data-sound]') });
const ring = $('[data-loader-ring]');
const RING = 2 * Math.PI * 92;
const pct = $('[data-loader-pct]');
const label = $('[data-loader-label]');
let loaded = 0;
function setLoad(v) {
  loaded = Math.max(loaded, v);
  gsap.to(ring, { strokeDashoffset: RING * (1 - loaded), duration: 0.6, ease: 'power2.out', overwrite: true });
  pct.textContent = `${Math.round(loaded * 100)}%`;
}

// rotating loading lines
const ticker = $('[data-loader-ticker]');
const TICKS = ['Forging the steel', 'Binding the mask', 'Lighting the lanterns', 'Opening the gate', 'Waking the demon'];
let tickIndex = 0;
const tickTimer = setInterval(() => {
  tickIndex = (tickIndex + 1) % TICKS.length;
  scramble(ticker, TICKS[tickIndex], { duration: 0.5 });
}, 1300);

// embers drifting up behind the seal
const emberCanvas = $('[data-loader-embers]');
const ectx = emberCanvas.getContext('2d');
let embersOn = true;
const embers = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 2, v: 0.02 + Math.random() * 0.06, p: Math.random() * 6.28 }));
function drawEmbers(t) {
  if (!embersOn) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = emberCanvas.clientWidth;
  const h = emberCanvas.clientHeight;
  if (emberCanvas.width !== Math.round(w * dpr)) { emberCanvas.width = Math.round(w * dpr); emberCanvas.height = Math.round(h * dpr); }
  ectx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ectx.clearRect(0, 0, w, h);
  ectx.globalCompositeOperation = 'lighter';
  for (const e of embers) {
    e.y -= e.v / 60;
    if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); }
    const x = (e.x + Math.sin(t / 1400 + e.p) * 0.015) * w;
    const y = e.y * h;
    const a = (0.35 + 0.35 * Math.sin(t / 300 + e.p * 3)) * Math.min(1, (1 - e.y) * 3);
    const g = ectx.createRadialGradient(x, y, 0, x, y, e.s * 4);
    g.addColorStop(0, `rgba(255,150,80,${a})`);
    g.addColorStop(0.4, `rgba(255,60,30,${a * 0.5})`);
    g.addColorStop(1, 'rgba(255,40,20,0)');
    ectx.fillStyle = g;
    ectx.fillRect(x - e.s * 4, y - e.s * 4, e.s * 8, e.s * 8);
  }
  requestAnimationFrame(drawEmbers);
}
requestAnimationFrame(drawEmbers);

// the katana comes spinning in from the dark, then hovers while the demon loads
const katana = $('[data-loader-katana]');
gsap.set(katana, { xPercent: -50, yPercent: -50 });
const katanaIn = gsap.timeline({ delay: 0.2 });
katanaIn
  .fromTo(katana,
    { x: () => -innerWidth * 0.75, y: () => -innerHeight * 0.45, rotation: -1260, scale: 0.35, autoAlpha: 0 },
    { x: 0, y: 0, rotation: -14, scale: 1, autoAlpha: 1, duration: 2.6, ease: 'expo.out' })
  .to(katana, { rotation: -11, y: -8, duration: 2.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });

// in-engine renders fade through behind the loader
const montage = $$('[data-loader-montage] img');
let montageIndex = 0;
gsap.to(montage[0], { opacity: 1, duration: 1.2 });
const montageTimer = setInterval(() => {
  const prev = montage[montageIndex];
  montageIndex = (montageIndex + 1) % montage.length;
  const next = montage[montageIndex];
  gsap.to(prev, { opacity: 0, duration: 1.4, ease: 'power2.inOut' });
  gsap.fromTo(next, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 1.6, ease: 'power2.out' });
}, 1800);

gsap.set('.wordmark__char', { yPercent: 110 });
gsap.set(['.hero__statements p', '.topbar > *', '.hud > *'], { autoAlpha: 0 });

try {
  await hero.load('models/akuma-warrior.glb', (v) => setLoad(v * 0.94));
} catch (err) {
  label.textContent = 'Could not load the warrior';
  console.error(err);
}
if (!hero.noWebGL) {
  await document.fonts.load('500 100px Archivo').catch(() => {});
  await document.fonts.ready;
  hero.attachWordmark(new GLWordmark({ wordmark: $('.wordmark'), line: $('.wordmark__line'), chars: $$('.wordmark__char') }));
  document.body.classList.add('gl-wordmark');
}
setLoad(1);
label.textContent = hero.noWebGL ? 'WebGL unavailable — 3D disabled' : 'The demon stirs';
hero.start();

clearInterval(tickTimer);
scramble(ticker, hero.noWebGL ? 'Running without 3D' : 'Ready when you are');
const actions = $('[data-loader-actions]');
actions.hidden = false;
gsap.from(actions.children, { autoAlpha: 0, y: 10, duration: 0.7, stagger: 0.1, ease: 'power3.out' });
let entered = false;
for (const btn of $$('[data-enter]')) btn.addEventListener('click', () => enter(btn.dataset.enter === 'sound'), { once: true });

function enter(withSound) {
  if (entered) return;
  entered = true;
  if (withSound) music.play();
  document.body.classList.remove('is-loading');
  lenis?.start();
  // a katana slash cuts the gate in two, then the halves fall away
  const angle = (Math.atan2(-0.16 * innerHeight, innerWidth) * 180) / Math.PI;
  const tl = gsap.timeline();
  katanaIn.kill();
  clearInterval(montageTimer);
  tl.to('[data-loader-ui]', { autoAlpha: 0, scale: 0.97, duration: 0.45, ease: 'power2.in' }, 0)
    .to('[data-loader-montage]', { autoAlpha: 0, duration: 0.5 }, 0)
    .to('[data-loader-embers]', { autoAlpha: 0, duration: 0.6 }, 0.1)
    // one last whirl, then the blade cuts along the slash line and flies off
    .to(katana, { rotation: '+=720', scale: 1.15, duration: 0.55, ease: 'power2.in' }, 0)
    .set(katana, { rotation: angle }, 0.55)
    .to(katana, { x: () => innerWidth * 0.9, y: () => Math.tan((angle * Math.PI) / 180) * innerWidth * 0.9, autoAlpha: 0, duration: 0.45, ease: 'power3.in' }, 0.55)
    .set('[data-loader-slash]', { rotation: angle, transformOrigin: '0% 50%' }, 0)
    .fromTo('[data-loader-slash]', { scaleX: 0, autoAlpha: 1 }, { scaleX: 1, duration: 0.32, ease: 'power4.in' }, 0.6)
    .to('[data-loader-slash]', { autoAlpha: 0, duration: 0.4 }, 1.0)
    .to('.loader__half--a', { yPercent: -62, xPercent: -4, rotation: -2.5, duration: 1.3, ease: 'expo.inOut' }, 0.9)
    .to('.loader__half--b', { yPercent: 62, xPercent: 4, rotation: -2.5, duration: 1.3, ease: 'expo.inOut' }, 0.9)
    .to('.loader__half', { autoAlpha: 0, duration: 0.5 }, 1.75)
    .set('[data-loader]', { display: 'none' })
    .add(() => { embersOn = false; })
    .to(hero.state, { reveal: 1, duration: 2.8, ease: 'power2.inOut' }, 0.7)
    .to('.wordmark__char', { yPercent: 0, duration: 1.5, stagger: 0.055, ease: 'expo.out' }, 1.1)
    .to('.hero__statements p', { autoAlpha: 1, duration: 1.1, stagger: 0.12, ease: 'power2.out' }, 1.6)
    .fromTo('.topbar > *', { y: -10 }, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.07, ease: 'power3.out' }, 1.5)
    .fromTo('.hud > *', { y: 10 }, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.07, ease: 'power3.out' }, 1.65);
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 300));
  tl.eventCallback('onComplete', () => idle(() => contracts.create().then(() => ScrollTrigger.refresh()), { timeout: 2000 }));
}
