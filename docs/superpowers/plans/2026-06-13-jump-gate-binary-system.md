# Jump Gate & Binary-Star System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A timed ring slalom at each system's edge powers up a gate that warps the ship between the home system and a new binary-star system (round-trip).

**Architecture:** Approach B — both systems are built once at boot as toggleable `THREE.Group`s sharing one starfield/dust backdrop; `World` becomes a manager that swaps the active system. A per-system `JumpGate` (rings + portal) drives a `JumpController` state machine that runs the warp FX and calls `world.jumpTo()`. Spec: `docs/superpowers/specs/2026-06-13-jump-gate-binary-system-design.md`.

**Tech Stack:** Vite, Three.js (r0.177, ShaderMaterial, Points, RingGeometry/TorusGeometry), EffectComposer/UnrealBloom. No unit-test framework — verification is Playwright + `window.game` introspection + `npm run build`.

## Verification conventions (used by every task)

- **Build:** `npm run build` must end with `✓ built`.
- **Runtime:** dev server runs via `npm run dev` (already bound 0.0.0.0). Load `http://localhost:5173/` and assert through `window.game` (exposed in `main.js`). Console errors must be empty.
- **Playwright helper** (run with the playwright MCP `browser_run_code_unsafe`, or any Playwright runner):
  ```js
  // returns console errors collected during the snippet
  const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text()));
  ```
- **Visual parity** screenshots: park the ship with `window.game` then `page.screenshot`.
- **Commit** after each task (unsigned — the 1Password signing agent is currently down in this environment):
  `git commit --no-gpg-sign -m "..."`. Stage only the files the task touched.

---

## Task 1: Extract the home system into a data definition (`worlddata.js`)

**Files:**
- Create: `src/worlddata.js`
- Modify: `src/world.js` (remove the `PLANET_DEFS` literal; import from worlddata)

No behavior change — pure data extraction so systems become data-driven.

- [ ] **Step 1: Create `src/worlddata.js`** with the two system defs. Move the existing `PLANET_DEFS` array verbatim into `HOME.planets`. Pull the four station spots currently hard-coded in `src/stations.js` (`260,0,120` / `-520,12,330` / `780,-10,-480` / `-220,0,-1050`) into `HOME.stations`. Add a single sun and background. Leave `BINARY` defined but minimal for now (filled in Task 8). Use plain arrays for vectors (build `THREE.Vector3` at consumption).

```js
// src/worlddata.js — data only; no THREE objects here.
export const HOME = {
  id: 'home',
  background: 0x0a0a1e,
  suns: [{ radius: 55, color: 0xffd860, glow: 0xffc040, glowScale: 290, orbit: 0, phase: 0 }],
  // <-- paste the existing PLANET_DEFS array contents here unchanged -->
  planets: [ /* MERCURY … NEPTUNE exactly as in world.js today */ ],
  stations: [ [260,0,120], [-520,12,330], [780,-10,-480], [-220,0,-1050] ],
  gate: { targetId: 'binary', rings: 7, arcRadius: 1650, arcSpan: 1.4, ringHole: 70,
          center: [0,0,-1650], facing: [0,0,1] },
};

export const BINARY = {
  id: 'binary',
  background: 0x140a1e,
  suns: [
    { radius: 42, color: 0xffa860, glow: 0xff8030, glowScale: 230, orbit: 95, phase: 0 },
    { radius: 30, color: 0xbfd8ff, glow: 0x90b8ff, glowScale: 180, orbit: 95, phase: Math.PI },
  ],
  barycenterSpeed: 0.05,
  planets: [], // filled in Task 8
  stations: [ [300,0,-160], [-600,20,260], [120,-10,900] ],
  gate: { targetId: 'home', rings: 7, arcRadius: 1650, arcSpan: 1.4, ringHole: 70,
          center: [0,0,1650], facing: [0,0,-1] },
};

export const SYSTEM_DEFS = [HOME, BINARY];
```

- [ ] **Step 2: In `src/world.js`,** delete the local `PLANET_DEFS` const and `import { HOME } from './worlddata.js'`; replace references to `PLANET_DEFS` with `HOME.planets`. (Full refactor of World happens in Task 3 — here just make it still build identically.)

- [ ] **Step 3: Verify build + parity.** `npm run build` → `✓ built`. Load the game; in console `window.game.world.planets.length` equals the old count (8) and a screenshot looks unchanged.

- [ ] **Step 4: Commit** `git add src/worlddata.js src/world.js && git commit --no-gpg-sign -m "refactor: extract home system into worlddata.js"`

---

## Task 2: `SolarSystem` unit (one system as a toggleable group)

**Files:**
- Create: `src/solarsystem.js`
- Reference (move code from): `src/world.js` sun/planet/ring/moon build (lines ~149–186) and the `makePlanetMaterial`/`makeRing` helpers (keep those exported from world.js or move to solarsystem.js — keep them in world.js and import).

- [ ] **Step 1: Export the shaper helpers from `world.js`.** Add `export` to `makePlanetMaterial` and `makeRing` so `solarsystem.js` can reuse them (they already exist; just export).

- [ ] **Step 2: Create `src/solarsystem.js`.** A class that builds one system from a def into `this.group` (added to scene, `visible=false`). Supports 1..2 suns. `update` orbits planets/suns and feeds the band shader the barycenter direction.

```js
import * as THREE from 'three';
import { makePlanetMaterial, makeRing } from './world.js';
import { JumpGate } from './jumpgate.js'; // added in Task 4; guard if not present yet

export class SolarSystem {
  constructor(scene, def, glowTex) {
    this.def = def;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.time = 0;

    // suns + lights
    this.suns = def.suns.map((s) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(s.radius, 48, 32),
        new THREE.MeshBasicMaterial({ color: s.color }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: s.glow,
        transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(s.glowScale);
      mesh.add(glow);
      this.group.add(mesh);
      const light = new THREE.PointLight(0xfff2d0, 30000 / def.suns.length, 0, 1.8);
      this.group.add(light);
      return { mesh, light, def: s };
    });

    // planets (reuse existing shaper + ring + moon code, parented to this.group)
    this.planets = def.planets.map((pdef, i) => { /* same as world.js today, add to this.group */ });

    // stations
    this.stations = def.stations.map((p) => {
      const mesh = buildStation();              // import buildStation from stations.js (Task 9 exports it)
      mesh.position.set(p[0], p[1], p[2]);
      this.group.add(mesh);
      return { mesh, pos: new THREE.Vector3(p[0],p[1],p[2]), recharged: false };
    });

    this.gate = new JumpGate(this.group, def.gate, glowTex); // Task 4
  }

  get sunPositions() { return this.suns.map(s => s.mesh.position); }
  setVisible(b) { this.group.visible = b; }

  update(dt, shipPos) {
    this.time += dt;
    // binary suns orbit the barycenter (origin); single sun stays at origin
    if (this.suns.length > 1) {
      const a = this.time * this.def.barycenterSpeed;
      this.suns.forEach((s) => {
        const ang = a + s.def.phase;
        s.mesh.position.set(Math.cos(ang) * s.def.orbit, 0, Math.sin(ang) * s.def.orbit);
        s.light.position.copy(s.mesh.position);
      });
    }
    const bary = new THREE.Vector3(); // barycenter ~ origin
    for (const p of this.planets) { /* orbit + uTime + uSunDir = (bary - planetPos).normalize() + rotate + moon, as today */ }
    this.gate.update(dt, shipPos);
  }
}
```

- [ ] **Step 3: Verify** `npm run build` passes (SolarSystem may be unused until Task 3 — that's fine; an unused import of JumpGate will fail, so temporarily stub `JumpGate` or do Task 4 first if the executor prefers). Recommended order note: if building strictly, implement Task 4's `jumpgate.js` skeleton before this compiles.

- [ ] **Step 4: Commit** `git add src/solarsystem.js src/world.js && git commit --no-gpg-sign -m "feat: SolarSystem unit (1-2 suns, planets, stations, gate)"`

---

## Task 3: `World` becomes the manager (home-only, visual parity)

**Files:**
- Modify: `src/world.js` (keep starfield/dust; replace sun/planet building with `SolarSystem`s)
- Modify: `src/main.js` (no signature change; `world` still passed around)
- Modify: `src/treasure.js` (use `world.activeSystem.planets`)
- Modify: `src/stations.js` (update over `world.activeSystem.stations`; export `buildStation`)

- [ ] **Step 1: Refactor `World`.** Keep the constructor building lights-ambient, `glowTex`, shared `buildStarfield()`/`buildDust()`. Replace sun+planets with:
  ```js
  import { SYSTEM_DEFS } from './worlddata.js';
  this.systems = SYSTEM_DEFS.map(d => new SolarSystem(scene, d, this.glowTex));
  this.activeIndex = 0;
  this.systems[0].setVisible(true);
  scene.background = new THREE.Color(this.systems[0].def.background);
  ```
  Add: `get activeSystem(){ return this.systems[this.activeIndex]; }`, `get planets(){ return this.activeSystem.planets; }` (back-comat for treasure), and:
  ```js
  jumpTo(index) {
    this.activeSystem.setVisible(false);
    this.activeIndex = index;
    this.activeSystem.setVisible(true);
    scene.background.set(this.activeSystem.def.background);
    return this.activeSystem; // caller places the ship
  }
  ```
  `update(dt, cameraPos)`: keep starfield/dust follow; call `this.activeSystem.update(dt, this._shipPos)` — pass ship pos: change the signature to `update(dt, cameraPos, shipPos)` and update the `main.js` call, OR read `window`-free via a stored ref. Prefer explicit: `world.update(dt, camera.position, ship.pos)`.

- [ ] **Step 2: Keep ambient light** in World (system-independent) so both systems share it.

- [ ] **Step 3: `treasure.js`** — anywhere it reads `world.planets`, that now resolves to the active system's planets (the getter handles it). Confirm no direct references to the removed sun.

- [ ] **Step 4: `stations.js`** — export `buildStation`. Change `Stations` to not build its own meshes; instead its `update(dt, game)` iterates `game.world.activeSystem.stations` (same refuel proximity/pulse logic, reading `st.pos`/`st.mesh`). Remove the constructor's spot list (now owned by SolarSystem).

- [ ] **Step 5: `main.js`** — `world.update(dt, camera.position, ship.pos)`. Everything else unchanged.

- [ ] **Step 6: Verify parity.** `npm run build` → `✓ built`. Load game: `window.game.world.activeSystem.def.id === 'home'`, planets render, a refuel station pulses when near (teleport ship: `game.ship.root.position.copy(game.world.activeSystem.stations[0].pos)` then check `game.ship.boostEnergy` tops up). Screenshot matches the pre-refactor look. Zero console errors.

- [ ] **Step 7: Commit** `git add -A src && git commit --no-gpg-sign -m "refactor: World manages toggleable SolarSystems (home parity)"`

---

## Task 4: `JumpGate` — rings, portal, in-order timed clearing

**Files:**
- Create: `src/jumpgate.js`

- [ ] **Step 1: Build the course.** N rings along a banked arc + a larger portal torus at the end, all parented to the owning system group. Ring i sits along an arc of `arcSpan` radians at `arcRadius`, centered on `def.center`, each oriented so its normal points along the flight path (tangent to the arc). Use a torus (visible tube) for the opening plus an additive glow.

```js
import * as THREE from 'three';

const POWER_TIME = 1.0; // gate spin-up

export class JumpGate {
  constructor(parent, def, glowTex) {
    this.def = def;
    this.index = 0;                 // next ring to clear
    this.total = def.rings;
    this.timerMax = 8.0;
    this.timer = this.timerMax;
    this.phase = 'running';         // running | powering | online
    this.powerT = 0;
    this._prevSide = null;

    this.group = new THREE.Group();
    parent.add(this.group);
    const center = new THREE.Vector3(...def.center);

    this.rings = [];
    for (let i = 0; i < def.rings; i++) {
      // place along an arc in the XZ plane, banked; flight direction ~ +facing
      const tParam = (i / (def.rings - 1) - 0.5) * def.arcSpan; // -span/2..span/2
      const pos = new THREE.Vector3(
        center.x + Math.sin(tParam) * def.arcRadius * 0.6,
        Math.sin(tParam) * 60,                       // gentle vertical bank
        center.z + Math.cos(tParam) * 120 * i + i*0  // step outward; tune spacing
      );
      // simpler: lay rings in a line stepping toward facing, with lateral S-curve
      const ring = this._buildRing(def.ringHole, glowTex);
      ring.position.copy(pos);
      // normal faces the travel axis (def.facing), with slight per-ring yaw for the curve
      const look = new THREE.Vector3().copy(pos).add(new THREE.Vector3(...def.facing));
      ring.lookAt(look);
      this.group.add(ring);
      this.rings.push({ mesh: ring, pos: pos.clone(),
        normal: new THREE.Vector3(...def.facing).normalize(), hole: def.ringHole });
    }
    this.portal = this._buildPortal(def.ringHole * 2.2, glowTex);
    this.portal.position.copy(center);
    this.portal.lookAt(center.clone().add(new THREE.Vector3(...def.facing)));
    this.group.add(this.portal);
    this._applyArmState();
  }

  get progress() { return { index:this.index, total:this.total, timer:this.timer,
    timerMax:this.timerMax, phase:this.phase }; }
  get portalPosition() { return this.portal.position; }
  get online() { return this.phase === 'online'; }

  reset() { this.index=0; this.timer=this.timerMax; this.phase='running'; this.powerT=0;
    this._prevSide=null; this._applyArmState(); }

  update(dt, shipPos) {
    if (this.phase === 'online') return;
    if (this.phase === 'powering') {
      this.powerT += dt;
      this.portal.rotation.z += dt * (2 + this.powerT*6);
      // ramp portal emissive/opacity with this.powerT/POWER_TIME ...
      if (this.powerT >= POWER_TIME) this.phase = 'online';
      return;
    }
    // running: pulse armed ring, dim others (visual) ...
    const ring = this.rings[this.index];
    // signed distance to the armed ring plane
    const d = shipPos.clone().sub(ring.pos).dot(ring.normal);
    const side = Math.sign(d);
    if (this._prevSide !== null && side !== this._prevSide && side !== 0) {
      // crossed the plane — was it within the hole?
      const radial = shipPos.clone().sub(ring.pos);
      radial.addScaledVector(ring.normal, -radial.dot(ring.normal)); // project onto plane
      if (radial.length() < ring.hole) this._clearRing();
    }
    this._prevSide = side;

    this.timer -= dt;
    if (this.timer <= 0 && this.index > 0) this.reset(); // expired mid-run
    if (this.timer <= 0 && this.index === 0) this.timer = this.timerMax; // idle, don't punish at start
  }

  _clearRing() {
    this.index++; this.timer = this.timerMax; this._prevSide = null;
    if (this.index >= this.total) { this.phase = 'powering'; this.powerT = 0; }
    this._applyArmState();
    this.onClear?.(this.index); // hook for flash/sound (set by main)
  }

  _applyArmState() { /* set armed ring bright/pulsing, cleared rings tinted, future dim */ }
  _buildRing(hole, glowTex) { /* TorusGeometry(hole, hole*0.06, 16, 64) MeshBasic additive + glow */ }
  _buildPortal(hole, glowTex) { /* bigger torus + inner additive disc; starts dim */ }
}
```

- [ ] **Step 2: Wire the clear hook.** In `main.js` set `world.systems.forEach(s => s.gate.onClear = (i) => { game.effects.flashRings.spawn(s.gate.rings[i-1].pos, 0x9b6bff, {maxScale:90,duration:0.8}); game.audio.fireNet?.(); });` (reuse an existing sound; a dedicated one is optional).

- [ ] **Step 3: Verify clearing logic** via Playwright by flying the armed ring in order:
  ```js
  const g = window.game; const gate = g.world.activeSystem.gate;
  function flyThrough(i){ const r = gate.rings[i];
    const n = r.normal; const before = r.pos.clone().addScaledVector(n,-30);
    const after  = r.pos.clone().addScaledVector(n, 30);
    g.ship.root.position.copy(before); g.world.activeSystem.update(0.016, g.ship.pos);
    g.ship.root.position.copy(after);  g.world.activeSystem.update(0.016, g.ship.pos); }
  for (let i=0;i<gate.total;i++) flyThrough(i);
  return gate.progress; // expect index=total, phase 'powering' or 'online'
  ```
  Also assert: clearing ring 0 then letting `timer` expire (`for(let k=0;k<600;k++) gate.update(0.016, farAwayPos)`) resets `index` to 0.

- [ ] **Step 4: Commit** `git add src/jumpgate.js src/main.js && git commit --no-gpg-sign -m "feat: JumpGate ring course (in-order, timed, power-up)"`

---

## Task 5: HUD gate progress + timer bar

**Files:**
- Modify: `src/hud.js` (canvas draw), reads `game.world.activeSystem.gate.progress`

- [ ] **Step 1: In `hud.js update(game, t)`,** when `progress.index > 0 && phase==='running'`, draw top-center text `JUMP GATE {index}/{total}` and a thin timer bar whose width = `timer/timerMax`. When `phase!=='running'` (powering/online) draw a pulsing `GATE ONLINE` banner instead. Use the existing canvas `ctx`/`this.w`/`this.h` conventions and the cyan HUD color.

- [ ] **Step 2: Verify** by advancing the gate a couple of rings via the Task 4 snippet, then screenshot — the readout shows `JUMP GATE 2/7` and a partial timer bar. Build passes, no errors.

- [ ] **Step 3: Commit** `git add src/hud.js && git commit --no-gpg-sign -m "feat: HUD jump-gate progress + timer"`

---

## Task 6: `warp.js` — transition FX (streaks + flash)

**Files:**
- Create: `src/warp.js`

- [ ] **Step 1: Build the effect.** A fullscreen white flash overlay (a fixed DOM `<div>` appended once, opacity animated) + a star-streak hook + camera FOV punch. Pure visual; exposes a promise-ish lifecycle the controller drives.

```js
export class Warp {
  constructor(camera, starfield) {
    this.camera = camera; this.starfield = starfield; this.t = 0; this.active = false;
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;'+
      'pointer-events:none;z-index:50;transition:none;';
    document.body.appendChild(this.flash);
    this.baseFov = camera.fov;
  }
  start() { this.active = true; this.t = 0; }
  stop()  { this.active = false; this.flash.style.opacity = 0; this.camera.fov = this.baseFov;
            this.camera.updateProjectionMatrix(); }
  // phase01: 0..1 across the whole pull+warp; flash peaks at ~0.5 (the swap moment)
  update(dt, phase01) {
    if (!this.active) return;
    const flash = Math.max(0, 1 - Math.abs(phase01 - 0.5) / 0.18); // sharp peak at 0.5
    this.flash.style.opacity = flash.toFixed(3);
    this.camera.fov = this.baseFov + 26 * Math.sin(Math.PI * phase01); // punch out and back
    this.camera.updateProjectionMatrix();
    // streak: enlarge star point sizes mid-warp (uniform if available), else skip
  }
}
```

- [ ] **Step 2: Verify** standalone: `const w = new (await import('/src/warp.js')).Warp(game.camera, game.world.starfield); w.start(); w.update(0.016,0.5);` → `document.querySelector('div[style*="z-index:50"]').style.opacity` ~1 at phase 0.5 and ~0 at phase 0/1. `w.stop()` restores `game.camera.fov`. Build passes.

- [ ] **Step 3: Commit** `git add src/warp.js && git commit --no-gpg-sign -m "feat: warp transition FX (flash + fov punch)"`

---

## Task 7: `JumpController` — orchestrate gate → warp → swap

**Files:**
- Create: `src/jumpcontroller.js`
- Modify: `src/main.js` (instantiate; call in loop; input lockout), `src/ship.js` (honor lockout)

- [ ] **Step 1: `ship.js` lockout.** In `update(dt, input)`, early in the method: `if (input.locked === 'jump') { /* skip input-driven throttle/steer; keep integrating velocity */ }`. Simpler: have `PlayerShip.update` accept the lockout via a flag set on the ship: `if (this.controlsLocked) { input = NULL_INPUT; }` where `NULL_INPUT` is a frozen object with neutral getters. Add `this.controlsLocked = false` in the constructor.

- [ ] **Step 2: `jumpcontroller.js`** state machine.

```js
import * as THREE from 'three';
const PULL_TIME = 2.0;
export class JumpController {
  constructor(game, warp) { this.game = game; this.warp = warp; this.state = 'idle'; this.t = 0; }
  get jumping() { return this.state !== 'idle'; }

  update(dt) {
    const g = this.game; const gate = g.world.activeSystem.gate;
    if (this.state === 'idle') {
      if (gate.online) this._begin(gate);
      return;
    }
    this.t += dt;
    if (this.state === 'pulling') {
      const k = Math.min(this.t / PULL_TIME, 1);
      // fly the ship into the portal, accelerating
      g.ship.root.position.lerpVectors(this._from, gate.portalPosition, k*k);
      this.warp.update(dt, k * 0.5);            // first half of the warp envelope
      if (k >= 1) { this._swap(); this.state = 'arriving'; this.t = 0; }
    } else if (this.state === 'arriving') {
      const k = Math.min(this.t / 1.0, 1);
      this.warp.update(dt, 0.5 + k * 0.5);      // second half (flash fades)
      if (k >= 1) this._end();
    }
  }

  _begin(gate) {
    this.state = 'pulling'; this.t = 0;
    this._from = this.game.ship.root.position.clone();
    this.game.ship.controlsLocked = true;
    this.warp.start();
  }
  _swap() {
    const g = this.game;
    const target = g.world.systems.findIndex(s => s.def.id === g.world.activeSystem.def.gate.targetId);
    const dest = g.world.jumpTo(target);
    dest.gate.reset();
    // place ship just inside the destination gate, facing inward (toward origin)
    const p = dest.gate.portalPosition.clone();
    g.ship.root.position.copy(p);
    g.ship.root.lookAt(0,0,0);
    g.ship.speed = 0;
  }
  _end() {
    this.warp.stop();
    this.game.ship.controlsLocked = false;
    this.game.world.activeSystem.gate.reset();
    this.state = 'idle';
  }
}
```

- [ ] **Step 3: Wire `main.js`.** After systems exist: `const warp = new Warp(camera, world.starfield); const jump = new JumpController(game, warp);` add `warp`/`jump` to `game`. In the loop, after `world.update(...)`, call `jump.update(dt)`. Gate `input` handling so firing/selecting is ignored while `jump.jumping` (optional). Ensure `game.jumping` reads `jump.jumping` for other systems.

- [ ] **Step 4: Verify the loop.** Programmatically force a jump:
  ```js
  const g = window.game; const gate = g.world.activeSystem.gate;
  gate.phase = 'online';            // shortcut to trigger
  const before = g.world.activeIndex;
  for (let i=0;i<240;i++) g.jump.update(0.016);   // ~ run through pull+arrive
  return { before, after: g.world.activeIndex, jumping: g.jump.jumping };
  // expect after !== before (flipped), jumping false at the end, no console errors
  ```
  Screenshot mid-pull (call ~30 frames) to see the flash. Build passes.

- [ ] **Step 5: Commit** `git add src/jumpcontroller.js src/main.js src/ship.js && git commit --no-gpg-sign -m "feat: jump controller — gate pull, warp, world swap"`

---

## Task 8: Binary system content (two suns + new planets)

**Files:**
- Modify: `src/worlddata.js` (`BINARY.planets`)

- [ ] **Step 1: Author 4 binary planets** in a distinct palette, using the existing planet def shape. Example (tune freely):
```js
BINARY.planets = [
  { name:'EMBER',  radius:40, orbit:300, speed:0.006, color:0xff6a4a, bandA:0xff8a5a, bandB:0xc03020 },
  { name:'TOXIN',  radius:34, orbit:520, speed:0.004, color:0x8fe04a, bandA:0xa0ff5a, bandB:0x4f9020 },
  { name:'GLACIES',radius:48, orbit:760, speed:0.003, color:0x6ad0ff, bandA:0x9ae8ff, bandB:0x3080c0,
    rings:{ inner:1.4, outer:2.2, color:0xbfeaff, opacity:0.35 } },
  { name:'VIOLA',  radius:30, orbit:1000,speed:0.0022,color:0xb060e0, bandA:0xc890ff, bandB:0x7030a0 },
];
```

- [ ] **Step 2: Confirm `SolarSystem`'s two-sun path** (Task 2) lights the binary planets: both `PointLight`s present and orbiting; `uSunDir` uses the barycenter (origin) direction.

- [ ] **Step 3: Verify** by jumping into binary (Task 7 snippet) then: `g.world.activeSystem.suns.length === 2`, `g.world.activeSystem.planets.length === 4`, background tint changed. Park the ship facing a binary sun and screenshot: two suns visible, opaque new planets, distinct palette. Build passes, no errors.

- [ ] **Step 4: Commit** `git add src/worlddata.js && git commit --no-gpg-sign -m "feat: binary-star system planets + dual suns"`

---

## Task 9: Gate dependents — treasure/NPCs home-only

**Files:**
- Modify: `src/treasure.js`, `src/npc.js` (add `setActive`), `src/main.js` (toggle on jump), `src/stations.js` (ensure export `buildStation` — already done Task 3)

- [ ] **Step 1: `setActive(bool)`** on `TreasureSystem` and `NPCFleet`: hide their root group(s) and short-circuit `update()` when inactive. Keep internal state (score) intact.

- [ ] **Step 2: Drive activity by active system.** In `main.js` loop, before updating them: `const home = world.activeSystem.def.id === 'home'; treasure.setActive(home); npcs.setActive(home);` (or call once inside `JumpController._swap`/`_end`). Only `update` them when active.

- [ ] **Step 3: Verify round-trip.** From home: `treasure` visible, orbs present. Jump to binary (snippet): `treasure` hidden (`game.treasure` group `.visible===false`), `npcs` skipped, binary has its 3 stations and refuel still works (teleport to `world.activeSystem.stations[0].pos`, boost tops up). Jump back: treasure visible again, score unchanged. Build passes, zero console errors.

- [ ] **Step 4: Commit** `git add -A src && git commit --no-gpg-sign -m "feat: treasure/NPC gated to home system"`

---

## Final integration pass

- [ ] Fly the full loop in the browser (desktop): complete the home ring course in order → gate powers up → auto-pull → warp → binary system → complete its course → warp home. Confirm: timer reset works on a missed ring, HUD progress reads correctly, no console errors, `npm run build` passes.
- [ ] Device note: verify the warp flash and course feel right in landscape on the deployed/dev URL (the touch controls already work).
- [ ] Merge to `main` (per project convention — direct merge, no PR) to deploy.

## Spec coverage check

- Ring course in-order/timed/reset → Task 4. HUD progress/timer → Task 5.
- Gate power-up + auto-pull → Task 4 (`powering/online`) + Task 7 (pull).
- Warp streaks + flash → Task 6 + Task 7 envelope.
- Round-trip via per-system gates → Task 4 (per system) + Task 7 (`targetId` swap).
- Binary system (2 suns + new planets + stations + return gate) → Tasks 1,2,8.
- Approach B toggle, shared backdrop, no rebinding → Tasks 2,3.
- Treasure/NPC home-only, stations active-system → Tasks 3,9.
