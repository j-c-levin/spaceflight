import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { World } from './world.js';
import { PlayerShip, FLIGHT } from './ship.js';
import { ChaseCamera } from './camera.js';
import { EngineTrail, Sparks, FlashRings } from './effects.js';
import { NPCFleet } from './npc.js';
import { Combat } from './combat.js';
import { TreasureSystem } from './treasure.js';
import { Stations } from './stations.js';
import { HUD } from './hud.js';
import { GameAudio } from './audio.js';
import { Warp } from './warp.js';
import { JumpController } from './jumpcontroller.js';

// ---------------------------------------------------------------------------
// Bootstrap. No menus, no screens — the sandbox is alive from the first frame.
// ---------------------------------------------------------------------------
const sceneCanvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1e); // dark blue-purple, never black

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 9000);

// bloom: the sun, engines, orbs, rings all glow
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.5, 0.68
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- systems ----
const input = new Input(sceneCanvas);
const touch = new TouchControls(input);
const world = new World(scene);
const ship = new PlayerShip(scene, world.glowTex);
const chaseCam = new ChaseCamera(camera);
const audio = new GameAudio();

const effects = {
  trail: new EngineTrail(scene, ship.mesh),
  sparks: new Sparks(scene, world.glowTex),
  flashRings: new FlashRings(scene),
};
const npcs = new NPCFleet(scene, world.glowTex);
const combat = new Combat(scene, world.glowTex);
const treasure = new TreasureSystem(scene, world, world.glowTex);
const stations = new Stations(scene);
const hud = new HUD();

const warp = new Warp(camera, world.starfield);

const game = { scene, camera, input, world, ship, npcs, combat, treasure, stations, effects, audio, hud, warp };
const jump = new JumpController(game, warp);
game.jump = jump;
window.game = game; // dev console access

// flash + sound whenever a gate ring is cleared (onClear gets the cleared count,
// so the just-cleared ring is rings[i - 1])
world.systems.forEach((s) => {
  s.gate.onClear = (i) => {
    effects.flashRings.spawn(s.gate.rings[i - 1].pos, 0x9b6bff, { maxScale: 90, duration: 0.8 });
    audio.fireNet?.();
  };
});

// audio can only start on a user gesture — the same one that locks the pointer
for (const evt of ['click', 'keydown']) {
  document.addEventListener(evt, () => audio.start(), { once: false });
}

function handleResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  composer.setSize(w, h);
}
window.addEventListener('resize', handleResize);
// iOS standalone fires 'resize' unreliably on rotation/cold-launch; re-sync on
// orientation and visual-viewport changes too, deferred a frame so dimensions
// have settled before we read them.
window.addEventListener('orientationchange', () => requestAnimationFrame(handleResize));
window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(handleResize));

// ---- main loop ----
let last = performance.now();
let wasBoosting = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05); // clamp tab-switch spikes
  last = now;
  const t = now / 1000;

  input.update(dt);
  touch.update(dt);

  if (input.mutePressed) audio.setMuted(!audio.muted);
  if (input.firePressed && !jump.jumping) {
    combat.fireNet(ship, camera, input.cursor);
    audio.fireNet();
  }
  if (input.clickPressed && !jump.jumping) {
    combat.trySelect(input.cursor, camera, npcs);
  }

  ship.update(dt, input);
  if (ship.boosting && !wasBoosting) audio.boostOn();
  wasBoosting = ship.boosting;

  chaseCam.update(dt, ship, input);
  camera.updateMatrixWorld();

  world.update(dt, camera.position, ship.pos);
  jump.update(dt);

  // treasure orbs & NPCs live only in the home system — hide/freeze them away.
  const homeActive = world.activeSystem.def.id === 'home';
  treasure.setActive(homeActive);
  npcs.setActive(homeActive);

  npcs.update(dt, game);
  combat.update(dt, game);
  treasure.update(dt, game);
  stations.update(dt, game);

  ship.root.updateMatrixWorld(true);
  const speedFactor = Math.min(ship.speed / FLIGHT.maxSpeed, 1);
  effects.trail.update(camera, speedFactor, ship.boosting);
  effects.sparks.update(dt);
  effects.flashRings.update(dt, camera);

  audio.updateEngine(speedFactor, ship.boosting);
  hud.update(game, t);

  input.consume();
  composer.render();
}
requestAnimationFrame(frame);
