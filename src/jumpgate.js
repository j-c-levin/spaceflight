import * as THREE from 'three';
// Stub — real ring course + portal implemented in a later task.
export class JumpGate {
  constructor(parent, def, glowTex) { this.def = def; this.total = def.rings;
    this.index = 0; this.phase = 'running'; this.timer = 8; this.timerMax = 8;
    this._portalPos = new THREE.Vector3(...def.center); }
  get progress() { return { index:this.index, total:this.total, timer:this.timer, timerMax:this.timerMax, phase:this.phase }; }
  get portalPosition() { return this._portalPos; }
  get online() { return false; }
  reset() { this.index = 0; this.timer = this.timerMax; this.phase = 'running'; }
  update(dt, shipPos) { /* stub: no-op */ }
}
