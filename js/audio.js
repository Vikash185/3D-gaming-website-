// Original procedural soundtrack: a dark taiko / koto / shakuhachi loop rendered once
// with an OfflineAudioContext, then looped. No audio file needed.
// To use your own track instead, pass { src: 'audio/your-song.mp3' }.

const BPM = 68;
const BARS = 8;
const BEAT = 60 / BPM;
const LOOP = BARS * 4 * BEAT;

// D "In" (miyako-bushi) scale: D Eb G A Bb
const IN_SCALE = [0, 1, 5, 7, 8];
const D2 = 73.42;
const hz = (base, semis) => base * 2 ** (semis / 12);
const scaleNote = (degree, octave = 0) => {
  const n = IN_SCALE.length;
  const o = Math.floor(degree / n) + octave;
  return IN_SCALE[((degree % n) + n) % n] + o * 12;
};

let seed = 1603;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function impulse(ctx, seconds = 3.2, decay = 2.6) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return b;
}

function taiko(ctx, out, noise, t, gain = 1, pitch = 1) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(118 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(46 * pitch, t + 0.35);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.95 * gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 1.2);
  // skin slap
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 900;
  f.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.32 * gain, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  n.connect(f).connect(ng).connect(out);
  n.start(t, rand());
  n.stop(t + 0.15);
}

function rimClick(ctx, out, noise, t, gain = 1) {
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.18 * gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(f).connect(g).connect(out);
  n.start(t, rand());
  n.stop(t + 0.06);
}

function koto(ctx, out, t, freq, gain = 1, pan = 0) {
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 9, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  for (const [type, mult, amp] of [['triangle', 1, 1], ['sawtooth', 1.002, 0.25], ['sine', 2, 0.35]]) {
    const o = ctx.createOscillator();
    o.type = type;
    // a little pitch bend down after the pluck, like a pressed koto string
    o.frequency.setValueAtTime(freq * mult * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(freq * mult, t + 0.08);
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + 2.7);
  }
  lp.connect(g).connect(p).connect(out);
}

function flute(ctx, out, noise, t, freq, dur, gain = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11 * gain, t + 0.35);
  g.gain.setValueAtTime(0.1 * gain, t + dur - 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 0.97, t);
  o.frequency.linearRampToValueAtTime(freq, t + 0.25); // meri: bend up into the note
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2;
  const vg = ctx.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(freq * 0.012, t + dur * 0.6);
  vib.connect(vg).connect(o.frequency);
  o.connect(g);
  // breath
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * 2;
  bp.Q.value = 6;
  const ng = ctx.createGain();
  ng.gain.value = 0.5;
  n.connect(bp).connect(ng).connect(g);
  g.connect(out);
  for (const s of [o, vib]) { s.start(t); s.stop(t + dur + 0.1); }
  n.start(t, rand());
  n.stop(t + dur + 0.1);
}

function bell(ctx, out, t, freq, gain = 1) {
  for (const [ratio, amp, decay] of [[1, 1, 6], [2.76, 0.5, 3.5], [5.4, 0.25, 2], [8.93, 0.12, 1.2]]) {
    const o = ctx.createOscillator();
    o.frequency.value = freq * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * amp * gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + decay + 0.1);
  }
}

function drone(ctx, out, len) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  lp.Q.value = 2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / (LOOP / 2); // completes whole cycles per loop
  const lg = ctx.createGain();
  lg.gain.value = 120;
  lfo.connect(lg).connect(lp.frequency);
  const g = ctx.createGain();
  g.gain.value = 0.13;
  for (const [f, type, amp] of [[D2 / 2, 'sine', 1.2], [D2, 'sawtooth', 0.45], [D2 * 1.498, 'sawtooth', 0.22], [D2 * 1.004, 'sawtooth', 0.35]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(0);
    o.stop(len);
  }
  lp.connect(g).connect(out);
  lfo.start(0);
  lfo.stop(len);
}

async function renderLoop(sampleRate = 44100) {
  // render one extra bar of tail so reverb from the end wraps cleanly
  const tail = 4 * BEAT;
  const ctx = new OfflineAudioContext(2, Math.ceil((LOOP + tail) * sampleRate), sampleRate);
  const noise = noiseBuffer(ctx);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.42;
  verb.connect(wet).connect(master);
  const dry = ctx.createGain();
  dry.connect(master);
  const send = ctx.createGain();
  send.connect(verb);
  const bus = ctx.createGain();
  bus.connect(dry);
  bus.connect(send);

  drone(ctx, bus, LOOP + tail);

  for (let bar = 0; bar < BARS; bar++) {
    const b0 = bar * 4 * BEAT;
    const big = bar % 4 === 0;
    // taiko: heavy on 1, answer on the "and" of 2, rolls into the phrase end
    taiko(ctx, bus, noise, b0, big ? 1.1 : 0.85, 1);
    taiko(ctx, bus, noise, b0 + 1.5 * BEAT, 0.45, 1.35);
    taiko(ctx, bus, noise, b0 + 2 * BEAT, 0.7, 1);
    if (bar % 2 === 1) {
      taiko(ctx, bus, noise, b0 + 3 * BEAT, 0.5, 1.2);
      taiko(ctx, bus, noise, b0 + 3.5 * BEAT, 0.6, 1.2);
      taiko(ctx, bus, noise, b0 + 3.75 * BEAT, 0.75, 1.1);
    }
    for (let k = 0; k < 8; k++) if (k % 2 === 1 && rand() < 0.7) rimClick(ctx, bus, noise, b0 + k * 0.5 * BEAT, 0.6 + rand() * 0.4);

    // koto phrase: sparse plucks walking the In scale, resolving to D
    const steps = [0, 1, 1.5, 2.5, 3];
    let degree = 5 + Math.floor(rand() * 4);
    for (const s of steps) {
      if (rand() < 0.22 && s !== 0) continue;
      degree += Math.floor(rand() * 3) - 1;
      degree = Math.max(3, Math.min(11, degree));
      const note = bar === BARS - 1 && s === 3 ? 10 : degree;
      koto(ctx, bus, b0 + s * BEAT, hz(D2, scaleNote(note, 1)), 0.9, (rand() - 0.5) * 0.6);
      if (rand() < 0.25) koto(ctx, bus, b0 + s * BEAT + 0.06, hz(D2, scaleNote(note - 2, 1)), 0.45, 0.3);
    }
  }

  // shakuhachi lines over the second half
  flute(ctx, bus, noise, 4 * 4 * BEAT + 0.2, hz(D2, scaleNote(12, 0)), 5 * BEAT);
  flute(ctx, bus, noise, 5 * 4 * BEAT + 2 * BEAT, hz(D2, scaleNote(11, 0)), 3 * BEAT, 0.9);
  flute(ctx, bus, noise, 6 * 4 * BEAT + 0.5 * BEAT, hz(D2, scaleNote(13, 0)), 4 * BEAT);
  flute(ctx, bus, noise, 7 * 4 * BEAT + 1 * BEAT, hz(D2, scaleNote(10, 0)), 3 * BEAT, 0.8);

  // temple bell at the top of the loop
  bell(ctx, bus, 0.02, hz(D2, 24), 1);
  bell(ctx, bus, 4 * 4 * BEAT, hz(D2, 31), 0.6);

  const rendered = await ctx.startRendering();
  // fold the tail back onto the start so the loop is seamless
  const loopLen = Math.round(LOOP * sampleRate);
  const out = new AudioBuffer({ numberOfChannels: 2, length: loopLen, sampleRate });
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(0, loopLen));
    for (let i = loopLen; i < src.length; i++) dst[i - loopLen] += src[i];
  }
  return out;
}

export class Soundtrack {
  constructor({ button, src = null, volume = 0.55 }) {
    this.src = src;
    this.button = button;
    this.bars = [...button.querySelectorAll('i')];
    this.label = button.querySelector('[data-sound-label]');
    this.volume = volume;
    this.playing = false;
    this.ctx = null;
    this.buffer = null;
    this.levels = new Float32Array(this.bars.length).fill(0.25);
    button.addEventListener('click', () => this.toggle());
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.playing) this.ctx.resume();
    });
    this.#meter();
  }

  async #init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.82;
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.gain.connect(this.analyser).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.buffer) {
      this.loading ??= (this.src
        ? fetch(this.src).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))
        : renderLoop(this.ctx.sampleRate)
      ).then((b) => { this.buffer = b; }).catch((err) => {
        console.warn('Soundtrack unavailable:', err);
        this.button.disabled = true;
        if (this.label) this.label.textContent = 'No sound';
      });
      await this.loading;
    }
    if (this.buffer && !this.source) {
      this.source = this.ctx.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.loop = true;
      this.source.connect(this.gain);
      this.source.start();
    }
  }

  async play() {
    this.playing = true;
    this.#sync();
    await this.#init();
    if (!this.buffer || !this.playing) return;
    const g = this.gain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.volume, t + 1.6);
  }

  pause() {
    this.playing = false;
    this.#sync();
    if (!this.ctx) return;
    const g = this.gain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.6);
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  #sync() {
    this.button.setAttribute('aria-pressed', String(this.playing));
    if (this.label) this.label.textContent = this.playing ? 'Sound on' : 'Sound off';
  }

  // the five little bars dance with the music
  #meter() {
    const loop = () => {
      if (this.analyser && this.ctx.state === 'running') this.analyser.getByteFrequencyData(this.freq);
      const n = this.bars.length;
      for (let i = 0; i < n; i++) {
        let target = 0.25;
        if (this.playing && this.freq) {
          const bin = Math.min(this.freq.length - 1, 1 + Math.round((i / (n - 1)) ** 1.6 * 14));
          target = 0.2 + (this.freq[bin] / 255) * 0.8;
        }
        this.levels[i] += (target - this.levels[i]) * 0.25;
        this.bars[i].style.transform = `scaleY(${this.levels[i].toFixed(3)})`;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
