import * as THREE from 'three';

const REFUEL_RADIUS = 70;

// Compact modular refuel stations with a glowing docking ring. Flying close
// instantly tops up boost energy with an expanding-ring pulse.
export function buildStation() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    color: 0x9aa8c0, roughness: 0.5, metalness: 0.5,
    emissive: 0x222a3a, emissiveIntensity: 1,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 7, 8), hull);
  g.add(core);
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 2.0), hull);
    pod.position.set(side * 3.4, 1.2 * side, 0);
    g.add(pod);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.1, 1.6),
      new THREE.MeshStandardMaterial({
        color: 0x2a4a8a, roughness: 0.3, metalness: 0.6,
        emissive: 0x1a3aff, emissiveIntensity: 0.4,
      })
    );
    panel.position.set(side * 7.2, 0, 0);
    g.add(panel);
  }
  // the glowing docking ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.5, 0.35, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0x55ffee })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.userData.ring = ring;
  return g;
}

export class Stations {
  constructor(scene) {
    this.scene = scene;
    // Stations now live on each SolarSystem; this manager just runs the
    // refuel proximity/pulse logic against the active system's stations.
  }

  update(dt, game) {
    const { ship, effects, audio } = game;
    for (const st of game.world.stations) {
      st.mesh.rotation.y += dt * 0.08;
      st.mesh.userData.ring.rotation.z += dt * 0.3;
      const near = st.pos.distanceTo(ship.pos) < REFUEL_RADIUS;
      if (near && !st.recharged && ship.boostEnergy < 0.98) {
        ship.boostEnergy = 1;
        effects.flashRings.spawn(st.pos, 0x55ffee, { maxScale: 55, duration: 0.9 });
        audio.refuel();
        st.recharged = true; // pulse once per visit
      }
      if (!near) st.recharged = false;
    }
  }
}
