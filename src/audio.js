// Fully synthesized WebAudio: ambient music, engine hum, and one-shot SFX.
// No audio files — everything is oscillators and filtered noise. The context
// is created on the first user gesture (browser autoplay policy), which is
// the same click that grabs pointer lock, so sound starts with control.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineNodes = null;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window['webkitAudioContext'])();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(ctx.destination);

    // gentle feedback delay shared by sfx/music for space
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.34;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.master);

    this.startMusic();
    this.startEngine();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
    }
  }

  // ---------------- music: upbeat synthwave groove ----------------
  // A 16th-note step sequencer scheduled ahead on the audio clock: soft
  // four-on-the-floor kick, offbeat hats, a driving octave bassline, a bright
  // arpeggio, and pads following a 4-bar progression. All synthesized.
  startMusic() {
    const ctx = this.ctx;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.9;
    this.musicBus.connect(this.master);

    // ---- pad bed (retuned each bar to the current chord) ----
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 900;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.035;
    padGain.connect(padLp).connect(this.musicBus);
    this.padOscs = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = [-6, 4, -3, 7][i];
      o.connect(padGain);
      o.start();
      this.padOscs.push(o);
    }

    // C major lift: C — G — Am — F (midi note numbers, voiced around C3-C4)
    const PROG = [
      [48, 52, 55, 60], // C  E  G  C
      [55, 59, 62, 67], // G  B  D  G
      [57, 60, 64, 69], // A  C  E  A
      [53, 57, 60, 65], // F  A  C  F
    ];
    const ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2]; // chord-tone walk, octave up
    const tempo = 126;
    const stepDur = 60 / tempo / 4; // 16th notes
    let step = 0;
    let nextTime = ctx.currentTime + 0.1;

    const scheduleStep = (s, t) => {
      const bar = (s >> 4) % PROG.length;
      const pos = s & 15;
      const chord = PROG[bar];

      // retune pads on the downbeat
      if (pos === 0) {
        this.padOscs.forEach((o, i) =>
          o.frequency.setTargetAtTime(midi(chord[i]), t, 0.08));
      }
      // kick: four on the floor, soft and round
      if (pos % 4 === 0) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g).connect(this.musicBus);
        o.start(t); o.stop(t + 0.2);
      }
      // hats: offbeat 8ths bright, light ticks elsewhere
      if (pos % 2 === 0) {
        const len = ctx.sampleRate * 0.04;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        const g = ctx.createGain();
        g.gain.value = pos % 4 === 2 ? 0.05 : 0.018;
        src.connect(hp).connect(g).connect(this.musicBus);
        src.start(t);
      }
      // bass: driving root 8ths, octave bounce
      if (pos % 2 === 0) {
        const note = chord[0] - 12 + (pos % 8 === 4 ? 12 : 0);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(note);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.085, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
        o.connect(g).connect(this.musicBus);
        o.start(t); o.stop(t + stepDur * 2);
      }
      // arp: bright 16th-note chord-tone runs (skips a few steps to breathe)
      if (pos % 16 !== 7 && pos % 16 !== 15) {
        const note = chord[ARP_PATTERN[pos % 8] % chord.length] + 12;
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = midi(note);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.028, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.4);
        o.connect(g);
        g.connect(this.musicBus);
        g.connect(this.delay);
        o.start(t); o.stop(t + stepDur * 1.6);
      }
      // sparkle: occasional high answer note
      if (pos === 12 && Math.random() < 0.45) {
        this.pluck(midi(chord[(Math.random() * 4) | 0] + 24), 0.04, 0.7);
      }
    };

    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      while (nextTime < ctx.currentTime + 0.15) {
        scheduleStep(step, nextTime);
        step++;
        nextTime += stepDur;
      }
    }, 40);
  }

  pluck(freq, vol, decay) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + decay + 0.1);
  }

  // ---------------- engine: filtered noise that tracks speed ----------------
  startEngine() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 120;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.02;

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 48;
    const subG = ctx.createGain();
    subG.gain.value = 0.015;

    src.connect(bp).connect(g).connect(this.master);
    sub.connect(subG).connect(this.master);
    src.start();
    sub.start();
    this.engineNodes = { bp, g, sub, subG };
  }

  updateEngine(speedFactor, boosting) {
    if (!this.engineNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { bp, g, sub, subG } = this.engineNodes;
    const boost = boosting ? 1 : 0;
    bp.frequency.setTargetAtTime(90 + speedFactor * 500 + boost * 700, t, 0.1);
    g.gain.setTargetAtTime(0.012 + speedFactor * 0.05 + boost * 0.05, t, 0.1);
    sub.frequency.setTargetAtTime(40 + speedFactor * 35 + boost * 25, t, 0.1);
    subG.gain.setTargetAtTime(0.01 + speedFactor * 0.025, t, 0.1);
  }

  // ---------------- one-shot SFX ----------------
  blip(freq, endFreq, dur, vol, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, vol, freq = 2000) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  pickup() { this.blip(620, 990, 0.18, 0.14); this.blip(930, 1480, 0.22, 0.1); }
  delivery() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.pluck(f, 0.12, 0.9), i * 90));
  }
  fireNet() { this.blip(880, 180, 0.16, 0.12, 'square'); this.noiseBurst(0.08, 0.05, 3000); }
  sparkHit() { this.noiseBurst(0.18, 0.1, 1500); this.blip(300, 90, 0.12, 0.06, 'sawtooth'); }
  shipPop() { this.noiseBurst(0.3, 0.14, 800); this.blip(420, 60, 0.3, 0.12, 'square'); }
  refuel() { this.blip(330, 1320, 0.5, 0.1); this.blip(660, 2200, 0.4, 0.05); }
  boostOn() { this.blip(140, 420, 0.4, 0.07, 'sawtooth'); }
  enemyShot(dist) {
    const vol = Math.max(0.015, 0.07 - dist * 0.0006);
    this.blip(1200, 300, 0.1, vol, 'square');
  }
}
