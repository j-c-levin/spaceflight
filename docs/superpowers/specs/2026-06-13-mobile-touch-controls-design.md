# Mobile Touch Controls — Design

**Date:** 2026-06-13
**Status:** Approved

## Goal

Make the browser spaceflight game playable on touch devices (phones/tablets)
with on-screen controls: a steering joystick in one bottom corner, and SHOOT +
BOOST buttons in the other, plus a throttle slider for speed.

## Background — current control model

| Action  | Desktop input            | Game effect |
|---------|--------------------------|-------------|
| Steer   | mouse → `input.cursor` `[-1,1]` (sticks where left) | yaw/pitch/bank in `ship.js` |
| Throttle| `W`/`S`, scroll wheel → ramps `ship.throttle` | forward speed |
| Boost   | `Shift` (`input.boosting`) | speed burst, drains `boostEnergy` |
| Fire    | `Space` → `input.firePressed` | `combat.fireNet` |
| Select  | click → `input.clickPressed` | `combat.trySelect` |
| Mute    | `M` | toggle audio |

`Input` is the single integration boundary: the game loop (`main.js`) and
`ship.js` read from it. Touch controls plug into the same object.

## Activation

- Detect touch capability via `matchMedia('(pointer: coarse)')` or
  `navigator.maxTouchPoints > 0`.
- On touch devices:
  - Show the `#touch-controls` overlay (hidden by default).
  - Skip pointer-lock; hide the "CLICK TO TAKE CONTROL" hint. The sandbox is
    live from the first frame.
- Desktop behavior is unchanged.

## Layout

Over the existing HUD, matching its cyan-on-dark bracket aesthetic.

- **Bottom-left — Joystick.** Round base + draggable thumb. Thumb offset maps
  *absolutely* to `input.cursor`: full deflection right → `cursor.x = 1`, etc.
  Release → thumb springs to center → `cursor` returns to `(0,0)` → ship flies
  straight. (Cleaner than desktop's "cursor sticks where you left it.")
  Clamp to the same ranges the desktop cursor uses (`x ∈ [-1,1]`,
  `y ∈ [-0.85, 0.85]`).
- **Left edge, mid-height — Throttle slider.** Vertical slider positioned above
  the joystick base so they don't overlap. Drag sets `input.throttleTarget`
  `∈ [0,1]`. Tap-to-position supported. Default thumb reflects the ship's
  starting throttle (`0.45`).
- **Bottom-right — SHOOT + BOOST.** SHOOT (larger, primary) sets
  `input.firePressed` on each press. BOOST is hold-to-boost: pointerdown sets
  `input.touchBoost = true`, pointerup/cancel clears it.
- **Tap on empty scene area** (not on a control) sets `input.clickPressed` →
  selects the nearest target.

## Multitouch

Each control owns its own DOM element and tracks its own `pointerId` via Pointer
Events (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`). Because the
listeners are per-element, steering + throttle + shoot + boost work
simultaneously without a global touch dispatcher.

## Integration changes to `Input`

Additive, so desktop is unaffected:

- `this.throttleTarget = null;` — null means "no touch override" (desktop uses
  `W`/`S`/wheel as today).
- `this.touchBoost = false;`
- `get boosting()` returns `this.touchBoost || <existing Shift check>`.

## Integration change to `ship.js`

One conditional in the throttle section: if `input.throttleTarget !== null`,
ease `this.throttle` toward `input.throttleTarget` (smooth, not a snap) instead
of / in addition to the `W`/`S` ramp. Keeps the "throttle never snaps" feel.

## Files

| File            | Change |
|-----------------|--------|
| `src/touch.js`  | new `TouchControls` class — capability detection, DOM wiring, pointer handling, per-frame `update()` |
| `index.html`    | `#touch-controls` markup block (joystick, slider, SHOOT, BOOST), hidden by default |
| `src/style.css` | styling for joystick base/thumb, vertical slider, buttons |
| `src/input.js`  | add `throttleTarget`, `touchBoost`; OR-into `boosting` |
| `src/ship.js`   | ease throttle toward `throttleTarget` when set |
| `src/main.js`   | instantiate `TouchControls(input)`, call `touch.update()` in the loop |

## Out of scope (YAGNI)

- Pinch-to-zoom (desktop scroll-wheel zoom only).
- On-screen mute button.
- Forced orientation lock. Tuned for landscape but functional in portrait.

## Testing

- Playwright MCP with a mobile viewport / touch emulation: verify the overlay
  renders only on touch devices, the joystick thumb drags and recenters, the
  slider sets throttle, and SHOOT/BOOST fire their effects.
- Manual sanity check on desktop that nothing changed (no overlay, pointer-lock
  and keyboard still work).
