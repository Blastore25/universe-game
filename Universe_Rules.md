# Universe Game - Fundamental Rules (Current Implementation)

**Version:** `v1.3.13`

This file describes the current in-app behavior and tunable rule system used by the simulation runtime.

## Core Archetypes

| Archetype | Color | Core Identity |
|---|---|---|
| `Pulse` | Red | Energy, speed, volatility |
| `Bloom` | Green | Growth, life, stability |
| `Echo` | Blue | Order, memory, structure |
| `Void` | Purple | Entropy, mutation, absorption |
| `Amor` | Pink | Connection, healing, sacrifice |

## Initial Universe Structure

Default starting counts (editable at session start):

- `Pulse`: 35
- `Bloom`: 65
- `Echo`: 55
- `Void`: 28
- `Amor`: 12

## Session Modes

- **Individual session:** one configured universe at a time (manual reset available).
- **Auto mode:** randomized parameter set per run; each run advances automatically after **extinction** or a recognized **stable universe** (flat population), until the target run count is reached.
- **Strict setup-first flow:** while setup is open, simulation canvas/loop/input listeners are not mounted; the universe starts only after explicit `Start`.

## Big Bang and Phase Timing

- Simulation does **not** auto-start on app load.
- User selects mode and parameters first.
- Parameter edits on setup do not affect any running world in the background because no run exists yet.
- Run starts with a **Big Bang explosion phase** (~1 sim second) where pairwise rule behavior is temporarily simplified to outward expansion.
- After explosion phase, full interaction rules apply.

## Run outcomes: extinction vs stable universe

- **Extinction:** all non-Amor particles are gone. The run is marked `extinct` in CSV; the sim pauses with an overlay (individual: restart button; auto: timed advance to the next run when applicable).
- **Stable universe (equilibrium):** after the explosion phase, the engine samples total and non-Amor population about once per sim second. If, for roughly ten consecutive sim seconds, both totals stay within a tight band (low min/max swing) while a minimum number of non-Amor particles remain, the run is treated as dynamically **static**: sim pauses, CSV row gets `status=stable` and a `stable_seconds` timestamp, and the same overlay / auto-advance behavior as extinction applies.

## Force and Interaction Model

- Pairwise force matrix defines cross-archetype attraction/repulsion tendencies.
- Same-type interactions have configurable repulsion.
- Love bonds can form between high-love particles and create stronger pair pull behavior.
- Amor interactions can increase nearby love/energy.
- Void interactions can absorb/kill nearby non-void particles in close-range conditions.

### Tunable force parameters

- `attractionScale`
- `sameTypeRepulsion`
- `amorPairForce`

## Birth, Mutation, and Death Dynamics

Rules are probabilistic and proximity-based (not deterministic cellular automata):

- Archetype-specific birth conditions (Pulse/Bloom/Echo/Void/Amor variants).
- Chaos/energy mutation pressure via residual influence.
- Death pathways include inactivity, chaos overload, void pressure, low-love decay, and sacrifice logic.
- Void-to-Bloom transformation can occur under high-love conditions.

## Residual Traces: Visual vs Influence (Decoupled)

Residuals now have two separate lifetimes:

- **Visual trace lifetime:** fixed at `2 sim seconds` (fades from view quickly).
- **Influence lifetime:** energy-based and configurable, persists after visual fade.

Influence TTL formulas:

- Normal phase: `influenceTTL = influenceTtlBase + particle.energy`
- Explosion phase: `influenceTTL = influenceTtlExplosionBase + particle.energy`

This allows invisible historical influence fields to continue shaping motion after visible traces disappear.

## World Topology

- World size is large and wrap-around (toroidal).
- Crossing any boundary re-enters from the opposite edge.

## Collision/Overlap Policy

- Short grace period right after Big Bang.
- After grace period, particles are separation-resolved so they can cluster/touch but not occupy identical space.
- Love-bonded pairs may remain slightly closer than ordinary pairs.

## Runtime Telemetry and Experiment Support

HUD includes:

- particle totals and archetype counts
- sim timer and extinction metrics
- phase state and residual count
- workload indicators (substeps/frame and interaction checks/s)
- session mode and CSV logging status

During setup, an optional **Setup Debug Console** (off by default) logs input/change events and captures `window.error` / `unhandledrejection` so startup issues can be diagnosed from the UI. Log lines are batched to the next animation frame so typing stays responsive.

## CSV Experiment Logging

At session start, the app prompts for a CSV save target (when browser supports File System Access API).

Logging model:

- **Run-summary rows (not event rows):** one evolving row per run.
- **Individual mode:** one row for the current universe run, updated at checkpoints/extinction.
- **Auto mode:** one row per tested universe run, each updated through that run lifecycle (including stable-universe completion).
- CSV columns include `status` (`ongoing` / `extinct` / `stable`), `extinction_seconds`, and `stable_seconds` (whichever applies).

Each row stores run metadata, tunable parameters, and key runtime metrics for later analysis without unbounded event-row growth.

---

Reference table file: `Universe_Rules.csv`
