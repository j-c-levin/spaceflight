import * as THREE from 'three';

// A soft, lagging chase rig riding the ship's orientation quaternion:
// - sits close behind so the ship fills the screen and feels impactful
// - swings horizontally opposite the turn, opening up the space ahead
// - leans vertically with an asymmetric look-ahead (more when diving)
// - pulls back during boost
// The rig's up vector comes from the ship's own frame, so loops and spirals
// carry the camera naturally; the ship's auto-level brings the horizon back.
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.distance = 8;
    this.smoothedPos = new THREE.Vector3();
    this.smoothedLook = new THREE.Vector3();
    this.swing = 0;
    this.lean = 0;
    this.initialized = false;

    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._rigEuler = new THREE.Euler();
    this._rigQuat = new THREE.Quaternion();
  }

  update(dt, ship, input) {
    const c = input.cursor;

    // smoothed swing/lean follow the cursor with their own lag
    const k = 1 - Math.exp(-5 * dt);
    const targetSwing = c.x * 0.26;                       // ~15 degrees
    const targetLean = c.y > 0 ? c.y * 0.10 : c.y * 0.28; // dive leans harder
    this.swing += (targetSwing - this.swing) * k;
    this.lean += (targetLean - this.lean) * k;

    // close in normally; boost pulls the camera back
    const targetDist = ship.boosting ? 12.5 : 8;
    this.distance += (targetDist - this.distance) * (1 - Math.exp(-3.5 * dt));

    // rig orientation: ship frame plus swing/lean offsets
    this._rigEuler.set(this.lean, this.swing, 0, 'YXZ');
    this._rigQuat.setFromEuler(this._rigEuler).premultiply(ship.root.quaternion);

    this._desired.set(0, 1.6, this.distance)
      .applyQuaternion(this._rigQuat)
      .add(ship.pos);
    this._up.set(0, 1, 0).applyQuaternion(this._rigQuat);

    // look slightly ahead of the ship
    ship.forward(this._look);
    this._look.multiplyScalar(7).add(ship.pos);

    if (!this.initialized) {
      this.smoothedPos.copy(this._desired);
      this.smoothedLook.copy(this._look);
      this.initialized = true;
    }
    const posK = 1 - Math.exp(-9 * dt);
    const lookK = 1 - Math.exp(-12 * dt);
    this.smoothedPos.lerp(this._desired, posK);
    this.smoothedLook.lerp(this._look, lookK);

    this.camera.position.copy(this.smoothedPos);
    this.camera.up.copy(this._up);
    this.camera.lookAt(this.smoothedLook);
  }
}
