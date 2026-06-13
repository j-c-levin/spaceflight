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
    this._portal = new THREE.Vector3();
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
      const k = Math.min(this.t / PULL_TIME, 1);
      const ease = k * k;                       // accelerate into the portal
      g.ship.pos.lerpVectors(this._from, this._portal, ease);
      // Nose stays pointed INTO the portal during the pull (faceToward accounts
      // for the ship's -Z forward); orientation is left as-is during arriving.
      g.ship.faceToward(this._portal);
      this.warp.update(dt, k * 0.5);            // phase 0 -> 0.5 (flash builds to peak)
      if (k >= 1) {
        this._swap();
        this.state = 'arriving';
        this.t = 0;
      }
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
    // Capture portal position once so the pulling branch doesn't traverse the scene graph each frame.
    this._portal.copy(this.game.world.activeSystem.gate.portalPosition);
    // Zero velocity once here; ship.update early-returns while controlsLocked so it won't re-integrate.
    this.game.ship.vel.set(0, 0, 0);
    this.game.ship.speed = 0;
    this.game.ship.controlsLocked = true;
    this.warp.start();
  }

  _swap() {
    const g = this.game;
    const targetId = g.world.activeSystem.def.gate.targetId;
    const targetIndex = g.world.systems.findIndex((s) => s.def.id === targetId);
    if (targetIndex === -1) {
      console.error('JumpController: no system with id', targetId);
      this._end();
      return;
    }
    const dest = g.world.jumpTo(targetIndex);
    dest.gate.reset();
    // Emerge INSIDE the destination system (well inside its gate course), facing
    // the stars — so you arrive "in" the new system rather than out at the far
    // portal, and don't clip the armed first ring on the way in. The return gate
    // sits further out, ready when you fly back to the edge.
    const ARRIVE_DIST = 500;
    g.ship.pos.copy(dest.gate.facing).multiplyScalar(ARRIVE_DIST);
    // Nose points INTO the system (toward the star), so you arrive looking at
    // the new system rather than back out at the return gate behind you.
    g.ship.faceToward(ORIGIN);
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
