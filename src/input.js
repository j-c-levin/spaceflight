// Input: pointer-locked virtual aim cursor + keyboard.
// The cursor lives in normalized coords [-1, 1] (x right, y up) and stays
// where you leave it — it never auto-recenters.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.cursor = { x: 0, y: 0 };
    this.keys = new Set();
    this.locked = false;
    this.wheelDelta = 0;

    // touch overrides (set by TouchControls; null/false on desktop)
    this.throttleTarget = null; // absolute throttle [0,1], or null = keyboard/wheel
    this.touchBoost = false;

    // one-frame event flags, consumed by game systems
    this.firePressed = false;
    this.clickPressed = false;
    this.mutePressed = false;

    this.sensitivity = 0.0016;

    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      document.getElementById('hint').classList.toggle('hidden', this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.cursor.x += e.movementX * this.sensitivity;
      this.cursor.y -= e.movementY * this.sensitivity;
      this.clampCursor();
    });

    document.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.clickPressed = true;
    });

    document.addEventListener('wheel', (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
    });

    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.firePressed = true; e.preventDefault(); }
      if (e.code === 'KeyM') this.mutePressed = true;
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  clampCursor() {
    this.cursor.x = Math.max(-1, Math.min(1, this.cursor.x));
    this.cursor.y = Math.max(-0.85, Math.min(0.85, this.cursor.y));
  }

  update(dt) {
    // arrow keys nudge the cursor, same as mouse
    const arrowSpeed = 1.4 * dt;
    if (this.keys.has('ArrowLeft')) this.cursor.x -= arrowSpeed;
    if (this.keys.has('ArrowRight')) this.cursor.x += arrowSpeed;
    if (this.keys.has('ArrowUp')) this.cursor.y += arrowSpeed;
    if (this.keys.has('ArrowDown')) this.cursor.y -= arrowSpeed;
    this.clampCursor();
  }

  // call at end of frame
  consume() {
    this.firePressed = false;
    this.clickPressed = false;
    this.mutePressed = false;
    this.wheelDelta = 0;
  }

  get throttleUp() { return this.keys.has('KeyW'); }
  get throttleDown() { return this.keys.has('KeyS'); }
  get boosting() { return this.touchBoost || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
}
