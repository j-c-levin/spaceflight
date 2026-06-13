import * as THREE from 'three';

// ---------------------------------------------------------------------------
// JumpGate: a course of glowing rings leading to a portal. Fly through the
// rings IN ORDER, each within a shared countdown; let the timer expire mid-run
// and the whole course resets. Clear them all and the portal powers up, then
// goes online. Built into a child group of the system group.
// ---------------------------------------------------------------------------

const POWER_TIME = 1.0;

// per-state ring colors
const COL_ARMED = 0x3ee6ff;   // bright cyan — the ring you must hit next
const COL_CLEARED = 0x5bff9b; // green tint — already passed
const COL_FUTURE = 0x2a4a66;  // dim blue — not yet armed
const COL_PORTAL = 0x9b6bff;  // violet portal

export class JumpGate {
  constructor(parent, def, glowTex) {
    this.def = def;
    this.glowTex = glowTex;

    this.group = new THREE.Group();
    parent.add(this.group);

    // ---- local frame from the def ----
    const center = new THREE.Vector3(...def.center);
    const facing = new THREE.Vector3(...def.facing).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(facing, up).normalize();
    this.center = center;
    this.facing = facing;

    // ---- rings along a banked S-curve marching toward the portal ----
    const N = def.rings;
    this.rings = [];
    for (let i = 0; i < N; i++) {
      const f = N > 1 ? i / (N - 1) : 0;
      const dist = def.arcRadius * (1 - f);
      const lateral = Math.sin(f * def.arcSpan * Math.PI) * def.arcRadius * 0.22;
      const vertical = Math.sin(f * Math.PI) * 90;
      const pos = center.clone()
        .addScaledVector(facing, -dist)
        .addScaledVector(right, lateral)
        .addScaledVector(up, vertical);
      const normal = facing.clone().normalize();

      const material = new THREE.MeshBasicMaterial({
        color: COL_FUTURE,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const geo = new THREE.TorusGeometry(def.ringHole, def.ringHole * 0.06, 16, 64);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.copy(pos);
      // A torus lies in its local XY plane with axis +Z; lookAt aims +Z down
      // the travel axis so the hole opens along `normal`.
      mesh.lookAt(pos.clone().add(normal));
      this.group.add(mesh);

      this.rings.push({ mesh, pos, normal, hole: def.ringHole, material });
    }

    // ---- portal at the course end ----
    this.portal = new THREE.Group();
    this.portal.position.copy(center);
    this.portal.lookAt(center.clone().add(facing));
    this.group.add(this.portal);

    this.portalRingMat = new THREE.MeshBasicMaterial({
      color: COL_PORTAL,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const portalRing = new THREE.Mesh(
      new THREE.TorusGeometry(def.ringHole * 2.0, def.ringHole * 0.12, 20, 96),
      this.portalRingMat
    );
    this.portal.add(portalRing);

    this.portalDiscMat = new THREE.MeshBasicMaterial({
      color: COL_PORTAL,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const portalDisc = new THREE.Mesh(
      new THREE.CircleGeometry(def.ringHole * 1.9, 64),
      this.portalDiscMat
    );
    this.portal.add(portalDisc);

    // ---- state ----
    this.total = def.rings;
    this.index = 0;
    this.timerMax = 8.0;
    this.timer = this.timerMax;
    this.phase = 'running'; // running | powering | online
    this.powerT = 0;
    this._prevSide = null;
    this._t = 0; // local clock for pulsing
    this.onClear = null;

    this._applyVisuals();
  }

  get progress() {
    return {
      index: this.index,
      total: this.total,
      timer: this.timer,
      timerMax: this.timerMax,
      phase: this.phase,
    };
  }

  // The portal sits at `center` within the system group, which lives at the
  // origin, so its local position equals its world position.
  get portalPosition() { return this.center; }

  get online() { return this.phase === 'online'; }

  reset() {
    this.index = 0;
    this.timer = this.timerMax;
    this.phase = 'running';
    this.powerT = 0;
    this._prevSide = null;
    this._applyVisuals();
  }

  // Recolor every ring per its state and refresh the portal glow baseline.
  _applyVisuals() {
    for (let i = 0; i < this.rings.length; i++) {
      const m = this.rings[i].material;
      if (i < this.index) {
        m.color.set(COL_CLEARED);
        m.opacity = 0.55;
      } else if (i === this.index && this.phase === 'running') {
        m.color.set(COL_ARMED);
        m.opacity = 1.0;
      } else {
        m.color.set(COL_FUTURE);
        m.opacity = 0.45;
      }
    }
  }

  _clearRing() {
    this.index++;
    this.timer = this.timerMax;
    this._prevSide = null;
    if (this.index >= this.total) {
      this.phase = 'powering';
      this.powerT = 0;
    }
    this._applyVisuals();
    this.onClear?.(this.index);
  }

  update(dt, shipPos) {
    this._t += dt;

    if (this.phase === 'online') {
      this.portal.rotation.z += dt * 2.4;
      return;
    }

    if (this.phase === 'powering') {
      this.powerT += dt;
      const k = Math.min(1, this.powerT / POWER_TIME);
      this.portal.rotation.z += dt * (3 + k * 9);
      this.portalDiscMat.opacity = 0.05 + k * 0.85;
      this.portalRingMat.opacity = 0.55 + k * 0.45;
      if (this.powerT >= POWER_TIME) this.phase = 'online';
      return;
    }

    // running: idle portal spin
    this.portal.rotation.z += dt * 0.8;

    // pulse the armed ring
    const armed = this.rings[this.index];
    if (armed) {
      armed.material.opacity = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(this._t * 6.0));
    }

    // detection for the armed ring only
    if (armed) {
      const d = shipPos.clone().sub(armed.pos).dot(armed.normal);
      const side = Math.sign(d);
      if (this._prevSide !== null && side !== this._prevSide && side !== 0) {
        const radial = shipPos.clone().sub(armed.pos);
        radial.addScaledVector(armed.normal, -radial.dot(armed.normal));
        if (radial.length() < armed.hole) {
          this._clearRing();
          return;
        }
      }
      this._prevSide = side;
    }

    // shared countdown
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.index > 0) {
        this.reset(); // expired mid-run
      } else {
        this.timer = this.timerMax; // don't punish before the run starts
      }
    }
  }
}
