# Universe Game

Universe Game is a contemplative particle simulation inspired by a symbolic Big Bang.  
The simulation runs in a React + TypeScript app powered by Vite and is ready for Vercel deployment.

## Version

- `v1.3.13` - Stable-universe detection: population equilibrium pauses the sim with restart (individual) or auto-advance (auto), CSV `stable` status and `stable_seconds` column.
- `v1.3.12` - Fix setup crash from stale `event.currentTarget` in state updaters; debug log off by default and rAF-batched for smooth typing.
- `v1.3.11` - Setup debug console (in-app + console), global error/rejection capture, and setup input tracing to diagnose startup issues.
- `v1.3.10` - Setup and simulation are now fully separated; `Universe_Rules.md` synced to strict setup-first start and run-summary CSV behavior.
- `v1.3.9` - CSV logging switched to run-summary rows (single row per run with in-place updates) for both individual and auto sessions.
- `v1.3.8` - Strict setup-mode input isolation to prevent runtime interaction while editing session parameters.
- `v1.3.7` - Startup overlay stability hardening and visual universe boundary with black outside-space rendering.
- `v1.3.6` - Durable per-row CSV writes, adaptive performance controls, non-extinguishable Amor semantics, and extinction event restart overlays.
- `v1.3.5` - Updated English universe rules documentation synced to runtime behavior and experiment workflow.
- `v1.3.4` - Startup session configurator, decoupled 2-second visual traces vs configurable influence, and incremental CSV session logging with auto-run checkpoints.
- `v1.3.3` - Simulation timer/extinction analytics, larger wrap-around universe, live workload metrics, and hot-loop allocation optimizations.
- `v1.3.2` - Big Bang explosion-only first second, stronger residual history trimming, and HUD phase/residual debug line.
- `v1.3.1` - Rule-engine expansion (birth/death/special behaviors), post-Big-Bang non-overlap spacing, and tap-to-inspect particle stat cards.
- `v1.3.0` - Mobile-first vertical controls, touch-friendly pinch+drag camera, adaptive dimming HUD, and per-archetype live counts.
- `v1.2.1` - Wide zoom, time control, residual frequencies, static HUD, and ambient music polish release.
- `v1.2.0` - Wide zoom-out universe view, contemplative time controls (0.1x-1000x), and Residual Frequencies with fading reactive trails.
- `v1.1.0` - Converted from a single-file app to a production-ready Vite + React + TypeScript project.

## Changelog

### `v1.3.13`

- Detect **stable universe** when total and non-Amor counts stay within a tight band for several sim seconds after the explosion phase (with a floor on remaining non-Amor life).
- Pause simulation and show an overlay parallel to extinction: individual mode offers **Restart Universe**; auto mode counts down and starts the next randomized run (or ends on the final run).
- Run summaries and CSV gain `stable_seconds` and `status=stable`; `Universe_Rules.md` updated.

### `v1.3.12`

- Fixed `TypeError: Cannot read properties of null (reading 'value')` by capturing `event.currentTarget.value` / `.checked` before functional `setSetupDraft` updates (React may run the updater after the event is reset).
- Setup debug: default off, log buffer flushed via `requestAnimationFrame`, safe value extraction for capture handlers, cancel pending flush on disable/unmount.

### `v1.3.11`

- Added setup-screen debug console with toggle, input/change/pointer/key/wheel capture logging, and `startSession` trace lines.
- Added `window.error` and `unhandledrejection` listeners so runtime failures surface in the setup debug log during reproduction.
- Hardened setup form with string draft parsing; HUD version label aligned to release.

### `v1.3.10`

- Enforced hard separation between setup and runtime so the simulation does not mount/run before explicit session start.
- Synced `Universe_Rules.md` to current behavior, including setup-first flow and run-summary CSV lifecycle semantics.

### `v1.3.9`

- Replaced event-style CSV logging with run-summary CSV rows that are updated in place over time.
- Individual mode now keeps one evolving summary row for the current universe run.
- Auto mode now keeps one evolving summary row per tested run.

### `v1.3.8`

- Added strict setup-open input and simulation gating so canvas/loop interactions remain inert until explicit session start.

### `v1.3.7`

- Hardened startup setup overlay state and event isolation to prevent accidental disappearance while editing parameters.
- Added explicit in-world universe boundary guide and black rendering outside the square universe limits.

### `v1.3.6`

- Hardened CSV autosave so session rows are durably appended to disk incrementally during runs.
- Added configurable adaptive performance mode controls and population/diversity balancing parameters.
- Updated extinction semantics so Amor persists as a fundamental force while extinction tracks disappearance of non-Amor archetypes.
- Added extinction event overlays with manual restart for individual mode and timed auto-restart for auto mode.

### `v1.3.5`

- Rewrote `Universe_Rules.md` in English and aligned it with the latest implementation details (session modes, residual split, telemetry, and CSV experiment logging).

### `v1.3.4`

- Added a pre-start session setup screen with mode selection, configurable particle/rule parameters, and auto-run count control.
- Decoupled residual trace visibility from influence so visuals fade after 2 sim-seconds while influence keeps configurable energy-based persistence.
- Added CSV session logging with save prompt, run-start/checkpoint/extinction rows, and automatic logging across randomized auto-runs.

### `v1.3.3`

- Added simulation timer plus current-run extinction time and rolling extinction average across runs.
- Expanded world space and switched to wrap-around boundaries (particles re-enter from opposite edge).
- Added HUD workload metrics (substeps/frame and interaction checks/second) to monitor performance pressure.
- Optimized core loop allocations by reusing hot-path arrays/maps/sets and typed nearby counters to reduce GC churn.

### `v1.3.2`

- Added a strict first-second Big Bang explosion phase where attraction/rule processing is paused and particles expand outward.
- Added stronger residual-history cleanup with soft/hard caps to keep memory and CPU growth bounded over time.
- Added HUD diagnostics for current phase (Explosion/Rules Active) and live residual count.

### `v1.3.1`

- Added explicit archetype interaction matrix and rule-engine passes for births, deaths, sacrifice, absorption, and love-bond behavior.
- Added post-Big-Bang collision resolution so particles no longer share exact same space after the opening burst.
- Added tap/click particle inspection card showing per-particle Love, Chaos, Order, Energy, age, and bond information.

### `v1.3.0`

- Added modern vertical `Zoom` and `Time` sliders anchored to the right side for mobile comfort.
- Made HUD elements semi-transparent by default, with tap-to-focus full opacity and auto-dim after 4 seconds.
- Added live particle totals per archetype directly in the legend.
- Improved touch handling so pinch zoom and drag panning work smoothly together on mobile.
- Preserved the contemplative visual tone while updating controls and glass styling.

### `v1.2.1`

- Static HUD overlay stays fixed on screen regardless of camera zoom or pan.
- Universe camera supports 10x wider zoom-out for a broader contemplative field.
- Time Flow slider supports fine-to-extreme control from `0.1x` to `1000x`.
- Residual Frequencies system adds fading reactive frequency trails and interactions.
- Ambient music player with play/pause control for optional contemplative audio.
- UI polish pass to improve readability, spacing, and panel consistency.

## Features

- Real-time 2D particle simulation with Big Bang reset
- Five archetypes: `Pulse`, `Bloom`, `Echo`, `Void`, `Amor`
- `Amor` behavior preserved as a unifying force with attraction-driven interactions
- Residual Frequencies trail system with subtle visual echoes carrying Love, Chaos, Order, and Energy
- Frequency-driven reactions: attraction, mutation, inspiration, and avoidance
- Time Flow controls: pause/resume + slider from `0.1x` to `1000x`
- Camera controls: drag to pan, wheel to zoom, pinch to zoom on touch
- Keyboard controls: `Space` (pause), `R` (reset), `H` (toggle help)
- Live stats panel (total particles, Amor count, FPS)

## Tech Stack

- `React 18`
- `TypeScript`
- `Vite 5`

## Project Structure

- `src/App.tsx` - Simulation logic, render loop, UI panel, controls
- `src/main.tsx` - React application entrypoint
- `src/styles.css` - App styling
- `index.html` - Vite HTML entry
- `vite.config.ts` - Vite config with React plugin
- `tsconfig*.json` - TypeScript project configuration
- `Universe_Rules.md` / `Universe_Rules.csv` - Archetype design reference

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open the local URL shown by Vite (usually `http://localhost:5173`).

## Production Build

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Deploy To Vercel

### Option A: Vercel Dashboard

1. Push this repository to GitHub.
2. In Vercel, choose **Add New Project** and import the repo.
3. Vercel auto-detects Vite defaults:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy.

### Option B: Vercel CLI

1. Install CLI once:

```bash
npm install -g vercel
```

2. From the project root, deploy:

```bash
vercel
```

3. For production promotion:

```bash
vercel --prod
```

## Controls

- `Drag` (mouse/touch): Move camera
- `Pinch` (touch) / `Scroll` wheel: Zoom in/out
- `Space`: Pause/resume simulation
- `Time Flow` slider: adjust simulation speed from `0.1x` to `1000x`
- `R`: Trigger a fresh Big Bang reset
- `H`: Toggle help text

## License

This project is licensed under the MIT License. See `LICENSE` for details.
