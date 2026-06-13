// On-screen touch controls for phones/tablets.
//
// Plugs into the shared Input object — the single integration boundary the
// rest of the game already reads from:
//   - joystick    -> input.cursor   (absolute thumb offset, springs to center)
//   - throttle    -> input.throttleTarget
//   - BOOST (hold) -> input.touchBoost
//   - SHOOT (tap)  -> input.firePressed
//   - tap on scene -> input.clickPressed (select target)
//
// Each control owns its element and tracks its own pointerId via Pointer
// Events + setPointerCapture, so steering, throttle and the buttons all work
// at the same time without a global touch dispatcher.

const START_THROTTLE = 0.45; // matches PlayerShip's starting throttle

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = false;

    // Show on touch hardware; allow ?touch=1 to force it on (desktop testing).
    const isTouch =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0;
    const forced = new URLSearchParams(location.search).has('touch');
    if (!isTouch && !forced) return;

    this.enabled = true;

    // joystick state
    this.stickActive = false;
    this.stickId = null;

    this._mount();
  }

  // setPointerCapture can throw (e.g. pointer already released); never let
  // that abort the handler — the control must still respond.
  _capture(el, e) {
    try { el.setPointerCapture(e.pointerId); } catch { /* non-fatal */ }
  }

  _mount() {
    const root = document.getElementById('touch-controls');
    root.classList.remove('hidden');

    // No pointer-lock / "click to take control" on touch — it's live already.
    document.getElementById('hint')?.classList.add('hidden');
    // The read-only desktop throttle readout would duplicate our slider.
    document.getElementById('throttle')?.style.setProperty('display', 'none');
    document.body.style.cursor = 'default';

    this.stick = document.getElementById('touch-stick');
    this.stickThumb = document.getElementById('touch-stick-thumb');
    this.fill = document.getElementById('touch-throttle-fill');
    this.thumb = document.getElementById('touch-throttle-thumb');
    const track = document.getElementById('touch-throttle-track');
    const shoot = document.getElementById('touch-shoot');
    const boost = document.getElementById('touch-boost');

    // throttle starts where the ship starts, so nothing jumps on first frame
    this.input.throttleTarget = START_THROTTLE;
    this._setThrottleVisual(START_THROTTLE);

    this._wireStick();
    this._wireThrottle(track);
    this._wireButton(shoot, () => { this.input.firePressed = true; });
    this._wireBoost(boost);
    this._wireSelect();
  }

  // ---- steering joystick ----
  _wireStick() {
    const el = this.stick;
    const radius = () => el.clientWidth / 2 - this.stickThumb.clientWidth / 2;

    const move = (e) => {
      // offsetX/Y are relative to the joystick element itself, so they sidestep
      // the iOS standalone bug where event clientX/Y (visual viewport) and
      // getBoundingClientRect (layout viewport) live in offset coordinate spaces.
      let dx = e.offsetX - el.clientWidth / 2;
      let dy = e.offsetY - el.clientHeight / 2;
      const R = radius();
      const mag = Math.hypot(dx, dy);
      if (mag > R) { dx = (dx / mag) * R; dy = (dy / mag) * R; }
      this.stickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
      // up on screen (negative dy) is positive pitch, matching the mouse model
      this.input.cursor.x = dx / R;
      this.input.cursor.y = -dy / R;
      this.input.clampCursor();
    };

    el.addEventListener('pointerdown', (e) => {
      this.stickActive = true;
      this.stickId = e.pointerId;
      move(e);
      this._capture(el, e);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (this.stickActive && e.pointerId === this.stickId) move(e);
    });
    const release = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickActive = false;
      this.stickId = null;
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  // ---- throttle slider ----
  _wireThrottle(track) {
    let id = null;
    const set = (e) => {
      // offsetY is relative to the track itself — same coordinate-space fix as
      // the joystick, so the slider tracks the touch correctly in standalone iOS.
      const frac = 1 - e.offsetY / track.clientHeight;
      const v = Math.max(0, Math.min(1, frac));
      this.input.throttleTarget = v;
      this._setThrottleVisual(v);
    };
    track.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      set(e);
      this._capture(track, e);
      e.preventDefault();
    });
    track.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) set(e);
    });
    const end = (e) => { if (e.pointerId === id) id = null; };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  }

  _setThrottleVisual(v) {
    const pct = (v * 100).toFixed(1) + '%';
    this.fill.style.height = pct;
    this.thumb.style.bottom = pct;
  }

  // ---- momentary button (SHOOT): fire on each press ----
  _wireButton(el, onPress) {
    el.addEventListener('pointerdown', (e) => {
      onPress();
      el.classList.add('active');
      this._capture(el, e);
      e.preventDefault();
    });
    const up = () => el.classList.remove('active');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // ---- hold button (BOOST): true while held ----
  _wireBoost(el) {
    el.addEventListener('pointerdown', (e) => {
      this.input.touchBoost = true;
      el.classList.add('active');
      this._capture(el, e);
      e.preventDefault();
    });
    const up = () => { this.input.touchBoost = false; el.classList.remove('active'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // ---- tap on empty scene selects the nearest target ----
  _wireSelect() {
    const scene = document.getElementById('scene');
    scene.addEventListener('pointerdown', () => { this.input.clickPressed = true; });
  }

  // ---- per-frame: spring the joystick back to center on release ----
  update(dt) {
    if (!this.enabled || this.stickActive) return;
    const c = this.input.cursor;
    if (Math.abs(c.x) < 1e-3 && Math.abs(c.y) < 1e-3) return;
    const k = 1 - Math.exp(-12 * dt);
    c.x += (0 - c.x) * k;
    c.y += (0 - c.y) * k;
    const R = this.stick.clientWidth / 2 - this.stickThumb.clientWidth / 2;
    this.stickThumb.style.transform = `translate(${c.x * R}px, ${-c.y * R}px)`;
  }
}
