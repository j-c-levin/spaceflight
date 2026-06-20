import * as THREE from 'three';
import { buildShipMesh } from './ship.js';

const WANDER_COLORS = [0x4fd0a0, 0x4f9ee8, 0xe8d04f, 0xd84fe8, 0x7fe84f];
const HOSTILE_COLORS = [0xff3b30, 0xa040ff, 0xff8c1a];

const STATE = { WANDER: 0, APPROACH: 1, ATTACK: 2, RETREAT: 3 };

function randomDestination() {
  const a = Math.random() * Math.PI * 2;
  const r = 150 + Math.random() * 1100;
  return new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 50, Math.sin(a) * r);
}

// Wanderers roam a tighter band so the passive fleet stays visible and lively
// around the play area instead of drifting off to the far edges.
function wanderDestination() {
  const a = Math.random() * Math.PI * 2;
  const r = 120 + Math.random() * 480;
  return new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 60, Math.sin(a) * r);
}

class NPCShip {
  constructor(scene, glowTex, color, hostile) {
    this.hostile = hostile;
    this.color = color;
    this.mesh = buildShipMesh(color, hostile ? 0xffe0a0 : 0xc0f0ff, 0.85);
    scene.add(this.mesh);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: hostile ? 0xffaa66 : 0x88ccff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(1.6);
    glow.position.z = 1.8;
    this.mesh.add(glow);

    this.pos = randomDestination();
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.bank = 0;
    this.speed = hostile ? 34 : 22;
    this.baseTurnRate = hostile ? 1.1 : 0.6;

    this.state = hostile ? STATE.APPROACH : STATE.WANDER;
    this.destination = hostile ? randomDestination() : wanderDestination();
    this.stateTimer = 0;
    this.fireTimer = 0;
    this.flankSide = Math.random() < 0.5 ? -1 : 1;

    // jink (evasive dodge when the player aims at us)
    this.jinkTimer = 0;
    this.jinkDir = new THREE.Vector3();
    this.jinkCooldown = 0;

    this.alive = true;
    this.respawnTimer = 0;

    this._tmp = new THREE.Vector3();
    this._desired = new THREE.Vector3();
  }

  // steer current heading toward a target direction at a limited turn rate
  steerToward(targetDir, turnRate, dt) {
    const desiredYaw = Math.atan2(-targetDir.x, -targetDir.z);
    const flatLen = Math.hypot(targetDir.x, targetDir.z);
    const desiredPitch = THREE.MathUtils.clamp(Math.atan2(targetDir.y, flatLen), -0.9, 0.9);

    let dYaw = desiredYaw - this.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const yawStep = THREE.MathUtils.clamp(dYaw, -turnRate * dt, turnRate * dt);
    this.yaw += yawStep;
    const dPitch = desiredPitch - this.pitch;
    this.pitch += THREE.MathUtils.clamp(dPitch, -turnRate * 0.7 * dt, turnRate * 0.7 * dt);

    // bank into the turn, proportional to yaw rate — reads as alive
    const targetBank = -THREE.MathUtils.clamp(dYaw * 1.5, -1, 1) * 0.55;
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-5 * dt));
  }

  update(dt, game) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn(game);
      return;
    }

    const player = game.ship;
    this._tmp.subVectors(player.pos, this.pos);
    const distToPlayer = this._tmp.length();
    let moveSpeed = this.speed;
    let turnRate = this.baseTurnRate;

    if (!this.hostile) {
      // -------- harmless wanderer --------
      this._desired.subVectors(this.destination, this.pos);
      if (this._desired.length() < 25) this.destination = wanderDestination();
      this._desired.normalize();
      this.steerToward(this._desired, turnRate, dt);
    } else {
      // -------- hostile attack pattern --------
      this.stateTimer += dt;
      this.jinkCooldown -= dt;

      // jink: if the player's nose points at us while we're attacking, dodge
      if (this.jinkTimer > 0) {
        this.jinkTimer -= dt;
        this._desired.copy(this.jinkDir);
        moveSpeed = this.speed * 1.8;
        turnRate = this.baseTurnRate * 2.5;
      } else if (this.state === STATE.APPROACH) {
        // curving flank: aim at a point offset to one side of the player,
        // blending toward the player as we close in
        const blend = THREE.MathUtils.clamp(1 - distToPlayer / 220, 0, 1);
        const side = this._tmp.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
          .multiplyScalar(this.flankSide * 90 * (1 - blend));
        this._desired.copy(player.pos).add(side).sub(this.pos).normalize();
        moveSpeed = this.speed * 1.4;
        if (distToPlayer < 70) { this.state = STATE.ATTACK; this.stateTimer = 0; }
      } else if (this.state === STATE.ATTACK) {
        this._desired.copy(this._tmp).normalize();
        turnRate = this.baseTurnRate * 1.6;
        this.fireTimer -= dt;
        if (this.fireTimer <= 0 && distToPlayer < 90) {
          game.combat.fireCube(this, player);
          game.audio.enemyShot(distToPlayer);
          this.fireTimer = 0.45;
        }
        if (this.stateTimer > 2.2 || distToPlayer < 18) {
          this.state = STATE.RETREAT;
          this.stateTimer = 0;
          this.flankSide *= -1;
        }
        // check if the player's aim cursor is on us → jink!
        if (this.jinkCooldown <= 0) {
          const cam = game.camera;
          const cur = game.input.cursor;
          const aimDir = new THREE.Vector3(cur.x, cur.y, 0.5).unproject(cam)
            .sub(cam.position).normalize();
          const toUs = new THREE.Vector3().subVectors(this.pos, cam.position).normalize();
          if (aimDir.dot(toUs) > 0.992 && distToPlayer < 200) {
            this.jinkTimer = 0.7;
            this.jinkCooldown = 1.6;
            this.jinkDir.crossVectors(toUs, new THREE.Vector3(0, 1, 0))
              .multiplyScalar(Math.random() < 0.5 ? -1 : 1)
              .add(new THREE.Vector3(0, (Math.random() - 0.5) * 1.4, 0))
              .normalize();
          }
        }
      } else { // RETREAT — peel away behind the player, then loop back
        this._desired.copy(this._tmp).negate().normalize();
        this._desired.y += 0.2;
        this._desired.normalize();
        moveSpeed = this.speed * 1.5;
        if (this.stateTimer > 3.0) { this.state = STATE.APPROACH; this.stateTimer = 0; }
      }
      this.steerToward(this._desired, turnRate, dt);
    }

    // integrate: NPCs fly where their nose points, with slight smoothing
    const fwd = this._tmp.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.vel.lerp(fwd.multiplyScalar(moveSpeed), 1 - Math.exp(-3 * dt));
    this.pos.addScaledVector(this.vel, dt);

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.mesh.rotateZ(this.bank);
  }

  destroy(game) {
    this.alive = false;
    this.mesh.visible = false;
    this.respawnTimer = 6 + Math.random() * 6;
    game.effects.sparks.burst(this.pos, this.color, 36, 26);
  }

  respawn(game) {
    this.alive = true;
    this.mesh.visible = true;
    // spawn far from the player so it doesn't pop in
    do { this.pos.copy(randomDestination()); }
    while (this.pos.distanceTo(game.ship.pos) < 150);
    this.vel.set(0, 0, 0);
    this.destination = this.hostile ? randomDestination() : wanderDestination();
    this.state = this.hostile ? STATE.APPROACH : STATE.WANDER;
  }
}

export class NPCFleet {
  constructor(scene, glowTex) {
    this.ships = [];
    this.active = true;
    for (let i = 0; i < 5; i++) {
      this.ships.push(new NPCShip(scene, glowTex, WANDER_COLORS[i % WANDER_COLORS.length], false));
    }
    for (let i = 0; i < 3; i++) {
      this.ships.push(new NPCShip(scene, glowTex, HOSTILE_COLORS[i], true));
    }
  }

  // Show/hide the whole fleet and freeze its per-frame update. Idempotent:
  // a no-op when the state is unchanged, so it's cheap to call every frame.
  // Internal state (alive flags, positions, respawn timers) is preserved.
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    for (const s of this.ships) {
      // only a living, non-active ship's mesh should follow `active`;
      // dead ships stay hidden until they respawn.
      s.mesh.visible = active && s.alive;
    }
  }

  // Re-seed the entire fleet: every ship alive, repositioned and roaming.
  // Called when the home system (re)activates so flying back through a gate
  // always drops you into a full, lively fleet rather than a depleted one
  // whose dead ships' respawn timers were frozen while you were away.
  respawnAll(game) {
    for (const s of this.ships) {
      s.alive = true;
      s.respawnTimer = 0;
      s.respawn(game);
    }
  }

  update(dt, game) {
    if (!this.active) return;
    for (const s of this.ships) s.update(dt, game);
  }
}
