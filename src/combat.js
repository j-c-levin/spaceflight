import * as THREE from 'three';

export const NET_SPEED = 220;

// ---------------------------------------------------------------------------
// Combat: player nets, hostile cubes, target selection & intercept prediction.
// Everything here is theatrical — cubes are harmless sparks, nets pop ships
// that respawn elsewhere.
// ---------------------------------------------------------------------------
export class Combat {
  constructor(scene, glowTex) {
    this.scene = scene;
    this.nets = [];   // { mesh, vel, life }
    this.cubes = [];  // { mesh, vel, life, spin }
    this.target = null; // selected NPC ship

    this.netGeo = new THREE.OctahedronGeometry(0.7, 0);
    this.netMat = new THREE.MeshBasicMaterial({
      color: 0x66ffcc, wireframe: true,
    });
    this.cubeGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    this.cubeMat = new THREE.MeshBasicMaterial({ color: 0xff6644 });
    this.glowTex = glowTex;

    this._tmp = new THREE.Vector3();
  }

  // Nets fly toward the point under the aim cursor — line the cursor up with
  // the intercept marker and fire. The aim ray is cast from the camera through
  // the cursor; we aim from the ship at that ray's point at target depth.
  aimDirection(ship, camera, cursor, out) {
    const rayDir = out.set(cursor.x, cursor.y, 0.5).unproject(camera)
      .sub(camera.position).normalize();
    // use the intercept distance when a target is selected, else a far point
    let depth = 400;
    const intercept = this.interceptPoint(ship.pos, new THREE.Vector3());
    if (intercept) depth = intercept.distanceTo(camera.position);
    const aimPoint = rayDir.multiplyScalar(depth).add(camera.position);
    return aimPoint.sub(ship.pos).normalize();
  }

  fireNet(ship, camera, cursor) {
    const mesh = new THREE.Mesh(this.netGeo, this.netMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0x66ffcc, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(2.4);
    mesh.add(glow);
    const vel = this.aimDirection(ship, camera, cursor, new THREE.Vector3())
      .multiplyScalar(NET_SPEED);
    mesh.position.copy(ship.pos).addScaledVector(vel, 0.012); // nudge clear of the hull
    this.scene.add(mesh);
    this.nets.push({ mesh, vel, life: 2.2 });
  }

  fireCube(npc, player) {
    const mesh = new THREE.Mesh(this.cubeGeo, this.cubeMat);
    mesh.position.copy(npc.pos);
    // lead the player slightly so cubes feel aimed
    const cubeSpeed = 95;
    const toPlayer = this._tmp.subVectors(player.pos, npc.pos);
    const eta = toPlayer.length() / cubeSpeed;
    const aim = player.pos.clone().addScaledVector(player.vel, eta * 0.7);
    const vel = aim.sub(npc.pos).normalize().multiplyScalar(cubeSpeed);
    this.scene.add(mesh);
    this.cubes.push({
      mesh, vel, life: 4,
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    });
  }

  // Predicted intercept point for the current target: where the ship will be
  // when a net fired now would reach it. Solve |D + V t| = s t for t.
  interceptPoint(playerPos, out) {
    const t0 = this.target;
    if (!t0 || !t0.alive) return null;
    const D = this._tmp.subVectors(t0.pos, playerPos);
    const V = t0.vel;
    const a = V.lengthSq() - NET_SPEED * NET_SPEED;
    const b = 2 * D.dot(V);
    const c = D.lengthSq();
    let t = 0;
    if (Math.abs(a) < 1e-4) {
      t = -c / b;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
      if (!isFinite(t)) return null;
    }
    if (t <= 0 || t > 8) return null;
    return out.copy(t0.pos).addScaledVector(V, t);
  }

  // Click selection: pick the NPC nearest the cursor in screen space.
  trySelect(cursorNDC, camera, npcs) {
    let best = null;
    let bestDist = 0.12; // generous NDC radius
    const v = new THREE.Vector3();
    for (const s of npcs.ships) {
      if (!s.alive) continue;
      v.copy(s.pos).project(camera);
      if (v.z > 1) continue; // behind the camera
      const d = Math.hypot(v.x - cursorNDC.x, v.y - cursorNDC.y);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    this.target = best; // null = clicked empty space → deselect
    return best;
  }

  update(dt, game) {
    const { ship, npcs, effects, audio } = game;

    // ---- nets ----
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const n = this.nets[i];
      n.life -= dt;
      n.mesh.position.addScaledVector(n.vel, dt);
      n.mesh.rotation.x += 8 * dt;
      n.mesh.rotation.y += 5 * dt;
      let dead = n.life <= 0;
      if (!dead) {
        for (const s of npcs.ships) {
          if (!s.alive) continue;
          if (n.mesh.position.distanceToSquared(s.pos) < 36) {
            s.destroy(game);
            audio.shipPop();
            if (this.target === s) this.target = null;
            dead = true;
            break;
          }
        }
      }
      if (dead) {
        this.scene.remove(n.mesh);
        this.nets.splice(i, 1);
      }
    }

    // ---- cubes (harmless, theatrical) ----
    for (let i = this.cubes.length - 1; i >= 0; i--) {
      const c = this.cubes[i];
      c.life -= dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      let dead = c.life <= 0;
      if (!dead && c.mesh.position.distanceToSquared(ship.pos) < 16) {
        effects.sparks.burst(ship.pos, 0xffcc66, 14, 12);
        audio.sparkHit();
        dead = true;
      }
      if (dead) {
        this.scene.remove(c.mesh);
        this.cubes.splice(i, 1);
      }
    }

    if (this.target && !this.target.alive) this.target = null;
  }
}
