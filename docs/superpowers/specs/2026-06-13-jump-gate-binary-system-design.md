# Jump Gate & Binary-Star System — Design

**Date:** 2026-06-13
**Status:** Approved (pre-authorized through implementation, subagent-driven)

## Goal

Add a jump-gate feature: a timed ring slalom at the outer edge of each solar
system. Flying the rings in order powers up a gate that pulls the ship through a
warp transition into a second solar system — a **binary-star** system with its
own planets and refuel stations. Each system has its own course + gate, so the
player travels **round-trip** between the two worlds.

## Player experience

1. Fly to the outer edge; ~7 rings sit in a banked curved arc, the first pulsing.
2. Pass rings **in order**. Each cleared ring flashes + chimes and arms the next.
   A HUD bar shows a per-ring countdown; if it expires the run resets to ring 0.
3. Clearing the last ring **powers up the gate** (glow ramps, spin accelerates,
   "GATE ONLINE"). After ~1s it **auto-pulls** the ship in (input locked, ~2s).
4. **Warp:** stars stretch into streaks, FOV punches, a white flash peaks — and
   you emerge in the other system near its gate, facing inward.
5. The destination's own ring course returns you home the same way.

## Architecture (Approach B — two persistent systems, toggle visibility)

Both systems are built once at boot, each as a `THREE.Group` whose `.visible` is
toggled on jump. A **shared** starfield + dust backdrop serves both (stars look
the same everywhere). This avoids per-jump dispose/rebuild and keeps treasure/NPC
state bound to the persistent home planets. The warp flash masks the toggle.

```
SolarSystem  (one THREE.Group, .visible toggled)
  ├─ suns[]      home: 1   binary: 2 (orbit a barycenter)
  ├─ lights[]    one PointLight per sun
  ├─ planets[]   per-system defs (distinct sets/palettes), banded shader
  ├─ stations[]  per-system refuel spots
  └─ gate        JumpGate (ring course + portal) → targets the other system

World  (manager; keeps its name so main.js/treasure hold a `world`)
  ├─ shared starfield + dust (follow camera)
  ├─ systems: [home, binary]
  ├─ activeIndex + get activeSystem()
  ├─ background tint per system
  └─ jumpTo(index): toggle group visibility, set active, retint background
```

## Units & responsibilities

### `worlddata.js` — data only
Exports two `SystemDef`s, `HOME` and `BINARY`:
- `background`: scene background color for that system.
- `suns`: array of `{ radius, color, glowColor, orbit?, phase? }`. Home has one
  (orbit 0). Binary has two with non-zero `orbit` about the barycenter and
  opposite phase, plus a `barycenterSpeed`.
- `planets`: the existing `PLANET_DEFS` shape (name, radius, orbit, speed, color,
  bandA, bandB, rings?, moon?). Home = current set. Binary = ~4 new planets in a
  distinct palette (e.g. volcanic red, toxic green, ice blue, violet).
- `stations`: array of `Vector3`-like spots.
- `gate`: `{ targetIndex, center, arcRadius, rings, ... }` describing the ring
  path (see JumpGate).

Move today's `PLANET_DEFS` here as `HOME.planets`.

### `solarsystem.js` — `SolarSystem`
Builds one system from a `SystemDef` into a `THREE.Group` (added to the scene,
`visible=false` unless active). Owns: suns (mesh + additive glow sprite each),
one `PointLight` per sun, planets (reusing the existing banded `ShaderMaterial`
and `makeRing`), stations meshes, and its `JumpGate`.
- `update(dt, t)`: orbit planets (as today), orbit binary suns about the
  barycenter, drive `uSunDir` from the **barycenter** direction (single dir is
  fine for the arcade look), spin stations, update the gate.
- Exposes `planets`, `stations`, `gate`, `group`, and `sunPositions`.
- `setVisible(b)`: toggles the group.

### `jumpgate.js` — `JumpGate`
The ring course + portal for one system; built by its `SolarSystem`.
- Builds N rings (default 7) along a banked arc (`makeRing`-style torus/ring
  geometry, additive glow) and a larger **portal** torus at the arc end. Ring
  positions/orientations from the `gate` def (arc center, radius, spacing,
  bank). Rings have an `armed`/`dim` visual state.
- State: `index` (next ring to clear), `timer` (per-ring countdown),
  `phase` ∈ `running | powering | online`.
- `update(dt, shipPos)`:
  - Arm only ring `index` (pulse), dim the rest.
  - **Detection:** track signed distance of `shipPos` to the armed ring's plane;
    on sign-flip with in-plane radial distance < ring radius → clear: advance
    `index`, reset `timer`, emit a pulse/sound hook, set ring to "cleared".
  - Decrement `timer`; on expiry reset the run (`index=0`, timer reset, all rings
    dim) unless already powering/online.
  - When `index` reaches N: `phase=powering`, ramp portal glow/spin; after the
    power-up window emit "ready to pull" (consumed by the jump controller).
  - Out-of-order rings are ignored (only the armed ring is tested).
- Exposes `progress` (`{ index, total, timer, timerMax, phase }`) for the HUD,
  `portalPosition`, and a `reset()`.

### `warp.js` — `Warp`
The transition FX + a fullscreen flash overlay.
- `start()` / `update(dt)` driving: star-streak stretch on the shared starfield
  (boost point sizes along travel and/or a streak param), a camera FOV punch, and
  a fullscreen white flash (a DOM overlay element faded via opacity, or an
  additive fullscreen quad) whose peak the jump controller aligns with the swap.
- Pure visual; no world knowledge.

### `world.js` — becomes the manager
- Builds the shared starfield + dust (unchanged) and the two `SolarSystem`s.
- `activeSystem` getter; `jumpTo(index)` toggles visibility, sets active,
  retints `scene.background`, returns the destination arrival transform.
- `update(dt, cameraPos)`: update only the active system + shared backdrop.
- Keeps `glowTex` (used by ship/effects/treasure).

### Jump orchestration — `JumpController` (in `main.js` or its own file)
A small state machine wiring gate → warp → world swap:
`IDLE → POWERING (gate spin-up ~1s) → PULLING (~2s: input locked, ship auto-flies
into portal, accelerating) → WARP (warp.start; white flash peaks) → ARRIVE
(world.jumpTo(other); place ship at destination gate facing inward, velocity 0)
→ settle (flash reverses) → IDLE`.
- Sets `game.jumping=true` during POWERING…ARRIVE; `ship.update` ignores `input`
  while jumping (the controller drives `ship.root` toward the portal).
- Triggered when `activeSystem.gate` reports `online`.

## Dependent systems on jump

- **Treasure & NPCs (home-only):** add `setActive(bool)`. When the binary system
  is active, hide their groups and skip their `update`. Score persists. They stay
  bound to the persistent home planets (no rebinding — that's the point of B).
- **Stations:** each `SolarSystem` **builds and owns** its station meshes (in its
  group). The existing `Stations` class is kept but becomes a thin updater whose
  `update(dt, game)` iterates `world.activeSystem.stations` for the refuel
  proximity/pulse logic (so only the active system's stations are checked).
- **Combat / effects / trail:** unchanged; they act on the ship, not the world.

## HUD additions (`hud.js`)

- Gate progress readout `JUMP GATE n/total` + a thin per-ring **timer bar**,
  shown while a run is active (index>0 or near the course).
- A brief **"GATE ONLINE"** banner when the gate powers up.
- Read from `world.activeSystem.gate.progress`.

## Constants (tweakable)

- Rings per course: **7**; per-ring timer: **8 s**; course arc radius: **~1650**
  (beyond the outermost planet orbit 1320); ring inner/outer radius sized so the
  opening is comfortably flyable (~60–90 units).
- Power-up window: **~1 s**; auto-pull: **~2 s**; warp flash peak at swap.
- Binary suns: orange (`~0xffa860`) + blue-white (`~0xbfd8ff`), orbiting a
  barycenter; one `PointLight` each.

## Build order (phased, for the plan)

1. **Refactor to `SolarSystem` + `World` manager**, home-only, **no behavior
   change** — the game looks/plays identically. `worlddata.js` HOME def.
2. **`JumpGate` course + HUD** — rings build, arm/clear in order with timer/reset,
   power up the gate. No jump yet (clearing just powers the portal + logs).
3. **Jump sequence + `warp.js` + `world.jumpTo`** — full state machine, input
   lockout, warp FX, group toggle, arrival placement (initially home→home to
   prove the loop, then wired to the real target).
4. **Binary `SystemDef` + dependents gating** — binary planets/suns/stations, the
   return gate, and treasure/NPC `setActive` home-only.

## Testing

- After phase 1: home system renders and plays exactly as before (visual parity,
  no console errors, `npm run build` passes). Verify via Playwright screenshot +
  `window.game`.
- Phase 2: drive `window.game` to teleport the ship through rings in order;
  assert `gate.progress.index` advances and resets on timer expiry.
- Phase 3: trigger a jump programmatically; assert `world.activeIndex` flips,
  ship repositions, `game.jumping` toggles, no errors; screenshot the warp.
- Phase 4: jump home↔binary; assert binary shows two suns + new planets, treasure
  hidden while away and restored on return.
- Manual/device: fly the course, confirm the warp feels right in landscape.

## Out of scope (YAGNI)

- More than two systems (architecture allows it later).
- Persisting which system you're in across reloads.
- Per-sun directional lighting on the band shader (barycenter direction suffices).
- Treasure/NPC economy in the binary system.
