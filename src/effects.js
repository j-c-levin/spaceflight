import * as THREE from 'three';

// ---------------------------------------------------------------------------
// TrailRibbon: a camera-facing triangle strip rebuilt every frame from a short
// history of emitter positions. Two of these stacked (hot thin core inside a
// wide cool glow) make the engine exhaust.
// ---------------------------------------------------------------------------
class TrailRibbon {
  constructor(scene, { maxAge, width, color, flicker = 0.18, brightness = 1.35 }) {
    this.maxAge = maxAge;
    this.width = width;
    this.points = []; // { pos, t }
    this.maxPoints = 160; // covers maxAge even at 120Hz

    const maxVerts = this.maxPoints * 2;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxVerts * 3);
    this.alphas = new Float32Array(maxVerts);
    this.ages = new Float32Array(maxVerts);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.ages, 1));
    const indices = [];
    for (let i = 0; i < this.maxPoints - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(indices);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uBoost: { value: 0 },
        uTime: { value: 0 },
        uFlicker: { value: flicker },
        uBright: { value: brightness },
      },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        attribute float aAge;
        varying float vAlpha;
        varying float vAge;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // fade out close to the camera so flying through (or alongside)
          // the trail never whites out the screen
          vAlpha = aAlpha * smoothstep(3.5, 14.0, -mv.z);
          vAge = aAge;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uBoost;
        uniform float uTime;
        uniform float uFlicker;
        uniform float uBright;
        varying float vAlpha;
        varying float vAge;
        void main() {
          // energy waves flowing fast down the ribbon — full motion, but
          // shallow modulation so it never strobes
          float stream = 1.0 - uFlicker * (0.5 + 0.5 * sin(vAge * 36.0 - uTime * 34.0));
          vec3 c = mix(uColor, vec3(1.0, 0.95, 0.85), uBoost * 0.45);
          gl_FragColor = vec4(c * (uBright + uBoost), vAlpha * stream);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide, // winding flips with the camera-facing cross product
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this._side = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._toCam = new THREE.Vector3();
  }

  update(emitterPos, camera, intensity, boost) {
    const now = performance.now() / 1000;
    this.points.push({ pos: emitterPos.clone(), t: now });
    while (this.points.length > this.maxPoints ||
           (this.points.length && now - this.points[0].t > this.maxAge)) {
      this.points.shift();
    }
    this.material.uniforms.uBoost.value = boost ? 1 : 0;
    // mod by 200π keeps sin() precise; any integer time-multiplier lands on
    // an exact 2π multiple at the wrap, so it stays seamless
    this.material.uniforms.uTime.value = now % (200 * Math.PI);

    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const age = (now - p.t) / this.maxAge;
      const fade = Math.max(0, 1 - age);
      // direction along the trail
      const prev = this.points[Math.max(0, i - 1)].pos;
      const next = this.points[Math.min(n - 1, i + 1)].pos;
      this._dir.subVectors(next, prev);
      if (this._dir.lengthSq() < 1e-10) this._dir.set(0, 1, 0);
      this._dir.normalize();
      this._toCam.subVectors(camera.position, p.pos).normalize();
      this._side.crossVectors(this._dir, this._toCam);
      // looking straight down the trail the cross degenerates — fall back to
      // the camera's right axis so the ribbon stays a screen-facing strip
      if (this._side.lengthSq() < 1e-4) {
        this._side.setFromMatrixColumn(camera.matrixWorld, 0);
      }
      this._side.normalize();
      const w = this.width * (0.3 + 0.7 * fade) * (boost ? 1.6 : 1);
      const base = i * 6;
      this.positions[base] = p.pos.x + this._side.x * w;
      this.positions[base + 1] = p.pos.y + this._side.y * w;
      this.positions[base + 2] = p.pos.z + this._side.z * w;
      this.positions[base + 3] = p.pos.x - this._side.x * w;
      this.positions[base + 4] = p.pos.y - this._side.y * w;
      this.positions[base + 5] = p.pos.z - this._side.z * w;
      const a = Math.pow(fade, 1.4) * intensity;
      this.alphas[i * 2] = a;
      this.alphas[i * 2 + 1] = a;
      this.ages[i * 2] = age;
      this.ages[i * 2 + 1] = age;
    }
    // collapse unused verts onto the last point
    for (let i = n; i < this.maxPoints; i++) {
      const src = n > 0 ? (n - 1) * 6 : 0;
      this.positions.copyWithin(i * 6, src, src + 6);
      this.alphas[i * 2] = 0;
      this.alphas[i * 2 + 1] = 0;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
    this.mesh.geometry.attributes.aAge.needsUpdate = true;
  }
}

export class EngineTrail {
  constructor(scene, shipMesh) {
    this.engines = shipMesh.userData.engines;
    this.tips = shipMesh.userData.tips;
    // engine exhaust: a hot core inside a cool glow
    this.enginePairs = this.engines.map(() => ({
      glow: new TrailRibbon(scene, { maxAge: 1.0, width: 0.8, color: 0x2f6fff }),
      core: new TrailRibbon(scene, { maxAge: 0.65, width: 0.3, color: 0xcfeaff }),
    }));
    // wingtip contrails: long, thin, crisp lines that trace every twist and
    // turn — the Freelancer signature
    this.tipLines = this.tips.map(() => new TrailRibbon(scene, {
      maxAge: 1.7, width: 0.14, color: 0xeaf8ff, flicker: 0.12, brightness: 1.5,
    }));
    this._world = new THREE.Vector3();
  }

  update(camera, speedFactor, boost) {
    const intensity = Math.min(0.8, 0.25 + speedFactor * 0.6 + (boost ? 0.3 : 0));
    for (let i = 0; i < this.engines.length; i++) {
      this.engines[i].getWorldPosition(this._world);
      this.enginePairs[i].glow.update(this._world, camera, intensity * 0.4, boost);
      this.enginePairs[i].core.update(this._world, camera, intensity * 0.8, boost);
    }
    const lineIntensity = Math.min(0.75, 0.15 + speedFactor * 0.65 + (boost ? 0.25 : 0));
    for (let i = 0; i < this.tips.length; i++) {
      this.tips[i].getWorldPosition(this._world);
      this.tipLines[i].update(this._world, camera, lineIntensity, boost);
    }
  }
}

// ---------------------------------------------------------------------------
// Sparks: pooled additive points with velocity + lifetime.
// ---------------------------------------------------------------------------
export class Sparks {
  constructor(scene, glowTex, max = 600) {
    this.max = max;
    this.particles = []; // { pos, vel, life, maxLife, ci }
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: glowTex } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * 160.0 / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, texture2D(uTex, gl_PointCoord).a);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(pos, color, count = 20, speed = 18) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.max) this.particles.shift();
      const dir = new THREE.Vector3(
        Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5
      ).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.9));
      this.particles.push({
        pos: pos.clone(), vel: dir,
        life: 0, maxLife: 0.4 + Math.random() * 0.5,
        color: c.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.5),
        size: 1 + Math.random() * 1.6,
      });
    }
  }

  update(dt) {
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.particles.splice(i, 1); continue; }
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - 2.2 * dt);
      const fade = 1 - p.life / p.maxLife;
      this.positions[n * 3] = p.pos.x;
      this.positions[n * 3 + 1] = p.pos.y;
      this.positions[n * 3 + 2] = p.pos.z;
      this.colors[n * 3] = p.color.r * fade * 2;
      this.colors[n * 3 + 1] = p.color.g * fade * 2;
      this.colors[n * 3 + 2] = p.color.b * fade * 2;
      this.sizes[n] = p.size * fade;
      n++;
    }
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Flash rings: expanding camera-facing rings for pickups / deliveries /
// station refuels.
// ---------------------------------------------------------------------------
export class FlashRings {
  constructor(scene) {
    this.scene = scene;
    this.rings = []; // { mesh, life, maxLife, maxScale }
    this.geo = new THREE.RingGeometry(0.85, 1.0, 48);
  }

  spawn(pos, color, { maxScale = 14, duration = 0.7 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0, maxLife: duration, maxScale });
  }

  update(dt, camera) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const t = r.life / r.maxLife;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - t, 3);
      r.mesh.scale.setScalar(0.5 + ease * r.maxScale);
      r.mesh.material.opacity = (1 - t) * 1.2;
      r.mesh.quaternion.copy(camera.quaternion); // face the camera
    }
  }
}
