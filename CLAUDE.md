# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**のぼれRUIVOSくん** — a one-touch "sling-and-stick" action game (climb a vertical cave to the exit). Vanilla HTML5 Canvas + JavaScript, **no build step, no external libraries, no npm**. To run it, open `index.html` in a browser; to apply any change, just reload. Scripts load in fixed order via `index.html`: `design.js` → `cave.js` → `game.js`.

It deliberately recreates the *feel* of the mobile game Ordia ("pull to launch", "stick to any surface"), retextured as a stealth-climb (night castle, guard sightlines, cloak). Only the game mechanics are imitated — all code and assets are original.

## Architecture

Three layered globals, wired together at runtime through `window`:

- **`design.js`** → exposes `window.DESIGN` (and `module.exports` for Node). The **single source of truth for all tunable numbers**: physics (in px/s, not px/frame), feel (squash, slow-mo, shake, camera), gimmick params, rules (`launchPerDango`, `lowWarnAt`), stealth, and per-stage `stages[].palette`. `★` comments mark the knobs to reach for first. **When asked to change how the game looks or feels, edit here first** — see `DESIGN.md` for the "I want X → change knob Y" table.
- **`cave.js`** → exposes `window.CAVE` (and Node `module.exports`). Pure geometry: seeded procedural cave generation (`buildCave(gen, COL)`) plus all collision math (`circlePoly`, `pointInPoly`, `segPoly`). Owns terrain **shape and difficulty**. `buildCave` returns `{ walls, hazards, bouncy, boosts, sentries, cloaks, movers, platforms, slipWalls, dango, start, goal, worldH }`. Left/right walls are always continuous so the player can always wall-climb up (anti-softlock).
- **`game.js`** → the whole runtime (IIFE). Reads `DESIGN`/`CAVE`, runs the loop, physics solver, stealth, rendering, audio, the stage-select map, and progress persistence. Aliases at top: `D = DESIGN`. It does not export anything.

**Game loop** (`frame()` near the end of `game.js`): a **fixed-timestep accumulator** at 120 Hz (`physics.fixedStep`) with render interpolation (`render(alpha)`), so behavior is frame-rate independent. `timeScale` drives slow-mo during aim charge; `simTime` advances independently (guard sweeps keep moving even during death animation).

**State machine** — `gameState` ∈ `'title' | 'map' | 'play' | 'clear' | 'allclear'`. The HTML overlays in `index.html` (`#title`, `#clear`, `#allclear`) are shown/hidden per state; `'map'` and `'play'` render to the canvas. `'map'` is the castle-themed stage-select (`drawMap` / `updateMap` / `mapTapAt`, inertial scroll).

**Stages** — `LEVELS[]` in `game.js` is the authoritative list (14 stages across 8 `WORLDS` chapters; 8-1「跳躍祭」 is the explicit North-Star "pure feel" stage and 8-2「乱れ咲き」 is its harder sequel — same catapult/bounce-flow taste, difficulty raised via mastery demands not friction — see DESIGN.md 🌟北極星). Each entry has `code` ("1-1"…), `world`, `maxLaunch` (launch-count cap for that stage), and a `gen` object passed straight to `buildCave`. **The `gen` here and the palette order in `design.js stages[]` must stay aligned by index.** Per-stage comments record the BFS-measured minimum launch count; `maxLaunch` is that minimum plus human-error margin.

**Progress** — saved to `localStorage('nobore_progress')` via `loadProgress` / `saveProgress`. Clearing a stage unlocks the next and returns to the map.

## Key mechanics to know before editing

- **Launch budget (縛り)**: each stage caps launches at `LEVELS[].maxLaunch`. Running out before reaching the exit = retry ("もう とべない…", distinct from death). Collecting 💧 (`dango`) refunds `rules.launchPerDango` launches; the count refills fully on every respawn (death never softlocks via the budget).
- **Stick constraint**: from a stuck surface you can only fire within `stick.maxOffNormal` of the surface normal — this forbids straight-up wall-crawling and forces arcing jumps.
- **Goal gate (skill-shot)**: the exit hangs inside a ceiling cup (`cupGate`) with a narrow central slit (`gen.gateHalf`); `physics.goalRadius` is tightened so you must shoot *up through* the opening, not graze it. Later stages harden the gate with moving bumpers, gate-guard sentries, and moving spikes (`gen.bumperMove` / `gateGuard` / `gateMover`).
- **Gimmicks**: bumpers (`bouncy`), updrafts (`boosts`), **catapults** (`catapults`, fixed-vector launch pads — ignore incoming velocity and fire you along a set direction at `gimmick.catapultPower`; the "designed burst" counterpart to skill-based bumpers, chainable via the shared `bumpChain`), moving platforms (`platforms`), slip walls (`slipWalls`, slowly slide down), guards (`sentries`, sweeping vision cones blocked by walls), cloak drops (`cloaks`, temporary invisibility). Counts are set per stage in `gen` (`bouncyCount`, `boostCount`, `catapultCount`, `platCount`, `slipCount`, `sentryCount`, `cloakCount`, `hazardCount`). Catapults are pure juice — never required for reachability (the BFS solver ignores them), so stages stay solvable without them.

## UI styling

`style.css` styles only the HTML chrome (title / buttons / HUD). The `:root` CSS variables (`--bg`, `--wall`, `--accent`, `--blob`, `--danger`) mirror stage palette colors — keep them in rough sync with `design.js` if you change the look.

## Verification

There is no test runner or package.json. Validate changes with:

```
node --check design.js cave.js game.js   # syntax of all three
```

`DESIGN.md` also references Node harnesses (`harness.js` = boots through one frame without exceptions; `solve.js` = BFS-verifies every stage is still beatable under current physics/gen; `minlaunch.js` = measures theoretical minimum launches). **Always run the solver after changing physics** (`gravity`, `launchMul`, `maxPull`, `radius`) or any `gen`/`seed` — new physics can create unsolvable caves; fix by adjusting `gen` (gap / yStep) or the seed. Note: these harness scripts live in `/tmp` (not in the repo, and they hard-code an older project path), so confirm/adjust their `require` paths before relying on them.

## Sandbox

`feel.html` / `feel.js` are a standalone feel-tuning playground, independent of the main game — do not assume changes there affect the actual game.

## Docs to read

`DESIGN.md` is the design-system reference: a "what to change for X" table mapped to `design.js` knobs, the easing choices (camera = SmoothDamp critical-damped spring; squash = 2nd-order spring), the recommended order of knobs to tune, and the stage-by-stage difficulty intent. `README.md` covers how to play and the stage list.
