# Spaceflight — Web Prototype

A browser recreation of the Spaceflight prototype, per [GAME_SPEC.md](./GAME_SPEC.md).
Vite + Three.js, no binary assets — planets, starfield, HUD, and all audio are
generated procedurally at runtime.

## Run

```sh
npm install
npm run dev
```

Open the printed URL and **click to take control** (grabs pointer lock and
starts audio).

## Controls

| Input | Action |
|---|---|
| Mouse / Arrow keys | Move the aim cursor — the ship chases it |
| W / S | Throttle up / down (ramps) |
| Mouse wheel | Throttle jumps |
| Shift | Boost (drains energy; refuel at stations) |
| Space | Fire net |
| Left click | Select / deselect NPC target (intercept marker) |
| M | Mute |
| Esc | Release the mouse |

## The toy

- **Treasure**: glowing orbs spawn in waves of four, each tinted for a planet.
  Fly into one to carry it (one at a time), follow the waypoint marker, and fly
  into the matching planet's zone to deliver.
- **Hostiles**: three aggressive ships buzz you with harmless glowing cubes.
  Aim at them and they jink. Net them and they pop. Nothing hurts you.
- **Stations**: glowing docking rings instantly top up boost energy.
