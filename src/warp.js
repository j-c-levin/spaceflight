// warp.js — fullscreen white flash + FOV punch transition effect.
// Driven externally by a normalised phase value (0..1).
// NOT wired into the game loop yet; that happens in JumpController (next task).

export class Warp {
  constructor(camera, starfield) {
    this.camera = camera;
    this.starfield = starfield;
    this.active = false;
    this.baseFov = camera.fov;

    // Create the overlay once and reuse it every transition.
    this.flash = document.createElement('div');
    this.flash.style.cssText =
      'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:60;';
    document.body.appendChild(this.flash);

    // The starfield ShaderMaterial only has a `uTex` uniform and a per-vertex
    // `aSize` attribute — no dynamic point-size multiplier uniform exists.
    // Streak is therefore omitted so we never corrupt the shader state.
  }

  /** Arm the effect. Call once before starting to drive update(). */
  start() {
    this.active = true;
  }

  /** Disarm and fully reset all visual state. */
  stop() {
    this.active = false;
    this.flash.style.opacity = '0';
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    // No starfield uniform was changed, so nothing to restore there.
  }

  /**
   * Drive the effect each frame while active.
   * @param {number} dt      - Frame delta-time in seconds (currently unused but
   *                           kept for API consistency with other systems).
   * @param {number} phase01 - Normalised progress across the full pull+warp,
   *                           0 → 1. Flash peaks sharply at 0.5 (world-swap
   *                           moment); FOV punches out and back as a sine arc.
   */
  update(dt, phase01) {
    if (!this.active) return;

    // Sharp flash centred on 0.5: width ~±0.18 in phase space.
    const flash = Math.max(0, 1 - Math.abs(phase01 - 0.5) / 0.18);
    this.flash.style.opacity = flash.toFixed(3);

    // FOV punch: 0 at phase 0 and 1, peaks (+26°) at phase 0.5.
    this.camera.fov = this.baseFov + 26 * Math.sin(Math.PI * phase01);
    this.camera.updateProjectionMatrix();

    // Streak skipped — starfield.material has no suitable uniform.
  }
}
