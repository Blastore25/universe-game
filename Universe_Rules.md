# Universe Game - Fundamental Rules (Current Implementation)

**Version:** `v1.3.21`

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
- **Auto mode:** at session start the app builds a **full shuffled list** of run parameter sets for the requested run count. You set **min** and **max repeats per fingerprint** (defaults 3 and 5; clamped 1–500). Each **unique** fingerprint gets a stable **parameter set ID** (1-based) and appears that many times when the math allows (`N` between `⌈N/max⌉` and `⌊N/min⌋` unique sets); impossible combinations fall back to capping repeats at **max** per fingerprint. Configs are drawn from the usual random ranges but pass a **mild** filter (population headroom, archetype floors, bounded death/rarity tuning). Runs advance on **extinction** or **Static Universe** using the next entry in that list. The Markdown log includes a **pre-generated schedule** summary (IDs, fingerprint prefixes, repeat counts) plus per-run **Parameter set ID**, fingerprint prefix, and full parameters.
- **Strict setup-first flow:** while setup is open, simulation canvas/loop/input listeners are not mounted; the universe starts only after explicit `Start`.
- **Big Bang Reset (HUD):** pauses the sim, asks for confirmation, then **writes the session Markdown log** (if a file was chosen at session start), clears that file handle and in-memory session data, and returns to the setup screen with defaults so the next **Start** behaves like a new session (including a new save dialog).

## Simulation time (sim seconds)

- **Sim seconds** are derived from simulation step accumulation (`simulation steps / 60` in the current tuning).
- The **Time** control scales how much simulation advances per wall-clock second, so **sim seconds speed up and slow down with the Time knob** in the same proportion as the motion of particles.

## Big Bang and Phase Timing

- Simulation does **not** auto-start on app load.
- User selects mode and parameters first.
- Parameter edits on setup do not affect any running world in the background because no run exists yet.
- Run starts with a **Big Bang explosion phase** (~1 sim second) where pairwise rule behavior is temporarily simplified to outward expansion.
- After explosion phase, full interaction rules apply.

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

- **Birth gates** are unchanged (Pulse near Bloom, Bloom near Echo, Echo pairs, Void near Pulses, high-love Amor gifts), but **shared birth rate scaling** (`BIRTH_RATE_BASE`) normalizes coefficients across types; **diversity / rarity** multipliers still apply.
- **Bloom** may still double-spawn a second Bloom at a **lower** fixed chance than before.
- **Death (non-Amor):** one **ecology** roll per substep combines low-love pressure with archetype context (Pulse inactivity, Bloom near Void, Echo chaos, mild Void baseline) so overall odds stay in a similar band; **Void contact absorb** and **Amor sacrifice** remain separate.
- Each particle tracks **peak love** over its life. When a **non-Void, non-Amor** particle **dies** with love at or near zero and its peak love was **high** (extinguished connection), a **Void** may spawn at that site.
- **Void ↔ Bloom:** Void can still flip to Bloom under high-love Bloom proximity; Bloom can rarely flip to Void when very near Void with low order (symmetric, low rate).
- **Residual-driven mutation:** under residual influence, non-Amor particles can rarely hop along the Pulse–Bloom–Echo–Void cycle.
- **Void spark:** a non-Amor particle with **no** Void neighbors but **with** nearby Amor can rarely seed a new Void (companion rule for Void supply).

## Stable universe (concept) vs Static Universe (detected)

These are **different ideas**:

- **Stable universe (ecological / design concept):** a universe where populations **oscillate** through ongoing births and deaths—growing and decaying in waves (for example **sinusoidal** or cyclic dynamics) while the system keeps regulating itself. The app does **not** auto-detect this pattern yet; it is the qualitative target for “living” dynamics.
- **Static Universe (implemented detection):** after the explosion phase, if **total particle count** and **non-Amor particle count** both stay **exactly unchanged** (same integers) for **2000 sim seconds** of accumulated simulation time, the run is treated as **frozen at the population level**. The simulation pauses, the session Markdown log records `static` status and static sim time in the run metrics table, and the same overlay / auto-advance flow as extinction applies (individual: restart; auto: next run after one second when applicable).

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
- sim timer (scales with Time control) and extinction / static-universe timestamps when triggered
- phase state and residual count
- workload indicators (substeps/frame and interaction checks/s)
- session export status (Markdown session log, including rolling-window ecology telemetry when saved)

During setup, an optional **Setup Debug Console** (off by default) logs input/change events and captures `window.error` / `unhandledrejection` so startup issues can be diagnosed from the UI. Log lines are batched to the next animation frame so typing stays responsive.

## Session export (Markdown)

When the browser supports the File System Access API, session start opens **one** save dialog for a **`.md`** session log. If you cancel or the API is unavailable, run summaries still accumulate in memory for the session, but nothing is written to disk.

**Update cadence:** whenever run summaries are flushed, the Markdown file is **rewritten in full** from the current in-memory summaries (small files, keeps implementation simple and avoids RAM growth).

### Rolling-window ecology telemetry

- Session-long **simulation step** counter (not reset when the universe restarts inside a session) advances in fixed **windows** (300 session steps per row, about five sim seconds at the default step clock).
- Each completed window records **births and deaths per archetype** plus **reason labels** (for example `ecology_unified`, `void_absorb`, `birth_void_extinguished_love`, `birth_amor_gift`).
- The log appends a **## Session telemetry** section after run summaries: completed windows as a table, the **in-progress** partial window, and a reason breakdown table.

### Run summaries in the log

- **Individual mode:** one **## Run N** section for the current universe run, updated at checkpoints / extinction / static universe.
- **Auto mode:** one **## Run N** section per tested universe run, each updated through that run lifecycle.
- **Status** in the metrics table is `ongoing`, `extinct`, or `static`, with extinction and static sim times when applicable, plus tunable parameters and telemetry fields in tables. **Auto mode** adds **Parameter set ID** and **Fingerprint (prefix)** to each run’s metrics table.
- **Brief history** lines capture checkpoint-style population/residual peaks; skim metrics tables for structured values.

---

Reference table file: `Universe_Rules.csv`
