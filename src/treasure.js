import * as THREE from 'three';

const WAVE_SIZE = 4;
const WAVE_PAUSE = 3.5;
const PICKUP_RADIUS = 11;

// ---------------------------------------------------------------------------
// Treasure: waves of glowing orbs, each tinted for a different destination
// planet. Carry one at a time; deliver into the matching planet's zone.
// ---------------------------------------------------------------------------
export class TreasureSystem {
  constructor(scene, world, glowTex) {
    this.scene = scene;
    this.world = world;
    this.glowTex = glowTex;
    this.orbs = [];        // { mesh, planet, baseY, phase }
    this.carrying = null;  // planet the carried orb belongs to
    this.waveTimer = 1.5;  // first wave lands moments after start
    this.orbGeo = new THREE.SphereGeometry(2.6, 24, 16);
    this._tmp = new THREE.Vector3();
    this.active = true;
  }

  // Show/hide all orb meshes and freeze the delivery loop. Idempotent: a no-op
  // when state is unchanged, so it's safe & cheap to call every frame. All
  // internal state (orbs, carried planet, wave timer) is preserved untouched.
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    for (const o of this.orbs) o.mesh.visible = active;
  }

  spawnWave() {
    // each orb in a wave goes to a different planet
    const planets = [...this.world.planets];
    for (let i = planets.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [planets[i], planets[j]] = [planets[j], planets[i]];
    }
    for (let i = 0; i < WAVE_SIZE; i++) {
      const planet = planets[i];
      const a = Math.random() * Math.PI * 2;
      const r = 160 + Math.random() * 950;
      const pos = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 30, Math.sin(a) * r);

      const mat = new THREE.MeshBasicMaterial({ color: planet.color.clone().multiplyScalar(1.5) });
      const mesh = new THREE.Mesh(this.orbGeo, mat);
      mesh.position.copy(pos);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: planet.color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.setScalar(12);
      mesh.add(glow);
      this.scene.add(mesh);
      this.orbs.push({ mesh, planet, baseY: pos.y, phase: Math.random() * Math.PI * 2 });
    }
  }

  update(dt, game) {
    if (!this.active) return;
    const { ship, effects, audio } = game;
    const t = this.world.time;

    // wave cadence: spawn when the field is clear and nothing is carried
    if (this.orbs.length === 0 && !this.carrying) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.spawnWave();
        this.waveTimer = WAVE_PAUSE;
      }
    }

    // orbs bob & spin so they read as collectible
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.mesh.position.y = o.baseY + Math.sin(t * 1.8 + o.phase) * 0.8;
      o.mesh.rotation.y += dt * 2;

      // pickup — only with empty hands
      if (!this.carrying && o.mesh.position.distanceTo(ship.pos) < PICKUP_RADIUS) {
        this.carrying = o.planet;
        effects.flashRings.spawn(o.mesh.position, o.planet.color, { maxScale: 10, duration: 0.5 });
        audio.pickup();
        this.scene.remove(o.mesh);
        o.mesh.material.dispose();
        this.orbs.splice(i, 1);
      }
    }

    // delivery — only the matching planet's zone counts
    if (this.carrying) {
      const planetPos = this.carrying.group.position;
      if (planetPos.distanceTo(ship.pos) < this.carrying.deliveryRadius) {
        effects.flashRings.spawn(ship.pos, this.carrying.color, { maxScale: 30, duration: 1.0 });
        effects.sparks.burst(ship.pos, this.carrying.color, 30, 20);
        audio.delivery();
        this.carrying = null;
      }
    }
  }
}
