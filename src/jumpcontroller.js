import * as THREE from 'three';

// ---------------------------------------------------------------------------
// JumpController: the heart of the jump feature. Watches the active system's
// gate; once it goes online (the ring course was flown), it takes ownership of
// the ship: locks controls, eases the ship into the portal while the warp FX
// builds to a flash, swaps the active system at the flash peak, drops the ship
// just outside the destination portal, then fades the flash and releases.
// ---------------------------------------------------------------------------

const PULL_TIME = 2.0;     // seconds the gate pulls the ship in
const ARRIVE_TIME = 1.0;   // seconds for the flash to fade after the swap
const ORIGIN = new THREE.Vector3(0, 0, 0);

export class JumpController {
  constructor(game, warp) {
    this.game = game;
    this.warp = warp;
    this.state = 'idle';     // idle | pulling | arriving
    this.t = 0;
    this._from = new THREE.Vector3();
  }

  get jumping() { return this.state !== 'idle'; }

  update(dt) {
    const g = this.game;
    if (this.state === 'idle') {
      if (g.world.activeSystem.gate.online) this._begin();
      return;
    }
    this.t += dt;
    if (this.state === 'pulling') {
      const portal = g.world.activeSystem.gate.portalPosition;
      const k = Math.min(this.t / PULL_TIME, 1);
      const ease = k * k;                       // accelerate into the portal
      g.ship.pos.lerpVectors(this._from, portal, ease);
      g.ship.root.position.copy(g.ship.pos);
      g.ship.root.lookAt(portal);               // face the portal as you're pulled in
      g.ship.vel.set(0, 0, 0); g.ship.speed = 0;
      this.warp.update(dt, k * 0.5);            // phase 0 -> 0.5 (flash builds to peak)
      if (k >= 1) { this._swap(); this.state = 'arriving'; this.t = 0; }
    } else if (this.state === 'arriving') {
      const k = Math.min(this.t / ARRIVE_TIME, 1);
      this.warp.update(dt, 0.5 + k * 0.5);      // phase 0.5 -> 1 (flash fades)
      if (k >= 1) this._end();
    }
  }

  _begin() {
    this.state = 'pulling';
    this.t = 0;
    this._from.copy(this.game.ship.pos);
    this.game.ship.controlsLocked = true;
    this.warp.start();
  }

  _swap() {
    const g = this.game;
    const targetId = g.world.activeSystem.def.gate.targetId;
    const targetIndex = g.world.systems.findIndex((s) => s.def.id === targetId);
    const dest = g.world.jumpTo(targetIndex);
    dest.gate.reset();
    // place the ship just outside the destination portal, facing inward
    const portal = dest.gate.portalPosition.clone();
    g.ship.pos.copy(portal);
    g.ship.root.position.copy(portal);
    g.ship.root.lookAt(ORIGIN);
    g.ship.vel.set(0, 0, 0);
    g.ship.speed = 0;
  }

  _end() {
    this.warp.stop();
    this.game.ship.controlsLocked = false;
    this.game.world.activeSystem.gate.reset();  // ensure the arrival system's gate is fresh
    this.state = 'idle';
    this.t = 0;
  }
}
