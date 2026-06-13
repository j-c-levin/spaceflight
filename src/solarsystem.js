import * as THREE from 'three';
import { makePlanetMaterial, makeRing } from './world.js';
import { buildStation } from './stations.js';
import { JumpGate } from './jumpgate.js';

const STATION_SCALE = 3;

// ---------------------------------------------------------------------------
// One self-contained solar system, built from a def into a single toggleable
// THREE.Group. The World manager owns several of these and shows one at a time.
// The home system here is a faithful copy of what world.js used to build.
// ---------------------------------------------------------------------------
export class SolarSystem {
  constructor(scene, def, glowTex) {
    this.scene = scene;
    this.def = def;
    this.glowTex = glowTex;

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // ---- suns ----
    this.suns = def.suns.map((s) => {
      const sunGeo = new THREE.SphereGeometry(s.radius, 48, 32);
      const sunMat = new THREE.MeshBasicMaterial({ color: s.color });
      const mesh = new THREE.Mesh(sunGeo, sunMat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: s.glow, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.setScalar(s.glowScale);
      mesh.add(glow);
      this.group.add(mesh);
      const light = new THREE.PointLight(0xfff2d0, 30000 / def.suns.length, 0, 1.8);
      this.group.add(light);
      return { def: s, mesh, light };
    });

    // ---- planets ----
    this.planets = def.planets.map((pdef, i) => {
      const group = new THREE.Group();
      const mat = makePlanetMaterial(pdef);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(pdef.radius, 48, 32), mat);
      group.add(mesh);
      if (pdef.rings) group.add(makeRing(pdef, pdef.radius));
      let moon = null;
      if (pdef.moon) {
        moon = new THREE.Mesh(
          new THREE.SphereGeometry(4.2, 24, 16),
          new THREE.MeshStandardMaterial({ color: 0xb8b8c0, emissive: 0x303038, roughness: 0.9 })
        );
        group.add(moon);
      }
      this.group.add(group);
      return {
        def: pdef,
        group,
        mat,
        moon,
        angle: (i * 2.4 + 1.1) % (Math.PI * 2), // scattered starting angles
        deliveryRadius: pdef.radius * 2.2 + 10,
        color: new THREE.Color(pdef.color),
      };
    });

    // ---- stations ----
    this.stations = (def.stations || []).map((p) => {
      const mesh = buildStation();
      mesh.scale.setScalar(STATION_SCALE);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.rotation.y = Math.random() * Math.PI;
      this.group.add(mesh);
      return { mesh, pos: new THREE.Vector3(p[0], p[1], p[2]), recharged: false };
    });

    // ---- jump gate ----
    this.gate = new JumpGate(this.group, def.gate, glowTex);
  }

  get sunPositions() {
    return this.suns.map((s) => s.mesh.position);
  }

  setVisible(b) {
    this.group.visible = b;
  }

  update(dt, shipPos) {
    // multi-sun systems orbit their suns about the shared barycenter (origin)
    if (this.def.suns.length > 1) {
      for (const s of this.suns) {
        s.def.phase += (this.def.barycenterSpeed || 0) * dt;
        const x = Math.cos(s.def.phase) * s.def.orbit;
        const z = Math.sin(s.def.phase) * s.def.orbit;
        s.mesh.position.set(x, 0, z);
        s.light.position.set(x, 0, z);
      }
    }

    // planets orbit exactly as the old world.js did
    for (const p of this.planets) {
      p.angle += p.def.speed * dt;
      p.group.position.set(
        Math.cos(p.angle) * p.def.orbit, 0, Math.sin(p.angle) * p.def.orbit
      );
      p.mat.uniforms.uTime.value += dt;
      p.mat.uniforms.uSunDir.value.copy(p.group.position).negate().normalize();
      p.group.rotation.y += dt * 0.03;
      if (p.moon) {
        const a = p.mat.uniforms.uTime.value * 0.25 + 2;
        p.moon.position.set(
          Math.cos(a) * p.def.radius * 2.2, 1.5, Math.sin(a) * p.def.radius * 2.2
        );
      }
    }

    this.gate.update(dt, shipPos);
  }
}
