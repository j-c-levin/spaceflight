import * as THREE from 'three';

const CYAN = 'rgba(62, 230, 255, 0.9)';
const SEGS = 10;

// ---------------------------------------------------------------------------
// HUD: static chrome lives in the DOM (styled in CSS); per-frame markers
// (reticle, waypoint, target) are drawn on a transparent 2D canvas.
// ---------------------------------------------------------------------------
export class HUD {
  constructor() {
    this.canvas = document.getElementById('hud-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.throttleFill = document.getElementById('throttle-fill');
    this.speedValue = document.getElementById('speed-value');
    this.muteIcon = document.getElementById('mute-icon');

    const segsEl = document.getElementById('boost-segs');
    this.segs = [];
    for (let i = 0; i < SEGS; i++) {
      const d = document.createElement('div');
      d.className = 'boost-seg';
      segsEl.appendChild(d);
      this.segs.push(d);
    }

    this._v = new THREE.Vector3();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
  }

  // world position → screen px; flags when behind the camera
  project(world, camera) {
    this._v.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const behind = this._v.z > 0;
    this._v.applyMatrix4(camera.projectionMatrix);
    let x = (this._v.x * 0.5 + 0.5) * this.w;
    let y = (-this._v.y * 0.5 + 0.5) * this.h;
    if (behind) { x = this.w - x; y = this.h - y; }
    return { x, y, behind };
  }

  // clamp a projected point to the screen edge; returns angle pointing out
  clampToEdge(p, margin) {
    const cx = this.w / 2, cy = this.h / 2;
    let dx = p.x - cx, dy = p.y - cy;
    if (p.behind) {
      // force off-screen so it always clamps when behind
      const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * this.w;
      dy = (dy / len) * this.h;
    }
    const maxX = cx - margin, maxY = cy - margin;
    const scale = Math.max(Math.abs(dx) / maxX, Math.abs(dy) / maxY);
    const clamped = scale > 1 || p.behind;
    if (clamped) {
      dx /= scale; dy /= scale;
    }
    return { x: cx + dx, y: cy + dy, clamped, angle: Math.atan2(dy, dx) };
  }

  drawReticle(cursor) {
    const ctx = this.ctx;
    const x = (cursor.x * 0.5 + 0.5) * this.w;
    const y = (-cursor.y * 0.5 + 0.5) * this.h;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 6;
    const r = 14, g = 5;
    ctx.beginPath();
    // four bracket ticks around the aim point
    ctx.moveTo(x - r, y - g); ctx.lineTo(x - r, y - r); ctx.lineTo(x - g, y - r);
    ctx.moveTo(x + g, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y - g);
    ctx.moveTo(x + r, y + g); ctx.lineTo(x + r, y + r); ctx.lineTo(x + g, y + r);
    ctx.moveTo(x - g, y + r); ctx.lineTo(x - r, y + r); ctx.lineTo(x - r, y + g);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  drawArrow(x, y, angle, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(2, -7);
    ctx.lineTo(2, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawWaypoint(planet, camera, shipPos) {
    const color = `#${planet.color.getHexString()}`;
    const p = this.project(planet.group.position, camera);
    const e = this.clampToEdge(p, 60);
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    // diamond marker
    const s = 11;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - s);
    ctx.lineTo(e.x + s, e.y);
    ctx.lineTo(e.x, e.y + s);
    ctx.lineTo(e.x - s, e.y);
    ctx.closePath();
    ctx.stroke();

    if (e.clamped) this.drawArrow(e.x + Math.cos(e.angle) * 22, e.y + Math.sin(e.angle) * 22, e.angle, color);

    const dist = planet.group.position.distanceTo(shipPos) | 0;
    ctx.font = '11px "Lucida Console", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(planet.def.name, e.x, e.y - s - 8);
    ctx.fillText(`${dist}`, e.x, e.y + s + 16);
    ctx.shadowBlur = 0;
  }

  // small circular markers showing where uncollected treasure orbs are,
  // tinted to match their destination planet
  drawOrbMarker(orb, camera, shipPos) {
    const color = `#${orb.planet.color.getHexString()}`;
    const p = this.project(orb.mesh.position, camera);
    const e = this.clampToEdge(p, 42);
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(e.x, e.y, 2, 0, Math.PI * 2);
    ctx.fill();
    if (e.clamped) {
      this.drawArrow(e.x + Math.cos(e.angle) * 16, e.y + Math.sin(e.angle) * 16, e.angle, color);
    } else {
      const dist = orb.mesh.position.distanceTo(shipPos) | 0;
      ctx.font = '10px "Lucida Console", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${dist}`, e.x, e.y + 20);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  drawTargetMarker(intercept, camera, time) {
    const p = this.project(intercept, camera);
    const e = this.clampToEdge(p, 50);
    const ctx = this.ctx;
    const color = 'rgba(255, 120, 80, 0.95)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    // rotating corner-bracket square at the predicted intercept point
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.sin(time * 2) * 0.12);
    const s = 16, g = 7;
    ctx.beginPath();
    ctx.moveTo(-s, -s + g); ctx.lineTo(-s, -s); ctx.lineTo(-s + g, -s);
    ctx.moveTo(s - g, -s); ctx.lineTo(s, -s); ctx.lineTo(s, -s + g);
    ctx.moveTo(s, s - g); ctx.lineTo(s, s); ctx.lineTo(s - g, s);
    ctx.moveTo(-s + g, s); ctx.lineTo(-s, s); ctx.lineTo(-s, s - g);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (e.clamped) this.drawArrow(e.x + Math.cos(e.angle) * 26, e.y + Math.sin(e.angle) * 26, e.angle, color);
    ctx.shadowBlur = 0;
  }

  update(game, time) {
    const { ship, input, treasure, combat, camera, audio } = game;

    // ---- DOM gauges ----
    this.throttleFill.style.height = `${(ship.throttle * 100) | 0}%`;
    this.speedValue.textContent = `${ship.speed | 0}`;
    this.muteIcon.classList.toggle('hidden', !audio.muted);

    const lvl = ship.boostEnergy > 0.5 ? 'lvl-green' : ship.boostEnergy > 0.25 ? 'lvl-yellow' : 'lvl-red';
    const lit = Math.round(ship.boostEnergy * SEGS);
    this.segs.forEach((seg, i) => {
      seg.className = `boost-seg${i < lit ? ` on ${lvl}` : ''}`;
    });

    // ---- canvas markers ----
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.drawReticle(input.cursor);
    if (treasure.carrying) {
      this.drawWaypoint(treasure.carrying, camera, ship.pos);
    } else {
      // empty-handed: show where the orbs are
      for (const orb of treasure.orbs) this.drawOrbMarker(orb, camera, ship.pos);
    }
    const intercept = combat.interceptPoint(ship.pos, this._v.clone());
    if (intercept) this.drawTargetMarker(intercept, camera, time);
  }
}
