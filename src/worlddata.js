// src/worlddata.js — data only; no THREE objects here.
export const HOME = {
  id: 'home',
  background: 0x0a0a1e,
  suns: [{ radius: 55, color: 0xffd860, glow: 0xffc040, glowScale: 290, orbit: 0, phase: 0 }],
  planets: [
    { name: 'MERCURY', radius: 10,  orbit: 150, speed: 0.012, color: 0xb0a08d, bandA: 0xb0a08d, bandB: 0x8a7a68, rings: null },
    { name: 'VENUS',   radius: 14,  orbit: 240, speed: 0.009, color: 0xf0c878, bandA: 0xf0c878, bandB: 0xd49a4e, rings: { inner: 1.5, outer: 2.0, color: 0xffd9a0, opacity: 0.18 } },
    { name: 'EARTH',   radius: 18,  orbit: 340, speed: 0.007, color: 0x4fa8f0, bandA: 0x3f8fe8, bandB: 0x39c98a, rings: null, moon: true },
    { name: 'MARS',    radius: 13,  orbit: 450, speed: 0.006, color: 0xe06a3c, bandA: 0xe06a3c, bandB: 0xb04826, rings: null },
    { name: 'JUPITER', radius: 60,  orbit: 650, speed: 0.004, color: 0xe0a468, bandA: 0xe8b87e, bandB: 0xb06a44, rings: { inner: 1.4, outer: 1.8, color: 0xffc890, opacity: 0.22 } },
    { name: 'SATURN',  radius: 52,  orbit: 900, speed: 0.003, color: 0xf0d49a, bandA: 0xf0d49a, bandB: 0xc8a060, rings: { inner: 1.5, outer: 2.6, color: 0xffe0b0, opacity: 0.45 } },
    { name: 'URANUS',  radius: 32,  orbit: 1120, speed: 0.0022, color: 0x7fe0e8, bandA: 0x7fe0e8, bandB: 0x4fb0c8, rings: { inner: 1.5, outer: 2.0, color: 0xa0f0ff, opacity: 0.3, tilt: 1.3 } },
    { name: 'NEPTUNE', radius: 30,  orbit: 1320, speed: 0.0018, color: 0x4f74e8, bandA: 0x4f74e8, bandB: 0x3050b8, rings: { inner: 1.4, outer: 1.9, color: 0x80a0ff, opacity: 0.3 } },
  ],
  stations: [ [260,0,120], [-520,12,330], [780,-10,-480], [-220,0,-1050] ],
  gate: { targetId: 'binary', rings: 7, arcRadius: 1650, arcSpan: 1.4, ringHole: 70,
          center: [0,0,-1650], facing: [0,0,1] },
};

export const BINARY = {
  id: 'binary',
  background: 0x140a1e,
  suns: [
    { radius: 42, color: 0xffa860, glow: 0xff8030, glowScale: 230, orbit: 95, phase: 0 },
    { radius: 30, color: 0xbfd8ff, glow: 0x90b8ff, glowScale: 180, orbit: 95, phase: Math.PI },
  ],
  barycenterSpeed: 0.05,
  planets: [
    { name: 'EMBER',   radius: 40, orbit: 300,  speed: 0.006,  color: 0xff6a4a, bandA: 0xff8a5a, bandB: 0xc03020 },
    { name: 'TOXIN',   radius: 34, orbit: 520,  speed: 0.004,  color: 0x8fe04a, bandA: 0xa0ff5a, bandB: 0x4f9020 },
    { name: 'GLACIES', radius: 48, orbit: 760,  speed: 0.003,  color: 0x6ad0ff, bandA: 0x9ae8ff, bandB: 0x3080c0,
      rings: { inner: 1.4, outer: 2.2, color: 0xbfeaff, opacity: 0.35 } },
    { name: 'VIOLA',   radius: 30, orbit: 1000, speed: 0.0022, color: 0xb060e0, bandA: 0xc890ff, bandB: 0x7030a0 },
  ],
  stations: [ [300,0,-160], [-600,20,260], [120,-10,900] ],
  gate: { targetId: 'home', rings: 7, arcRadius: 1650, arcSpan: 1.4, ringHole: 70,
          center: [0,0,1650], facing: [0,0,-1] },
};

export const SYSTEM_DEFS = [HOME, BINARY];
