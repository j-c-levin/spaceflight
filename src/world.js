import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Planet data: a stylized flat solar system. Colors are saturated and arcade.
// `color` doubles as the treasure-orb tint for that planet.
// ---------------------------------------------------------------------------
export const PLANET_DEFS = [
  { name: 'MERCURY', radius: 10,  orbit: 150, speed: 0.012, color: 0xb0a08d, bandA: 0xb0a08d, bandB: 0x8a7a68, rings: null },
  { name: 'VENUS',   radius: 14,  orbit: 240, speed: 0.009, color: 0xf0c878, bandA: 0xf0c878, bandB: 0xd49a4e, rings: { inner: 1.5, outer: 2.0, color: 0xffd9a0, opacity: 0.18 } },
  { name: 'EARTH',   radius: 18,  orbit: 340, speed: 0.007, color: 0x4fa8f0, bandA: 0x3f8fe8, bandB: 0x39c98a, rings: null, moon: true },
  { name: 'MARS',    radius: 13,  orbit: 450, speed: 0.006, color: 0xe06a3c, bandA: 0xe06a3c, bandB: 0xb04826, rings: null },
  { name: 'JUPITER', radius: 60,  orbit: 650, speed: 0.004, color: 0xe0a468, bandA: 0xe8b87e, bandB: 0xb06a44, rings: { inner: 1.4, outer: 1.8, color: 0xffc890, opacity: 0.22 } },
  { name: 'SATURN',  radius: 52,  orbit: 900, speed: 0.003, color: 0xf0d49a, bandA: 0xf0d49a, bandB: 0xc8a060, rings: { inner: 1.5, outer: 2.6, color: 0xffe0b0, opacity: 0.45 } },
  { name: 'URANUS',  radius: 32,  orbit: 1120, speed: 0.0022, color: 0x7fe0e8, bandA: 0x7fe0e8, bandB: 0x4fb0c8, rings: { inner: 1.5, outer: 2.0, color: 0xa0f0ff, opacity: 0.3, tilt: 1.3 } },
  { name: 'NEPTUNE', radius: 30,  orbit: 1320, speed: 0.0018, color: 0x4f74e8, bandA: 0x4f74e8, bandB: 0x3050b8, rings: { inner: 1.4, outer: 1.9, color: 0x80a0ff, opacity: 0.3 } },
];

// ---------------------------------------------------------------------------
// Banded planet shader: soft latitudinal stripes that drift over time, lit by
// a half-lambert term from the sun direction plus a deliberate self-glow so
// every body reads against the dark sky.
// ---------------------------------------------------------------------------
function makePlanetMaterial(def) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBandA: { value: new THREE.Color(def.bandA) },
      uBandB: { value: new THREE.Color(def.bandB) },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBandA;
      uniform vec3 uBandB;
      uniform vec3 uSunDir;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPos;

      float hash(float n) { return fract(sin(n) * 43758.5453); }
      float noise1(float x) {
        float i = floor(x), f = fract(x);
        return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
      }

      void main() {
        vec3 n = normalize(vPos);
        float lat = n.y;                       // -1..1 across the sphere
        float lon = atan(n.z, n.x);
        // drifting wobbly bands
        float wobble = noise1(lon * 2.0 + uTime * 0.05) * 0.25;
        float band = sin(lat * 9.0 + wobble * 4.0 + uTime * 0.06)
                   + 0.5 * sin(lat * 21.0 - uTime * 0.04 + wobble * 6.0);
        float t = smoothstep(-1.2, 1.2, band);
        vec3 albedo = mix(uBandA, uBandB, t);

        // half-lambert: bright, soft lighting; never harsh shadow
        float l = dot(normalize(vNormal), normalize(uSunDir)) * 0.5 + 0.5;
        float light = 0.45 + 0.65 * l * l;

        // faint self-glow & rim so it pops against the sky
        float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
        vec3 col = albedo * light + albedo * 0.18 + albedo * rim * 0.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function makeRing(def, planetRadius) {
  const r = def.rings;
  const inner = planetRadius * r.inner;
  const outer = planetRadius * r.outer;
  const geo = new THREE.RingGeometry(inner, outer, 96, 1);
  // remap UVs so u runs radially (RingGeometry uvs are planar by default)
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (d - inner) / (outer - inner), 0);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(r.color) },
      uOpacity: { value: r.opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float u = vUv.x;
        float fade = smoothstep(0.0, 0.15, u) * smoothstep(1.0, 0.6, u);
        float bands = 0.75 + 0.25 * sin(u * 40.0);
        gl_FragColor = vec4(uColor * 1.15, fade * bands * uOpacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2 + (r.tilt ?? 0.12);
  return mesh;
}

// soft round sprite texture shared by stars / dust / glows
export function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.glowTex = makeGlowTexture();

    // ---- lighting: bright and even, colors pop ----
    scene.add(new THREE.AmbientLight(0x8890b0, 1.4));
    this.sunLight = new THREE.PointLight(0xfff2d0, 30000, 0, 1.8);
    scene.add(this.sunLight);

    // ---- the sun ----
    const sunGeo = new THREE.SphereGeometry(55, 48, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd860 });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(this.sun);
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffc040, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sunGlow.scale.setScalar(290);
    this.sun.add(sunGlow);

    // ---- planets ----
    this.planets = PLANET_DEFS.map((def, i) => {
      const group = new THREE.Group();
      const mat = makePlanetMaterial(def);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 48, 32), mat);
      group.add(mesh);
      if (def.rings) group.add(makeRing(def, def.radius));
      let moon = null;
      if (def.moon) {
        moon = new THREE.Mesh(
          new THREE.SphereGeometry(4.2, 24, 16),
          new THREE.MeshStandardMaterial({ color: 0xb8b8c0, emissive: 0x303038, roughness: 0.9 })
        );
        group.add(moon);
      }
      scene.add(group);
      return {
        def,
        group,
        mat,
        moon,
        angle: (i * 2.4 + 1.1) % (Math.PI * 2), // scattered starting angles
        deliveryRadius: def.radius * 2.2 + 10,
        color: new THREE.Color(def.color),
      };
    });

    this.buildStarfield();
    this.buildDust();
  }

  buildStarfield() {
    const N = 2800;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const palette = [
      new THREE.Color(0xffffff), new THREE.Color(0xcfe0ff),
      new THREE.Color(0xffe8c0), new THREE.Color(0xffd0e0),
      new THREE.Color(0xc0f0ff),
    ];
    for (let i = 0; i < N; i++) {
      // random direction on sphere
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const R = 3500;
      positions[i * 3] = s * Math.cos(phi) * R;
      positions[i * 3 + 1] = u * R;
      positions[i * 3 + 2] = s * Math.sin(phi) * R;
      const c = palette[(Math.random() * palette.length) | 0].clone();
      const isBright = Math.random() < 0.025;
      c.multiplyScalar(isBright ? 1.1 : 0.3 + Math.random() * 0.4);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      sizes[i] = isBright ? 14 : 3.5 + Math.random() * 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.glowTex } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // depth-test ON so opaque planets/sun occlude the star dome (which sits at
      // radius 3500 around the camera — always farther than any planet). Without
      // this the transparent stars draw over already-rendered planets, making
      // them look see-through.
      depthTest: true,
    });
    this.starfield = new THREE.Points(geo, mat);
    this.starfield.renderOrder = -10;
    this.starfield.frustumCulled = false;
    this.scene.add(this.starfield);
  }

  // Static glowing motes, wrapped around the player in the vertex shader so
  // the field is endless. They never move — the player's motion past them is
  // the primary speed cue.
  buildDust() {
    const N = 1500;
    const BOX = new THREE.Vector3(800, 240, 800); // flatter in y: hugs the plane
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const palette = [
      new THREE.Color(0xfff4e0), new THREE.Color(0xffd890),
      new THREE.Color(0x9fc8ff), new THREE.Color(0xffb0d8),
      new THREE.Color(0xffffff),
    ];
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * BOX.x;
      positions[i * 3 + 1] = (Math.random() - 0.5) * BOX.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
      const c = palette[(Math.random() * palette.length) | 0];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      sizes[i] = 1.1 + Math.random() * 1.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: this.glowTex },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: BOX },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        uniform vec3 uCenter;
        uniform vec3 uBox;
        varying vec3 vColor;
        varying float vFade;
        void main() {
          vColor = color;
          // wrap each mote into the box centered on the player
          vec3 p = mod(position - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          gl_PointSize = aSize * 220.0 / max(dist, 1.0);
          // fade in at the wrap boundary and very close to the camera
          vFade = smoothstep(380.0, 290.0, dist) * smoothstep(1.0, 6.0, dist);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor;
        varying float vFade;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor * 0.8, t.a * vFade * 0.55);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  planetPosition(p, out) {
    out.set(Math.cos(p.angle) * p.def.orbit, 0, Math.sin(p.angle) * p.def.orbit);
    return out;
  }

  update(dt, cameraPos) {
    this.time += dt;
    for (const p of this.planets) {
      p.angle += p.def.speed * dt;
      this.planetPosition(p, p.group.position);
      p.mat.uniforms.uTime.value = this.time;
      p.mat.uniforms.uSunDir.value.copy(p.group.position).negate().normalize();
      p.group.rotation.y += dt * 0.03;
      if (p.moon) {
        const a = this.time * 0.25 + 2;
        p.moon.position.set(Math.cos(a) * p.def.radius * 2.2, 1.5, Math.sin(a) * p.def.radius * 2.2);
      }
    }
    // sky + dust follow the camera
    this.starfield.position.copy(cameraPos);
    this.dust.material.uniforms.uCenter.value.copy(cameraPos);
  }
}
