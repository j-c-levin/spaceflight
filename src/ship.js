import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Flight tuning — the feel anchor from the spec.
// ---------------------------------------------------------------------------
export const FLIGHT = {
  maxSpeed: 80,            // full-throttle cruise (units/s)
  boostMult: 3.0,          // boost speed multiplier
  velLambda: 1.1,          // how fast velocity chases the target (inertia)
  throttleRampTime: 2.0,   // seconds from 0 to full throttle
  maxYawRate: 1.5,         // rad/s at full cursor deflection
  maxPitchRate: 1.2,
  maxBank: 0.62,           // ~35 degrees
  autoLevelRate: 0.9,      // rad/s max wings-leveling roll
  boostDrainTime: 4.0,     // seconds of boost from a full tank
};

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// A small, agile arrow-shaped craft: body, nose, broad swept wings, twin
// engines. NPCs use the same builder so they read as cousins of this ship.
export function buildShipMesh(hullColor, accentColor, scale = 1) {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    color: hullColor, roughness: 0.45, metalness: 0.35,
    emissive: hullColor, emissiveIntensity: 0.12,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor, roughness: 0.3, metalness: 0.4,
    emissive: accentColor, emissiveIntensity: 0.5,
  });

  // body (forward is -Z)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 3.2), hull);
  group.add(body);
  // nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 4), hull);
  nose.rotation.x = -Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.z = -2.3;
  group.add(nose);
  // canopy
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), accent);
  canopy.scale.set(1, 0.7, 1.6);
  canopy.position.set(0, 0.32, -0.6);
  group.add(canopy);
  // broad swept wings
  const wingGeo = new THREE.BoxGeometry(4.6, 0.12, 1.5);
  const wing = new THREE.Mesh(wingGeo, hull);
  wing.position.set(0, 0, 0.55);
  group.add(wing);
  // wing tips
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 1.1), accent);
    tip.position.set(side * 2.3, 0.12, 0.6);
    group.add(tip);
  }
  // tail fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.0), hull);
  fin.position.set(0, 0.5, 1.1);
  group.add(fin);

  // engine anchors (trail emit points) + glow
  group.userData.engines = [];
  for (const side of [-1, 1]) {
    const anchor = new THREE.Object3D();
    anchor.position.set(side * 0.55, 0, 1.7);
    group.add(anchor);
    group.userData.engines.push(anchor);
  }
  // wingtip anchors: contrail lines stream from these. Being far off the
  // hull's centerline, they read as crisp diverging lines even from astern.
  group.userData.tips = [];
  for (const side of [-1, 1]) {
    const anchor = new THREE.Object3D();
    anchor.position.set(side * 2.3, 0.12, 1.2);
    group.add(anchor);
    group.userData.tips.push(anchor);
  }
  group.scale.setScalar(scale);
  return group;
}

export class PlayerShip {
  constructor(scene, glowTex) {
    this.scene = scene;

    this.root = new THREE.Group();           // yaw+pitch only (stable horizon)
    this.mesh = buildShipMesh(0xd8e4f0, 0x3ee6ff);
    this.root.add(this.mesh);
    scene.add(this.root);

    // engine glow sprites that flare with throttle
    this.engineGlows = [];
    for (const anchor of this.mesh.userData.engines) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0x66ccff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      s.scale.setScalar(1.2);
      anchor.add(s);
      this.engineGlows.push(s);
    }

    // state
    this.pos = new THREE.Vector3(130, 10, 230); // inner system start
    this.vel = new THREE.Vector3();
    this.root.quaternion.setFromEuler(new THREE.Euler(0, 0.51, 0)); // facing the sun
    this.bank = 0;
    this.throttle = 0.45;                       // already moving from frame one
    this.boostEnergy = 1;
    this.boosting = false;
    this.speed = 0;

    this._fwd = new THREE.Vector3();
    this._targetVel = new THREE.Vector3();
    this._qStep = new THREE.Quaternion();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
  }

  forward(out = this._fwd) {
    out.set(0, 0, -1).applyQuaternion(this.root.quaternion);
    return out;
  }

  update(dt, input) {
    const c = input.cursor;

    // ---- throttle: ramps, never snaps ----
    const ramp = dt / FLIGHT.throttleRampTime;
    if (input.throttleUp) this.throttle += ramp;
    if (input.throttleDown) this.throttle -= ramp;
    if (input.wheelDelta !== 0) this.throttle -= input.wheelDelta * 0.12;
    this.throttle = THREE.MathUtils.clamp(this.throttle, 0, 1);

    // ---- boost energy: drains only; stations are the sole refill ----
    const wantBoost = input.boosting && this.boostEnergy > 0.02;
    this.boosting = wantBoost;
    if (wantBoost) {
      this.boostEnergy = Math.max(0, this.boostEnergy - dt / FLIGHT.boostDrainTime);
    }

    // ---- steering: local-axis rotation (the Freelancer model) ----
    // Cursor deflection sets constant pitch/yaw rates around the ship's OWN
    // axes, so a held cursor produces a steady, stable turn (a corkscrew in
    // the diagonal case) — never an oscillating pose. Loops are just pitch
    // held past vertical, and steering is always screen-correct, even
    // inverted, because the axes travel with the ship.
    const sx = c.x * (0.4 + 0.6 * Math.abs(c.x));
    const sy = c.y * (0.4 + 0.6 * Math.abs(c.y));
    const q = this.root.quaternion;
    q.multiply(this._qStep.setFromAxisAngle(Y_AXIS, -sx * FLIGHT.maxYawRate * dt));
    q.multiply(this._qStep.setFromAxisAngle(X_AXIS, sy * FLIGHT.maxPitchRate * dt));

    // gentle auto-level: roll toward wings-level so the flat solar system
    // stays readable after loops and spirals. Fades out near vertical so it
    // never fights a loop in progress.
    this._right.set(1, 0, 0).applyQuaternion(q);
    this._up.set(0, 1, 0).applyQuaternion(q);
    this.forward();
    const levelScale = 1 - this._fwd.y * this._fwd.y;
    const rollErr = Math.atan2(this._right.y, this._up.y);
    const maxStep = FLIGHT.autoLevelRate * levelScale * dt;
    q.multiply(this._qStep.setFromAxisAngle(Z_AXIS,
      THREE.MathUtils.clamp(-rollErr * 3 * dt, -maxStep, maxStep)));
    q.normalize();

    // ---- banking: rolls into turns, scaled by speed ----
    const speedFactor = THREE.MathUtils.clamp(this.speed / FLIGHT.maxSpeed, 0, 1);
    const targetBank = -c.x * FLIGHT.maxBank * speedFactor * (this.boosting ? 1.25 : 1);
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-8 * dt));
    this.mesh.rotation.z = this.bank;

    // ---- velocity: eases toward throttle target along forward ----
    const targetSpeed = this.throttle * FLIGHT.maxSpeed * (this.boosting ? FLIGHT.boostMult : 1);
    this.forward();
    this._targetVel.copy(this._fwd).multiplyScalar(targetSpeed);
    const blend = 1 - Math.exp(-FLIGHT.velLambda * dt);
    this.vel.lerp(this._targetVel, blend);
    this.pos.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();

    this.root.position.copy(this.pos);

    // engine glow flares with output (kept small — the trail is the show).
    // Flicker is a slow, gentle breathing, never a per-frame strobe.
    const flare = 0.4 + this.throttle * 0.6 + (this.boosting ? 0.7 : 0);
    const t = performance.now() / 1000;
    for (let i = 0; i < this.engineGlows.length; i++) {
      const g = this.engineGlows[i];
      const breathe = 1 + 0.05 * Math.sin(t * 5.5 + i * 1.7) + 0.03 * Math.sin(t * 8.3 + i);
      g.scale.setScalar(flare * breathe);
      g.material.color.setHex(this.boosting ? 0xaae8ff : 0x55aaff);
    }
  }
}
