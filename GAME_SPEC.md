# Spaceflight — Game Specification

> A design specification for a browser-based space-flight game. This document
> describes **what the game is and how it should feel** — not how to build it.
> No technology, engine, or implementation choices are prescribed; those are the
> implementer's to make. The intent is that a capable model can read this and
> produce the game in one pass.
>
> This describes an existing prototype. The goal is to recreate it faithfully on
> the web as a starting point, then evolve from there.

---

## 1. The Pitch

You fly a small, agile spaceship through a vibrant, stylized solar system. The
camera floats behind the ship and leans into your turns. You aim with a cursor
and the ship chases it — banking, pitching, and yawing to follow your gaze. There
is no health bar, no score, no failure. The game is a **toy you fly**, and on top
of that flying sit two light activities: **delivering glowing treasure to the
planet it belongs to**, and **tangling with a few hostile ships** who buzz you
and whom you can swat out of the sky.

The feeling to chase: the joy of *Freelancer*'s mouse-flight — smooth, weighty,
responsive — wrapped in a bright, arcade-colored cosmos that always conveys a
sense of speed.

---

## 2. Tone & Player Fantasy

- **Freelancer-lite flight.** Mouse-led, third-person, momentum-driven. The ship
  feels like it has mass but is eager to turn. Flying well should feel good on its
  own, before any objective.
- **Vibrant, not realistic.** This is a stylized, almost toy-like solar system —
  saturated planets, glowing rings, a star-dense sky. Bright and exciting, not the
  cold black void of hard sci-fi.
- **Low stakes, high flow.** Nothing kills you. Nothing ends. You can ignore every
  objective and just fly, and that should still be satisfying. The activities are
  invitations, not demands.
- **A living scene.** Other ships wander the system going about their business.
  The world feels populated and in motion even when you do nothing.

---

## 3. The Flight Model — The Heart of the Game

Everything else is decoration on top of how the ship flies. Get this right first.

**View.** Third-person. The camera floats a fixed distance behind and slightly
above the ship, looking where the ship looks.

**Aiming.** The player controls a virtual aim cursor (not the OS pointer — the OS
pointer is hidden and locked during play). Mouse movement nudges the cursor;
arrow keys also move it. The cursor lives within the screen bounds and does not
auto-recenter — it stays where you left it until you move it. A reticle at screen
center shows where you're aiming.

**Steering follows the cursor.** The ship continuously rotates to point toward the
aim cursor:
- Cursor above/below center → the ship pitches up/down.
- Cursor left/right of center → the ship yaws left/right.
- Steering is proportional: the further the cursor is from center, the harder the
  ship turns, smoothly clamped at a maximum rate. Re-centering the cursor settles
  the ship onto a straight course. It should feel like the ship is *chasing your
  gaze*, not snapping to it.

**Banking into turns (important for feel).** When you turn horizontally, the ship
**rolls into the turn** like an aircraft — banking toward the direction you're
steering. Crucially, **bank scales with throttle**: at full speed the ship leans
hard into turns; at a crawl it barely banks; a stationary ship does not bank at
all. This coupling of roll to speed is a signature part of the feel.

**Throttle.** Forward speed is governed by a throttle that *ramps* — it is not
instant. Hold a key (e.g. W) to increase throttle, another (S) to decrease;
mouse-wheel gives discrete jumps. The ship accelerates toward the throttle's
target speed with a sense of inertia. There is mild drag, so easing off throttle
coasts to a slower cruise rather than stopping dead.

**Boost.** A boost input (e.g. Shift) temporarily multiplies thrust for a burst of
speed. Boost draws from a limited **energy reserve** that drains while boosting
and recharges over a short delay when you stop (see §6 for the station mechanic).
When boosting, the camera **pulls back** to widen the view and sell the speed, and
the engine effects intensify.

**Camera behavior (sells the whole thing).** The camera is not rigidly bolted
behind the ship — it's a soft, lagging rig that adds life:
- It **swings** horizontally opposite to your aim: steer right and the camera
  swings slightly left, opening up the space you're turning into.
- It **leans** vertically with a look-ahead, biased asymmetrically — a little when
  climbing, more when diving.
- It **pulls back** during boost.
- All of this is smoothed with frame-rate-independent easing so motion is fluid,
  never jittery, and the horizon stays stable even at steep pitch.

**Reference values (the prototype's tuning, as a feel anchor — not mandatory):**
top forward thrust roughly double the lateral/vertical thrust; throttle takes
~2 seconds to ramp full; boost ~4× thrust; max bank ~35°; camera ~12 units behind
and ~2 above; camera swing ~15°. Treat these as the flavor to match, then tune by
feel.

---

## 4. The World

A **stylized solar system on a flat plane.** All planets orbit a central sun on a
single flat disc (a shared ecliptic) — there is no vertical scatter of orbits.
This flatness is intentional: it keeps the world readable and navigable.

**The Sun.** A glowing golden sphere near the center of the play space, bright
enough to bloom. It is the scene's main light source. It does not cast harsh
shadows — the whole system stays brightly, evenly lit so colors pop. Ambient light
is deliberately high; this is a vibrant scene, not a moody one.

**The planets.** Eight of them, in order outward from the sun, each visually
distinct and recognizable as its real counterpart by color and relative size —
small grey inner worlds, a blue-green homeworld, a rust-red world, then the large
gas giants, with the outer worlds in cool blues and cyans. Give them character:
- **Banding** — soft latitudinal stripes that slowly drift in color, suggesting
  atmospheric motion (especially the gas giants).
- **Rings** — glowing, translucent, tinted rings around the bodies (the prototype
  leans into this — rings are a signature flourish, not reserved for one planet).
- **A faint self-glow** so every planet reads clearly against the dark sky.
- The homeworld has a small **moon** nearby.

The planets are **scenery and landmarks** — you navigate by them. They are also the
**delivery targets** for the treasure activity (§5). Sizes range from small rocky
worlds to very large gas giants; the giants are dramatic in scale.

**The sky.** A dense procedural **starfield** wrapping the whole scene — thousands
of stars with subtle color variation and a soft glow on the brightest ones. The
backdrop is a very dark blue-purple, never pure black, which keeps the scene warm
and deep. The sky follows the camera so stars stay infinitely distant.

**Space dust / parallax motes.** Thousands of tiny glowing motes are scattered
through the play volume, concentrated near the flat plane. They do not move — but
as you fly, they **stream past and provide parallax**, which is the primary cue
for speed. Without this, fast flight feels static; with it, the ship feels fast.
A few subtle color variants (warm white, gold, cool blue, pink) keep it from
looking uniform.

**Scale & layout.** The system is large — outer planets are hundreds of units from
the sun — so there is real distance to cover and boost matters. The player starts
in the inner system, among the small planets.

---

## 5. Activity A — Treasure Delivery

A calm, exploratory pickup-and-deliver loop. Always running in the background of
free flight.

**Treasure orbs.** Glowing spheres spawn at scattered points in the system, biased
toward the flat plane. Each orb is **color-matched to a specific destination
planet** — its tint tells you (roughly) where it wants to go. Orbs gently **bob**
and **spin** so they read as collectible and alive.

**Waves.** Treasures appear in small batches (a few at a time — the prototype uses
four). Each orb in a wave is assigned to a **different** planet. When you've
delivered every orb in the wave, there's a brief pause (a few seconds), then the
next wave spawns. This continues indefinitely — there is no final wave.

**Carrying.** Fly into an orb to pick it up. **You can carry only one at a time.**
Pickup plays a brief expanding flash and a sound. While carrying, you're committed
to delivering before you can grab another.

**Delivery.** Each planet has a delivery zone around it. Fly into the zone of the
**matching** planet while carrying its orb to deliver it — a larger, more
satisfying flash and sound fire off, and the orb is consumed. Entering the *wrong*
planet's zone does nothing (no penalty, just ignored).

**Waypoint HUD.** Only while carrying treasure, a marker guides you to the target
planet: it projects the planet's position onto your screen, shows the planet's
**name** and **distance**, and when the planet is off-screen it **clamps to the
screen edge with a directional arrow** pointing the way. This is the player's
navigation aid — without it, finding the right planet in a large system would be
tedious.

---

## 6. Activity B — Combat & Other Ships

A light, consequence-free dogfighting layer. Runs in parallel with treasure
delivery — you can do both at once.

**Other ships.** A handful of small NPC ships (the prototype uses eight) wander the
system. Each has a distinct bright hull color and a glowing engine. They look like
simpler cousins of the player's ship — a body, a nose, broad wings, an engine
glow. They move at a steady cruise and **bank smoothly into their turns**, so they
read as alive, not on rails. Most are harmless wanderers: they pick random
destinations across the system and drift between them forever.

**Hostiles.** A few of the ships (the prototype uses three, in aggressive colors —
red, purple, orange) are **hostile** and run a repeating attack pattern against
the player:
1. **Approach** — they come at you on a curving, flanking arc rather than a
   straight line, swinging wide before closing in.
2. **Attack** — once close, they lock onto you and **fire**. Their shots are
   glowing tumbling **cubes** that fly straight. *The cubes are harmless* — hitting
   the player produces a small shower of sparks and nothing more. No damage, no
   health. The threat is theatrical, not lethal.
3. **Retreat** — after firing, they peel away behind you, then loop back to
   approach again.

**Evasion (jinking).** Hostiles are aware of your aim. If you point your reticle at
a hostile while it's attacking, it **breaks into a sudden evasive jink** — a quick
random dodge at boosted speed and a sharper turn rate — making it harder to hit.
This is what gives the combat a bit of cat-and-mouse texture.

**Fighting back.** Press a fire key (e.g. Space) to launch a **net** projectile
straight ahead. If a net strikes any NPC ship, that ship **vanishes in a burst of
sparks**. Nets travel fast and have a limited lifetime. (NPCs are not permanently
gone in a punishing way — the system keeps the world populated.)

**Target selection & assisted aim.** **Left-click an NPC to select it as your
target.** The selected ship gets a clear on-screen marker. The marker is not drawn
at the ship's current position — it's drawn at a **predicted intercept point**:
where the ship *will be* when your net would reach it, accounting for the net's
travel time. **Center your reticle on the marker, fire, and you hit.** When the
target is off-screen or behind you, the marker clamps to the screen edge so you can
always find it. Click empty space to deselect.

**Boost energy & stations.** Boost (§3) draws from a limited reserve. It recharges
on its own after a short delay, but there are also a few **space stations** parked
at fixed points in the system — compact modular structures with a glowing docking
ring. Fly close to a station and it **instantly tops up your boost energy**, with a
satisfying expanding-ring pulse as feedback. Stations are optional refuel
landmarks, not required stops.

---

## 7. HUD, Effects & Feedback

**HUD aesthetic.** A **retro-arcade, cyan sci-fi cockpit** overlay. Thin glowing
cyan lines and dim accents, like a heads-up display. It should feel like looking
through a fighter's canopy instrumentation, not a modern flat-UI app.

**HUD elements (all diegetic-feeling, minimal):**
- **Corner brackets** framing the screen edges — four "L" shapes that give the
  targeting-canopy feel.
- **Center reticle** — a small bracket cluster at screen center marking your aim
  point; it tracks the aim cursor.
- **Throttle indicator** — a vertical bar (left side) that fills upward with
  current throttle, labeled.
- **Boost gauge** — a segmented meter that empties as you boost and refills as you
  recharge, **color-shifting from green → yellow → red** as the reserve runs low.
- **Speed readout** — current velocity shown as a number (corner).
- **Mute icon** — a small indicator shown when audio is muted.
- **Treasure waypoint** — appears only while carrying (§5).
- **Target marker** — appears only when an NPC is selected (§6).

Keep the HUD sparse. Most of the screen is space and ship.

**Effects that sell the world:**
- **Engine trail** — the player ship leaves a glowing, two-layer exhaust ribbon (a
  hot bright core inside a cooler blue glow) that trails behind motion and fades
  out over about a second. It brightens and shifts hotter during boost. This is a
  major part of the speed feel.
- **Pickup / delivery flashes** — brief expanding bright rings on treasure events.
- **Sparks** — small particle bursts when cubes hit the player or nets destroy a
  ship.
- **Station pulse** — expanding ring when you refuel.
- **Bloom/glow** overall — the sun, engines, orbs, rings, and HUD should bloom so
  the scene feels luminous.

**Audio.** Looping in-game ambience/music plus sound effects for engine, firing,
pickups, deliveries, hits, and boost — all playing from the moment the game starts.

**Starting the game.** There is **no menu, title screen, or screen flow.** The game
drops the player straight into the flight sandbox — already moving and alive, with
music, ambience, and the full world present from the first frame. A mute toggle is
the only chrome.

---

Match the *behavior and mood* described throughout this document; exact colors,
sizes, and constants — and how the game is built — are the implementer's to choose.
