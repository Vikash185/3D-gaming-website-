// Procedural in-place walk for the rigged oni (the GLB has a skeleton but no clips).
// Feet follow a planted treadmill path and the legs are solved with two-bone IK,
// so the soles stay on the floor instead of swinging like pendulums.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (x, mu, s) => Math.exp(-(((x - mu) / s) ** 2));
const lerp = THREE.MathUtils.lerp;

const DEFAULTS = {
  period: 1.3, // seconds per full stride (slow, heavy)
  stanceFraction: 0.62,
  stride: 0.29, // half the distance a planted foot travels
  track: 0.105, // feet distance from the centre line
  toeOut: 6 * DEG,
  heelStrikePitch: 16 * DEG,
  toeOffPitch: 34 * DEG,
  heelFlick: 0.055,
  toeClearance: 0.03,
  stanceKnee: 4 * DEG,
  loadingKnee: 7 * DEG,
  preSwingKnee: 34 * DEG,
  hipSway: 0.022,
  hipYaw: 5 * DEG,
  hipDrop: 3.5 * DEG,
  lean: 3.5 * DEG,
  armSwing: 12 * DEG,
  headTilt: 3 * DEG,
};

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class OniWalk {
  constructor(root, opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.bones = {};
    root.traverse((n) => { if (n.isBone) this.bones[n.name] = n; });
    const b = this.bones;
    this.armature = b.Hips.parent;
    this.time = 0;
    this.speed = 1;
    this.restHips = b.Hips.position.clone();

    // rest positions in armature space (all rest rotations are identity in this rig)
    const restPos = (name) => {
      const p = new THREE.Vector3();
      for (let n = b[name]; n && n !== this.armature; n = n.parent) p.add(n.position);
      return p;
    };

    this.legs = ['Left', 'Right'].map((side) => {
      const hip = restPos(`${side}UpperLeg`);
      const knee = restPos(`${side}LowerLeg`);
      const ankle = restPos(`${side}Foot`);
      const toes = restPos(`${side}Toes`);
      const thighRest = knee.clone().sub(hip).normalize();
      const ballForward = toes.z - ankle.z;
      return {
        side,
        sign: side === 'Left' ? 1 : -1,
        upper: b[`${side}UpperLeg`],
        lower: b[`${side}LowerLeg`],
        foot: b[`${side}Foot`],
        toes: b[`${side}Toes`],
        hipOffset: hip.clone().sub(restPos('Hips')),
        a: knee.distanceTo(hip),
        c: ankle.distanceTo(knee),
        thighRest,
        shinRest: ankle.clone().sub(knee).normalize(),
        restAngle: Math.atan2(thighRest.z, -thighRest.y),
        ankleY: ankle.y,
        heelToAnkle: new THREE.Vector3(0, ankle.y, 0.076),
        ballToAnkle: new THREE.Vector3(0, ankle.y, -ballForward),
        ballForward,
        swing: 0,
        pose: { ankle: new THREE.Vector3(), pitch: 0, toesFlat: false, stance: 0, load: 1 },
      };
    });

    this.coat = Object.keys(b)
      .filter((n) => n.startsWith('Coat'))
      .map((name) => ({ name, bone: b[name], value: 0 }));

    this._a = { ankle: new THREE.Vector3(), pitch: 0, toesFlat: false };
    this._b = { ankle: new THREE.Vector3(), pitch: 0, toesFlat: false };
    this._hipQ = new THREE.Quaternion();
    this._pelvis = { yaw: 0, roll: 0, sway: 0, tilt: 0 };
    this.bakePelvis();
  }

  pelvisMotion(ph) {
    const o = this.o;
    const p = this._pelvis;
    p.yaw = -o.hipYaw * Math.cos(TAU * ph);
    p.roll = o.hipDrop * Math.cos(TAU * (ph - 0.2));
    p.sway = o.hipSway * Math.cos(TAU * (ph - 0.3));
    p.tilt = o.lean * 0.5 + 1.2 * DEG * Math.cos(2 * TAU * (ph - 0.1));
    this._hipQ.setFromEuler(_e.set(p.tilt, p.yaw, p.roll, 'YXZ'));
    return p;
  }

  // Pre-compute a smooth pelvis height curve that keeps the loaded leg(s) on the ground.
  bakePelvis(n = 256) {
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ph = i / n;
      const { sway } = this.pelvisMotion(ph);
      for (const leg of this.legs) this.footPose(leg, (ph + (leg.sign > 0 ? 0 : 0.5)) % 1, leg.pose);
      raw[i] = this.solvePelvisHeight(sway);
    }
    // circular gaussian low-pass, then never rise above what the legs can reach
    const out = new Float32Array(n);
    const R = 14;
    for (let i = 0; i < n; i++) {
      let s = 0;
      let w = 0;
      for (let k = -R; k <= R; k++) {
        const g = Math.exp(-((k / (R * 0.5)) ** 2));
        s += raw[(i + k + n) % n] * g;
        w += g;
      }
      out[i] = Math.min(s / w, raw[i] + 0.004);
    }
    this.pelvisCurve = out;
  }

  pelvisHeight(ph) {
    const c = this.pelvisCurve;
    const n = c.length;
    const x = ph * n;
    const i = Math.floor(x) % n;
    const f = x - Math.floor(x);
    return c[i] * (1 - f) + c[(i + 1) % n] * f;
  }

  solvePelvisHeight(sway) {
    const o = this.o;
    const heights = [];
    let lowest = Infinity;
    for (const leg of this.legs) {
      const p = leg.pose;
      if (p.load <= 0) continue;
      const s = p.stance;
      const knee = s < 0 ? 2 * DEG : o.stanceKnee + o.loadingKnee * gauss(s, 0.2, 0.12) + o.preSwingKnee * sstep(0.48, 1, s) ** 1.5;
      const L2 = leg.a * leg.a + leg.c * leg.c + 2 * leg.a * leg.c * Math.cos(knee);
      const off = _v.copy(leg.hipOffset).applyQuaternion(this._hipQ);
      const dx = this.restHips.x + sway + off.x - p.ankle.x;
      const dz = this.restHips.z + off.z - p.ankle.z;
      const h = p.ankle.y + Math.sqrt(Math.max(0.01, L2 - dx * dx - dz * dz)) - off.y + (1 - p.load) * 0.25;
      heights.push(h);
      lowest = Math.min(lowest, h);
    }
    if (!heights.length) return this.restHips.y;
    let sum = 0;
    let wsum = 0;
    for (const h of heights) {
      const w = Math.exp(-(h - lowest) / 0.012);
      sum += h * w;
      wsum += w;
    }
    return Math.min(sum / wsum, this.restHips.y + 0.016);
  }

  stancePose(leg, t, out) {
    const o = this.o;
    const x = leg.sign * o.track;
    const z = o.stride * (1 - 2 * t);
    out.toesFlat = false;
    if (t < 0.16) {
      // heel strike: roll down onto the heel
      const pitch = o.heelStrikePitch * (1 - sstep(0, 0.16, t));
      const heel = _v.set(x, 0, z - leg.heelToAnkle.z);
      out.ankle.copy(leg.heelToAnkle).applyQuaternion(_q.setFromAxisAngle(X, -pitch)).add(heel);
      out.pitch = pitch;
    } else if (t < 0.55) {
      out.ankle.set(x, leg.ankleY, z);
      out.pitch = 0;
    } else {
      // toe off: peel the heel up around the ball of the foot
      const pitch = -o.toeOffPitch * sstep(0.55, 1, t) ** 1.25;
      const ball = _v.set(x, 0, z + leg.ballForward);
      out.ankle.copy(leg.ballToAnkle).applyQuaternion(_q.setFromAxisAngle(X, -pitch)).add(ball);
      out.pitch = pitch;
      out.toesFlat = true;
    }
    return out;
  }

  footPose(leg, t, out) {
    const o = this.o;
    const sf = o.stanceFraction;
    if (t < sf) {
      const s = t / sf;
      this.stancePose(leg, s, out);
      out.stance = s;
      out.load = 1 - sstep(0.82, 0.99, s);
      return out;
    }
    const u = (t - sf) / (1 - sf);
    const from = this.stancePose(leg, 1, this._a);
    const to = this.stancePose(leg, 0, this._b);
    const k = sstep(0, 1, u) * 0.85 + u * 0.15;
    out.ankle.lerpVectors(from.ankle, to.ankle, k);
    out.ankle.y = lerp(from.ankle.y, to.ankle.y, u)
      + o.heelFlick * gauss(u, 0.27, 0.17) * sstep(0, 0.12, u)
      + o.toeClearance * Math.sin(Math.PI * u);
    out.pitch = lerp(from.pitch, to.pitch, sstep(0.02, 0.9, u));
    out.toesFlat = false;
    out.stance = -1;
    out.load = sstep(0.4, 0.75, u);
    return out;
  }

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt * this.speed;
    const o = this.o;
    const b = this.bones;
    const ph = (((this.time / o.period) % 1) + 1) % 1;

    for (const bone of Object.values(b)) bone.quaternion.identity();

    const { yaw, roll, sway, tilt } = this.pelvisMotion(ph);
    for (const leg of this.legs) this.footPose(leg, (ph + (leg.sign > 0 ? 0 : 0.5)) % 1, leg.pose);

    b.Hips.position.set(this.restHips.x + sway, this.pelvisHeight(ph), this.restHips.z);
    b.Hips.quaternion.copy(this._hipQ);

    // spine counter-rotates the pelvis so the shoulders stay calm
    const breath = Math.sin(TAU * ph * 2 + 0.6) * 0.5 * DEG;
    b.Spine.quaternion.setFromEuler(_e.set(o.lean * 0.4 - tilt * 0.6 + breath, -yaw * 0.55, -roll * 0.6, 'YXZ'));
    b.Chest.quaternion.setFromEuler(_e.set(o.lean * 0.3, -yaw * 0.6, -roll * 0.3, 'YXZ'));
    b.UpperChest.quaternion.setFromEuler(_e.set(-breath * 0.5, -yaw * 0.45, -roll * 0.1, 'YXZ'));
    const residual = yaw * (1 - 0.55 - 0.6 - 0.45);
    b.Neck.quaternion.setFromEuler(_e.set(-o.lean * 0.4, -residual * 0.5, 0, 'YXZ'));
    const nod = Math.cos(2 * TAU * (ph - 0.08)) * 0.7 * DEG;
    b.Head.quaternion.setFromEuler(_e.set(o.headTilt - o.lean * 0.5 + nod, -residual * 0.5, 0, 'YXZ'));

    for (const [side, s] of [['Left', 1], ['Right', -1]]) {
      const swing = -s * Math.cos(TAU * (ph - 0.04));
      const a = o.armSwing * swing;
      const fwd = Math.max(0, swing);
      b[`${side}Shoulder`].quaternion.setFromEuler(_e.set(-a * 0.12, 0, 0));
      b[`${side}UpperArm`].quaternion.setFromEuler(_e.set(-a, s * 1.5 * DEG, s * 3 * DEG));
      b[`${side}LowerArm`].quaternion.setFromEuler(_e.set(-(7 * DEG + 13 * DEG * fwd), 0, 0));
      const lag = -s * Math.cos(TAU * (ph - 0.13));
      b[`${side}Hand`].quaternion.setFromEuler(_e.set(-o.armSwing * 0.3 * lag - 4 * DEG, 0, 0));
    }

    this.armature.updateWorldMatrix(true, true);
    for (const leg of this.legs) this.solveLeg(leg);

    // the coat panels trail the thighs
    const follow = 1 - Math.exp(-dt * 8);
    const [swL, swR] = this.legs.map((l) => l.swing);
    for (const c of this.coat) {
      const left = c.name.endsWith('L');
      const own = left ? swL : swR;
      const other = left ? swR : swL;
      let target;
      if (c.name.startsWith('CoatFront')) target = 0.55 * Math.max(own, 0) + 0.25 * Math.min(own, 0);
      else if (c.name.startsWith('CoatSide')) target = 0.38 * own + 0.06 * other;
      else target = 0.25 * Math.max(own, 0) + 0.6 * Math.min(own, 0) + 0.1 * Math.min(other, 0);
      c.value += (target - c.value) * follow;
      c.bone.quaternion.setFromEuler(_e.set(-c.value - tilt * 0.5, -yaw * 0.3, (left ? 1 : -1) * Math.abs(c.value) * 0.12));
    }
  }

  solveLeg(leg) {
    const o = this.o;
    const p = leg.pose;
    const arm = this.armature;
    const target = p.ankle.clone().applyMatrix4(arm.matrixWorld);
    const hip = leg.upper.getWorldPosition(new THREE.Vector3());
    const scale = arm.matrixWorld.getMaxScaleOnAxis();
    const a = leg.a * scale;
    const c = leg.c * scale;

    const toTarget = target.clone().sub(hip);
    const dist = THREE.MathUtils.clamp(toTarget.length(), Math.abs(a - c) + 1e-4, (a + c) * 0.9995);
    const dir = toTarget.normalize();
    const cosA = (a * a + dist * dist - c * c) / (2 * a * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

    // knees point forward (slightly out with the toes)
    const yawOut = leg.sign * o.toeOut;
    const pole = new THREE.Vector3(Math.sin(yawOut), 0, Math.cos(yawOut)).transformDirection(arm.matrixWorld);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();

    const knee = hip.clone().addScaledVector(dir, a * cosA).addScaledVector(pole, a * sinA);
    const ankle = hip.clone().addScaledVector(dir, dist);

    const parentQ = leg.upper.parent.getWorldQuaternion(new THREE.Quaternion());
    const parentInv = parentQ.clone().invert();
    const thighW = new THREE.Quaternion()
      .setFromUnitVectors(leg.thighRest.clone().applyQuaternion(parentQ), knee.clone().sub(hip).normalize())
      .multiply(parentQ);
    leg.upper.quaternion.copy(parentInv).multiply(thighW);

    const shinW = new THREE.Quaternion()
      .setFromUnitVectors(leg.shinRest.clone().applyQuaternion(thighW), ankle.clone().sub(knee).normalize())
      .multiply(thighW);
    leg.lower.quaternion.copy(thighW).invert().multiply(shinW);

    const armQ = arm.getWorldQuaternion(new THREE.Quaternion());
    const footW = new THREE.Quaternion()
      .setFromAxisAngle(Y, yawOut)
      .multiply(_q2.setFromAxisAngle(X, -p.pitch))
      .premultiply(armQ);
    leg.foot.quaternion.copy(shinW).invert().multiply(footW);

    if (p.toesFlat) {
      const toesW = new THREE.Quaternion().setFromAxisAngle(Y, yawOut).premultiply(armQ);
      leg.toes.quaternion.copy(footW).invert().multiply(toesW);
    } else {
      leg.toes.quaternion.identity();
    }

    // thigh swing angle (relative to rest) drives the coat
    const local = knee.clone().sub(hip).normalize().applyQuaternion(parentInv);
    leg.swing = Math.atan2(local.z, -local.y) - leg.restAngle;
  }
}
