import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WORLD_SIZE = 18000;
const ZOOM_MIN = 0.015;
const ZOOM_MAX = 3.5;
const RESIDUAL_CELL_SIZE = 130;
const MAX_RESIDUALS = 2600;
const RESIDUAL_EMIT_INTERVAL = 0.34;

const TIME_SCALE_MIN = 0.1;
const TIME_SCALE_MAX = 1000;
const TIME_SCALE_LOG_MIN = Math.log10(TIME_SCALE_MIN);
const TIME_SCALE_LOG_MAX = Math.log10(TIME_SCALE_MAX);
const HUD_DIM_TIMEOUT_MS = 4000;

type ArchetypeKey = "PULSE" | "BLOOM" | "ECHO" | "VOID" | "AMOR";
type SessionMode = "individual" | "auto";

interface Archetype {
  name: string;
  color: string;
  size: number;
  reactivity: number;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: ArchetypeKey;
  archetype: Archetype;
  love: number;
  chaos: number;
  order: number;
  energy: number;
  radius: number;
  inactiveSteps: number;
  bondId: number | null;
  age: number;
}

interface ResidualFrequency {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  love: number;
  chaos: number;
  order: number;
  energy: number;
  visualTtl: number;
  maxVisualTtl: number;
  influenceTtl: number;
  maxInfluenceTtl: number;
  color: string;
}

interface PointerPoint {
  x: number;
  y: number;
}

const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  PULSE: { name: "Pulse", color: "#ef4444", size: 5, reactivity: 0.9 },
  BLOOM: { name: "Bloom", color: "#22c55e", size: 6, reactivity: 0.6 },
  ECHO: { name: "Echo", color: "#3b82f6", size: 5, reactivity: 0.4 },
  VOID: { name: "Void", color: "#a855f7", size: 7, reactivity: 0.85 },
  AMOR: { name: "Amor", color: "#ec4899", size: 8, reactivity: 1.0 }
};

const BIG_BANG_COUNTS: Record<ArchetypeKey, number> = {
  PULSE: 35,
  BLOOM: 65,
  ECHO: 55,
  VOID: 28,
  AMOR: 12
};

const LOVE_BOND_DISTANCE = 34;
const LOVE_BOND_THRESHOLD = 80;
const BASE_INTERACTION_DISTANCE = 130;
const INTERACTION_CELL_SIZE = 140;
const NO_OVERLAP_DELAY_STEPS = 60;
const OVERLAP_CELL_SIZE = 24;
const EXPLOSION_PHASE_STEPS = 60;
const MAX_RESIDUALS_SOFT = 1800;
const MAX_RESIDUALS_HARD = 2400;
const VISUAL_TRACE_TTL_STEPS = 120;
const CHECKPOINT_INTERVAL_STEPS = 300;
/**
 * Sim-time duration with **no** change in total particle count or non-Amor count to declare a **Static Universe**.
 * Sim seconds advance faster/slower with the Time control because they are derived from simulation steps.
 */
const STATIC_UNIVERSE_UNCHANGED_SIM_SECONDS = 2000;

interface SessionConfig {
  counts: Record<ArchetypeKey, number>;
  maxParticles: number;
  attractionScale: number;
  sameTypeRepulsion: number;
  amorPairForce: number;
  influenceTtlBase: number;
  influenceTtlExplosionBase: number;
  lowPopulationThreshold: number;
  lowPopulationDeathScale: number;
  rarityBirthBoost: number;
  diversityFloor: number;
  loveDeathProtection: number;
  adaptivePerformanceMode: boolean;
}

interface RunSummary {
  sessionId: string;
  mode: SessionMode;
  runIndex: number;
  status: "ongoing" | "extinct" | "static";
  simSeconds: number;
  extinctionSeconds: number | null;
  staticSimSeconds: number | null;
  particlesInitial: number;
  particlesPeak: number;
  nonAmorMin: number;
  nonAmorMax: number;
  nonAmorCurrent: number;
  residualPeak: number;
  checkpointCount: number;
  historyBrief: string;
  config: SessionConfig;
}

/** Human-readable session document from `runSummariesRef`; rewritten in full on each flush. */
function buildSessionMarkdownDoc(runs: RunSummary[], sessionIdFallback: string): string {
  const lines: string[] = [];
  const sid = runs.length > 0 ? runs[0].sessionId : sessionIdFallback;

  lines.push("# Universe Game — session log");
  lines.push("");
  lines.push("Run summaries are **rewritten in full** on each save so the file stays easy to read in any editor (small documents, no unbounded RAM growth).");
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| **Session ID** | \`${sid}\` |`);
  lines.push(`| **Runs in this file** | ${runs.length} |`);
  lines.push(`| **Last updated (wall clock)** | ${new Date().toISOString()} |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  if (runs.length === 0) {
    lines.push("*No runs recorded yet.*");
    lines.push("");
    return lines.join("\n");
  }

  for (const run of runs) {
    lines.push(`## Run ${run.runIndex} — mode: **${run.mode}**`);
    lines.push("");
    lines.push("### Run metrics");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|:---|:---|");
    lines.push(`| **Status** | \`${run.status}\` |`);
    lines.push(`| Sim time (s) | ${run.simSeconds.toFixed(3)} |`);
    lines.push(`| Extinction at (sim s) | ${run.extinctionSeconds === null ? "—" : run.extinctionSeconds.toFixed(3)} |`);
    lines.push(`| Static universe at (sim s) | ${run.staticSimSeconds === null ? "—" : run.staticSimSeconds.toFixed(3)} |`);
    lines.push(`| Particles (initial → peak) | ${run.particlesInitial} → ${run.particlesPeak} |`);
    lines.push(`| Non-Amor min / max / current | ${run.nonAmorMin} / ${run.nonAmorMax} / ${run.nonAmorCurrent} |`);
    lines.push(`| Residual peak count | ${run.residualPeak} |`);
    lines.push(`| Checkpoints (approx.) | ${run.checkpointCount} |`);
    lines.push("");
    lines.push("### Brief history");
    lines.push("");
    lines.push(`> ${run.historyBrief}`);
    lines.push("");
    lines.push("### Parameters for this run");
    lines.push("");
    lines.push("| Parameter | Value |");
    lines.push("|:---|:---|");
    const c = run.config;
    lines.push(
      `| Starting counts (Pulse / Bloom / Echo / Void / Amor) | ${c.counts.PULSE} / ${c.counts.BLOOM} / ${c.counts.ECHO} / ${c.counts.VOID} / ${c.counts.AMOR} |`
    );
    lines.push(`| Max particles | ${c.maxParticles} |`);
    lines.push(`| Attraction scale | ${c.attractionScale} |`);
    lines.push(`| Same-type repulsion | ${c.sameTypeRepulsion} |`);
    lines.push(`| Amor pair force | ${c.amorPairForce} |`);
    lines.push(`| Influence TTL base | ${c.influenceTtlBase} |`);
    lines.push(`| Influence TTL explosion base | ${c.influenceTtlExplosionBase} |`);
    lines.push(`| Low-population threshold | ${c.lowPopulationThreshold} |`);
    lines.push(`| Low-population death scale | ${c.lowPopulationDeathScale} |`);
    lines.push(`| Rarity birth boost | ${c.rarityBirthBoost} |`);
    lines.push(`| Diversity floor | ${c.diversityFloor} |`);
    lines.push(`| Love death protection | ${c.loveDeathProtection} |`);
    lines.push(`| Adaptive performance mode | ${c.adaptivePerformanceMode ? "on" : "off"} |`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

interface SetupDraft {
  counts: Record<ArchetypeKey, string>;
  maxParticles: string;
  attractionScale: string;
  sameTypeRepulsion: string;
  amorPairForce: string;
  influenceTtlBase: string;
  influenceTtlExplosionBase: string;
  lowPopulationThreshold: string;
  lowPopulationDeathScale: string;
  rarityBirthBoost: string;
  diversityFloor: string;
  loveDeathProtection: string;
  adaptivePerformanceMode: boolean;
  autoRunTarget: string;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  counts: { ...BIG_BANG_COUNTS },
  maxParticles: 1200,
  attractionScale: 1,
  sameTypeRepulsion: 0.03,
  amorPairForce: 0.22,
  influenceTtlBase: 170,
  influenceTtlExplosionBase: 110,
  lowPopulationThreshold: 420,
  lowPopulationDeathScale: 0.45,
  rarityBirthBoost: 1.25,
  diversityFloor: 70,
  loveDeathProtection: 0.55,
  adaptivePerformanceMode: false
};

function createSetupDraft(config: SessionConfig, autoRunTarget: number): SetupDraft {
  return {
    counts: {
      PULSE: String(config.counts.PULSE),
      BLOOM: String(config.counts.BLOOM),
      ECHO: String(config.counts.ECHO),
      VOID: String(config.counts.VOID),
      AMOR: String(config.counts.AMOR)
    },
    maxParticles: String(config.maxParticles),
    attractionScale: String(config.attractionScale),
    sameTypeRepulsion: String(config.sameTypeRepulsion),
    amorPairForce: String(config.amorPairForce),
    influenceTtlBase: String(config.influenceTtlBase),
    influenceTtlExplosionBase: String(config.influenceTtlExplosionBase),
    lowPopulationThreshold: String(config.lowPopulationThreshold),
    lowPopulationDeathScale: String(config.lowPopulationDeathScale),
    rarityBirthBoost: String(config.rarityBirthBoost),
    diversityFloor: String(config.diversityFloor),
    loveDeathProtection: String(config.loveDeathProtection),
    adaptivePerformanceMode: config.adaptivePerformanceMode,
    autoRunTarget: String(autoRunTarget)
  };
}

const ATTRACTION_MATRIX: Record<ArchetypeKey, Partial<Record<ArchetypeKey, number>>> = {
  PULSE: { BLOOM: 0.09, AMOR: 0.12, ECHO: -0.08, VOID: -0.06 },
  BLOOM: { PULSE: 0.08, ECHO: 0.07, AMOR: 0.12, VOID: -0.04 },
  ECHO: { BLOOM: 0.07, AMOR: 0.1, PULSE: -0.07, VOID: -0.08 },
  VOID: { PULSE: 0.08, BLOOM: -0.08, ECHO: -0.08, AMOR: -0.02, VOID: -0.03 },
  AMOR: { PULSE: 0.11, BLOOM: 0.12, ECHO: 0.12, VOID: 0.09, AMOR: 0.03 }
};

const ARCHETYPE_INDEX: Record<ArchetypeKey, number> = {
  PULSE: 0,
  BLOOM: 1,
  ECHO: 2,
  VOID: 3,
  AMOR: 4
};

let nextParticleId = 1;

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function forceForPair(a: ArchetypeKey, b: ArchetypeKey, config: SessionConfig): number {
  if (a === b) {
    return -config.sameTypeRepulsion;
  }
  return (ATTRACTION_MATRIX[a][b] ?? 0) * config.attractionScale;
}

function nearbyCount(nearbyCounts: Uint16Array, particleIndex: number, archetype: ArchetypeKey): number {
  return nearbyCounts[particleIndex * 5 + ARCHETYPE_INDEX[archetype]];
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapCoordinate(value: number): number {
  if (value < 0) {
    return value + WORLD_SIZE;
  }
  if (value >= WORLD_SIZE) {
    return value - WORLD_SIZE;
  }
  return value;
}

function spawnParticle(x: number, y: number, type: ArchetypeKey): Particle {
  const archetype = ARCHETYPES[type];
  return {
    id: nextParticleId++,
    x,
    y,
    vx: (Math.random() - 0.5) * 3.5,
    vy: (Math.random() - 0.5) * 3.5,
    type,
    archetype,
    love: type === "AMOR" ? 85 : Math.random() * 35,
    chaos: type === "VOID" ? 68 + Math.random() * 22 : 20 + Math.random() * 40,
    order: type === "BLOOM" ? 62 + Math.random() * 24 : 22 + Math.random() * 42,
    energy: 45 + Math.random() * 40,
    radius: archetype.size,
    inactiveSteps: 0,
    bondId: null,
    age: 0
  };
}

function createBigBangParticles(counts: Record<ArchetypeKey, number>): Particle[] {
  const particles: Particle[] = [];
  const centerX = WORLD_SIZE / 2;
  const centerY = WORLD_SIZE / 2;
  const normalizedCounts: Record<ArchetypeKey, number> = {
    ...counts,
    AMOR: Math.max(1, counts.AMOR)
  };

  for (const type of Object.keys(normalizedCounts) as ArchetypeKey[]) {
    const count = normalizedCounts[type];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.2 + Math.random() * 2.8;
      const dist = 35 + Math.random() * 95;
      const particle = spawnParticle(centerX + Math.cos(angle) * dist, centerY + Math.sin(angle) * dist, type);
      particle.vx = Math.cos(angle) * speed * 1.45;
      particle.vy = Math.sin(angle) * speed * 1.45;
      particles.push(particle);
    }
  }

  return particles;
}

function createEmptyArchetypeCounts(): Record<ArchetypeKey, number> {
  return {
    PULSE: 0,
    BLOOM: 0,
    ECHO: 0,
    VOID: 0,
    AMOR: 0
  };
}

function countArchetypes(particles: Particle[]): Record<ArchetypeKey, number> {
  const counts = createEmptyArchetypeCounts();
  for (const particle of particles) {
    counts[particle.type] += 1;
  }
  return counts;
}

/** Safe string for debug logs; avoids treating labels/sections as inputs. */
function debugValueFromEventTarget(target: EventTarget | null): string | null {
  if (!target || !(target instanceof HTMLElement)) {
    return null;
  }
  if (target instanceof HTMLInputElement) {
    return target.type === "checkbox" ? String(target.checked) : target.value;
  }
  if (target instanceof HTMLTextAreaElement) {
    return target.value;
  }
  if (target instanceof HTMLSelectElement) {
    return target.value;
  }
  return null;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [startupMode, setStartupMode] = useState<SessionMode>("individual");
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(() => createSetupDraft(DEFAULT_SESSION_CONFIG, 10));
  const [sessionMode, setSessionMode] = useState<SessionMode | null>(null);
  const [setupOpen, setSetupOpen] = useState(true);
  const [timeScale, setTimeScale] = useState(1);
  const [cameraZoom, setCameraZoom] = useState(0.65);
  const [fps, setFps] = useState(0);
  const [particleCount, setParticleCount] = useState(0);
  const [amorCount, setAmorCount] = useState(0);
  const [residualCount, setResidualCount] = useState(0);
  const [explosionPhaseActive, setExplosionPhaseActive] = useState(true);
  const [substepsPerFrame, setSubstepsPerFrame] = useState(0);
  const [interactionChecksPerSecond, setInteractionChecksPerSecond] = useState(0);
  const [elapsedSimSeconds, setElapsedSimSeconds] = useState(0);
  const [extinctionSeconds, setExtinctionSeconds] = useState<number | null>(null);
  const [extinctionCount, setExtinctionCount] = useState(0);
  const [extinctionAvgSeconds, setExtinctionAvgSeconds] = useState<number | null>(null);
  const [extinctionNotice, setExtinctionNotice] = useState<string | null>(null);
  const [staticUniverseNotice, setStaticUniverseNotice] = useState<string | null>(null);
  const [staticUniverseSeconds, setStaticUniverseSeconds] = useState<number | null>(null);
  const [autoRestartCountdown, setAutoRestartCountdown] = useState<number | null>(null);
  const [autoRunCompleted, setAutoRunCompleted] = useState(0);
  const [sessionExportStatus, setSessionExportStatus] = useState("No file selected");
  const [archetypeCounts, setArchetypeCounts] = useState<Record<ArchetypeKey, number>>(createEmptyArchetypeCounts);
  const [hudAwake, setHudAwake] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [selectedParticleId, setSelectedParticleId] = useState<number | null>(null);
  const [setupDebugEnabled, setSetupDebugEnabled] = useState(false);
  const [setupDebugEvents, setSetupDebugEvents] = useState<string[]>([]);

  const particlesRef = useRef<Particle[]>([]);
  const residualsRef = useRef<ResidualFrequency[]>([]);
  const residualAccumulatorRef = useRef(0);
  const simulationStepsRef = useRef(0);
  const cameraRef = useRef<Camera>({
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    zoom: 0.65
  });
  const dragRef = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
    moved: false
  });
  const activePointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const pinchRef = useRef({
    isPinching: false,
    initialDistance: 0,
    initialZoom: 0.65
  });
  const hudDimTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const selectedParticleIdRef = useRef<number | null>(null);
  const sessionModeRef = useRef<SessionMode | null>(null);
  const setupOpenRef = useRef(true);
  const frameCounterRef = useRef(0);
  const currentConfigRef = useRef<SessionConfig>(DEFAULT_SESSION_CONFIG);
  const autoRunTargetRef = useRef(0);
  const currentRunIndexRef = useRef(0);
  const sessionIdRef = useRef<string>("");
  const nextCheckpointStepRef = useRef(CHECKPOINT_INTERVAL_STEPS);
  const markdownFileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const markdownWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const runSummariesRef = useRef<Map<number, RunSummary>>(new Map());
  const autoRestartTimeoutRef = useRef<number | null>(null);
  const extinctionRecordedRef = useRef(false);
  const staticRecordedRef = useRef(false);
  /** Consecutive sim seconds where total and non-Amor counts match the previous substep. */
  const staticPopulationUnchangedSimRef = useRef(0);
  const staticPopulationLastRef = useRef<{ total: number; nonAmor: number } | null>(null);
  const extinctionCountRef = useRef(0);
  const extinctionAvgRef = useRef<number | null>(null);
  const lastFpsTimeRef = useRef(performance.now());
  const substepsAccumulatorRef = useRef(0);
  const interactionChecksAccumulatorRef = useRef(0);
  const interactionCountsRef = useRef<number[]>([]);
  const nearbyTypeCountsRef = useRef<Uint16Array>(new Uint16Array(0));
  const particlesToRemoveRef = useRef<Set<number>>(new Set());
  const particlesToSpawnRef = useRef<Particle[]>([]);
  const idToIndexRef = useRef<Map<number, number>>(new Map());
  const particleGridRef = useRef<Map<string, number[]>>(new Map());
  const residualGridRef = useRef<Map<string, number[]>>(new Map());
  const overlapGridRef = useRef<Map<string, number[]>>(new Map());
  const pausedRef = useRef(paused);
  const timeScaleRef = useRef(timeScale);
  const mountedRef = useRef(true);
  const lastFrameTimeRef = useRef(performance.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const ambientNodesRef = useRef<OscillatorNode[]>([]);
  const setupDebugEnabledRef = useRef(false);
  const setupDebugLinesRef = useRef<string[]>([]);
  const setupDebugFlushRafRef = useRef<number | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    selectedParticleIdRef.current = selectedParticleId;
  }, [selectedParticleId]);

  useEffect(() => {
    sessionModeRef.current = sessionMode;
  }, [sessionMode]);

  useEffect(() => {
    setupOpenRef.current = setupOpen;
  }, [setupOpen]);

  useEffect(() => {
    setupDebugEnabledRef.current = setupDebugEnabled;
  }, [setupDebugEnabled]);

  const sliderValue = useMemo(() => {
    return (Math.log10(timeScale) - TIME_SCALE_LOG_MIN) / (TIME_SCALE_LOG_MAX - TIME_SCALE_LOG_MIN);
  }, [timeScale]);

  const zoomSliderValue = useMemo(() => {
    return (Math.log10(cameraZoom) - Math.log10(ZOOM_MIN)) / (Math.log10(ZOOM_MAX) - Math.log10(ZOOM_MIN));
  }, [cameraZoom]);

  const setZoom = useCallback((nextZoom: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
    cameraRef.current.zoom = clamped;
    setCameraZoom(clamped);
  }, []);

  const setTimeScaleFromSlider = useCallback((normalized: number) => {
    const nextLog = TIME_SCALE_LOG_MIN + normalized * (TIME_SCALE_LOG_MAX - TIME_SCALE_LOG_MIN);
    const nextScale = 10 ** nextLog;
    setTimeScale(nextScale);
  }, []);

  const setZoomFromSlider = useCallback(
    (normalized: number) => {
      const zoomLogMin = Math.log10(ZOOM_MIN);
      const zoomLogMax = Math.log10(ZOOM_MAX);
      const nextLog = zoomLogMin + normalized * (zoomLogMax - zoomLogMin);
      setZoom(10 ** nextLog);
    },
    [setZoom]
  );

  const wakeHud = useCallback(() => {
    setHudAwake(true);
    if (hudDimTimeoutRef.current !== null) {
      window.clearTimeout(hudDimTimeoutRef.current);
    }
    hudDimTimeoutRef.current = window.setTimeout(() => {
      setHudAwake(false);
      hudDimTimeoutRef.current = null;
    }, HUD_DIM_TIMEOUT_MS);
  }, []);

  const appendSetupDebug = useCallback((message: string) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    const line = `[${timestamp}] ${message}`;
    console.debug(`[setup-debug] ${line}`);
    if (!setupDebugEnabledRef.current) {
      return;
    }
    setupDebugLinesRef.current = [...setupDebugLinesRef.current, line].slice(-80);
    if (setupDebugFlushRafRef.current === null) {
      setupDebugFlushRafRef.current = window.requestAnimationFrame(() => {
        setupDebugFlushRafRef.current = null;
        setSetupDebugEvents([...setupDebugLinesRef.current]);
      });
    }
  }, []);

  const flushSessionMarkdown = useCallback(() => {
    const runs = [...runSummariesRef.current.values()].sort((a, b) => a.runIndex - b.runIndex);
    const content = buildSessionMarkdownDoc(runs, sessionIdRef.current);
    const handle = markdownFileHandleRef.current;
    if (!handle) {
      return;
    }
    markdownWriteChainRef.current = markdownWriteChainRef.current.then(async () => {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    });
  }, []);

  const upsertRunSummary = useCallback(
    (patch: Partial<RunSummary> & { runIndex: number }) => {
      const existing = runSummariesRef.current.get(patch.runIndex);
      if (!existing) {
        return;
      }
      const next = { ...existing, ...patch };
      runSummariesRef.current.set(patch.runIndex, next);
    },
    []
  );

  const initRunSummary = useCallback((mode: SessionMode, runIndex: number, config: SessionConfig) => {
    const initial = Object.values(config.counts).reduce((sum, n) => sum + n, 0);
    const nonAmorInitial = initial - config.counts.AMOR;
    runSummariesRef.current.set(runIndex, {
      sessionId: sessionIdRef.current,
      mode,
      runIndex,
      status: "ongoing",
      simSeconds: 0,
      extinctionSeconds: null,
      staticSimSeconds: null,
      particlesInitial: initial,
      particlesPeak: initial,
      nonAmorMin: nonAmorInitial,
      nonAmorMax: nonAmorInitial,
      nonAmorCurrent: nonAmorInitial,
      residualPeak: 0,
      checkpointCount: 0,
      historyBrief: "initializing",
      config
    });
    flushSessionMarkdown();
  }, [flushSessionMarkdown]);

  const updateCurrentRunSummary = useCallback(
    (
      simSeconds: number,
      particlesNow: number,
      nonAmorNow: number,
      residualsNow: number,
      endKind: "none" | "extinct" | "static"
    ) => {
      const run = runSummariesRef.current.get(currentRunIndexRef.current);
      if (!run) {
        return;
      }
      const nextCheckpointCount = run.checkpointCount + (simSeconds >= nextCheckpointStepRef.current / 60 ? 1 : 0);
      let nextStatus: RunSummary["status"] = run.status;
      if (endKind === "extinct") {
        nextStatus = "extinct";
      } else if (endKind === "static") {
        nextStatus = "static";
      }
      const next: RunSummary = {
        ...run,
        status: nextStatus,
        simSeconds,
        extinctionSeconds: endKind === "extinct" ? simSeconds : run.extinctionSeconds,
        staticSimSeconds: endKind === "static" ? simSeconds : run.staticSimSeconds,
        particlesPeak: Math.max(run.particlesPeak, particlesNow),
        nonAmorMin: Math.min(run.nonAmorMin, nonAmorNow),
        nonAmorMax: Math.max(run.nonAmorMax, nonAmorNow),
        nonAmorCurrent: nonAmorNow,
        residualPeak: Math.max(run.residualPeak, residualsNow),
        checkpointCount: nextCheckpointCount
      };
      if (endKind === "none") {
        next.historyBrief = `nonAmor[min:${next.nonAmorMin},max:${next.nonAmorMax},last:${next.nonAmorCurrent}] peakParticles:${next.particlesPeak} peakResiduals:${next.residualPeak}`;
      } else {
        next.historyBrief = `[${endKind}] nonAmor[min:${next.nonAmorMin},max:${next.nonAmorMax},last:${next.nonAmorCurrent}] peakParticles:${next.particlesPeak} peakResiduals:${next.residualPeak}`;
      }
      runSummariesRef.current.set(currentRunIndexRef.current, next);
      flushSessionMarkdown();
    },
    [flushSessionMarkdown]
  );

  const randomConfig = useCallback((): SessionConfig => {
    const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
    const randFloat = (min: number, max: number) => min + Math.random() * (max - min);
    return {
      counts: {
        PULSE: randInt(20, 90),
        BLOOM: randInt(20, 110),
        ECHO: randInt(20, 95),
        VOID: randInt(10, 70),
        AMOR: randInt(4, 26)
      },
      maxParticles: randInt(600, 2200),
      attractionScale: randFloat(0.55, 1.7),
      sameTypeRepulsion: randFloat(0.012, 0.07),
      amorPairForce: randFloat(0.14, 0.34),
      influenceTtlBase: randInt(120, 420),
      influenceTtlExplosionBase: randInt(80, 220),
      lowPopulationThreshold: randInt(240, 900),
      lowPopulationDeathScale: randFloat(0.2, 0.85),
      rarityBirthBoost: randFloat(0.4, 2.5),
      diversityFloor: randInt(20, 220),
      loveDeathProtection: randFloat(0.2, 0.9),
      adaptivePerformanceMode: true
    };
  }, []);

  const resetUniverse = useCallback((config: SessionConfig) => {
    nextParticleId = 1;
    currentConfigRef.current = config;
    const particles = createBigBangParticles(config.counts);
    particlesRef.current = particles;
    residualsRef.current = [];
    residualAccumulatorRef.current = 0;
    simulationStepsRef.current = 0;
    extinctionRecordedRef.current = false;
    staticRecordedRef.current = false;
    staticPopulationUnchangedSimRef.current = 0;
    staticPopulationLastRef.current = null;
    lastFrameTimeRef.current = performance.now();
    setSelectedParticleId(null);
    setParticleCount(particles.length);
    setAmorCount(particles.filter((particle) => particle.type === "AMOR").length);
    setResidualCount(0);
    setExplosionPhaseActive(true);
    setElapsedSimSeconds(0);
    setExtinctionSeconds(null);
    setExtinctionNotice(null);
    setStaticUniverseNotice(null);
    setStaticUniverseSeconds(null);
    setAutoRestartCountdown(null);
    setArchetypeCounts(countArchetypes(particles));
    setPaused(false);
  }, []);

  const stopAmbientMusic = useCallback(() => {
    if (audioContextRef.current) {
      ambientGainRef.current?.gain.cancelScheduledValues(audioContextRef.current.currentTime);
      ambientGainRef.current?.gain.setTargetAtTime(0.0001, audioContextRef.current.currentTime, 0.9);
      void audioContextRef.current.suspend();
    }
    setIsMusicPlaying(false);
  }, []);

  const ensureAmbientMusic = useCallback(async () => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const context = new window.AudioContext();
    const master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    const frequencies = [220, 293.66, 329.63];
    const waves: OscillatorType[] = ["sine", "triangle", "sine"];
    const oscillators: OscillatorNode[] = [];

    for (let i = 0; i < frequencies.length; i += 1) {
      const oscillator = context.createOscillator();
      oscillator.type = waves[i];
      oscillator.frequency.value = frequencies[i];
      oscillator.detune.value = (Math.random() - 0.5) * 5;

      const voiceGain = context.createGain();
      voiceGain.gain.value = i === 1 ? 0.08 : 0.05;
      oscillator.connect(voiceGain);
      voiceGain.connect(master);
      oscillator.start();
      oscillators.push(oscillator);
    }

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();
    oscillators.push(lfo);

    audioContextRef.current = context;
    ambientGainRef.current = master;
    ambientNodesRef.current = oscillators;

    return context;
  }, []);

  const toggleAmbientMusic = useCallback(async () => {
    if (isMusicPlaying) {
      stopAmbientMusic();
      return;
    }

    const context = await ensureAmbientMusic();
    await context.resume();
    ambientGainRef.current?.gain.cancelScheduledValues(context.currentTime);
    ambientGainRef.current?.gain.setTargetAtTime(0.06, context.currentTime, 2.2);
    setIsMusicPlaying(true);
  }, [ensureAmbientMusic, isMusicPlaying, stopAmbientMusic]);

  const openSessionMarkdown = useCallback(async (mode: SessionMode) => {
    sessionIdRef.current = `${mode}-${new Date().toISOString().replace(/:/g, "-")}`;
    runSummariesRef.current.clear();
    markdownFileHandleRef.current = null;
    markdownWriteChainRef.current = Promise.resolve();
    try {
      const picker = (window as unknown as { showSaveFilePicker?: Function }).showSaveFilePicker;
      if (!picker) {
        setSessionExportStatus("File picker unsupported; session summaries in memory only");
        return;
      }
      const handle = await picker({
        suggestedName: `${sessionIdRef.current}.md`,
        types: [{ description: "Markdown", accept: { "text/markdown": [".md"], "text/plain": [".md"] } }]
      });
      markdownFileHandleRef.current = handle as FileSystemFileHandle;
      markdownWriteChainRef.current = Promise.resolve();
      setSessionExportStatus(`Saving session log to ${sessionIdRef.current}.md`);
    } catch {
      markdownFileHandleRef.current = null;
      setSessionExportStatus("Session log save cancelled; summaries in memory only");
    }
  }, []);

  const parseSetupSession = useCallback(() => {
    const parseIntWithClamp = (value: string, fallback: number, min: number, max: number) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.min(max, Math.max(min, parsed));
    };

    const parseFloatWithClamp = (value: string, fallback: number, min: number, max: number) => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) {
        return fallback;
      }
      return Math.min(max, Math.max(min, parsed));
    };

    const config: SessionConfig = {
      counts: {
        PULSE: parseIntWithClamp(setupDraft.counts.PULSE, DEFAULT_SESSION_CONFIG.counts.PULSE, 0, 10000),
        BLOOM: parseIntWithClamp(setupDraft.counts.BLOOM, DEFAULT_SESSION_CONFIG.counts.BLOOM, 0, 10000),
        ECHO: parseIntWithClamp(setupDraft.counts.ECHO, DEFAULT_SESSION_CONFIG.counts.ECHO, 0, 10000),
        VOID: parseIntWithClamp(setupDraft.counts.VOID, DEFAULT_SESSION_CONFIG.counts.VOID, 0, 10000),
        AMOR: parseIntWithClamp(setupDraft.counts.AMOR, DEFAULT_SESSION_CONFIG.counts.AMOR, 0, 10000)
      },
      maxParticles: parseIntWithClamp(setupDraft.maxParticles, DEFAULT_SESSION_CONFIG.maxParticles, 100, 10000),
      attractionScale: parseFloatWithClamp(setupDraft.attractionScale, DEFAULT_SESSION_CONFIG.attractionScale, 0, 100),
      sameTypeRepulsion: parseFloatWithClamp(setupDraft.sameTypeRepulsion, DEFAULT_SESSION_CONFIG.sameTypeRepulsion, 0, 1),
      amorPairForce: parseFloatWithClamp(setupDraft.amorPairForce, DEFAULT_SESSION_CONFIG.amorPairForce, 0, 100),
      influenceTtlBase: parseIntWithClamp(setupDraft.influenceTtlBase, DEFAULT_SESSION_CONFIG.influenceTtlBase, 1, 20000),
      influenceTtlExplosionBase: parseIntWithClamp(
        setupDraft.influenceTtlExplosionBase,
        DEFAULT_SESSION_CONFIG.influenceTtlExplosionBase,
        1,
        20000
      ),
      lowPopulationThreshold: parseIntWithClamp(setupDraft.lowPopulationThreshold, DEFAULT_SESSION_CONFIG.lowPopulationThreshold, 1, 20000),
      lowPopulationDeathScale: parseFloatWithClamp(
        setupDraft.lowPopulationDeathScale,
        DEFAULT_SESSION_CONFIG.lowPopulationDeathScale,
        0.05,
        1
      ),
      rarityBirthBoost: parseFloatWithClamp(setupDraft.rarityBirthBoost, DEFAULT_SESSION_CONFIG.rarityBirthBoost, 0, 20),
      diversityFloor: parseIntWithClamp(setupDraft.diversityFloor, DEFAULT_SESSION_CONFIG.diversityFloor, 1, 20000),
      loveDeathProtection: parseFloatWithClamp(setupDraft.loveDeathProtection, DEFAULT_SESSION_CONFIG.loveDeathProtection, 0, 0.95),
      adaptivePerformanceMode: setupDraft.adaptivePerformanceMode
    };

    const parsedAutoRuns = parseIntWithClamp(setupDraft.autoRunTarget, 10, 1, 10000);
    return { config, autoRuns: parsedAutoRuns };
  }, [setupDraft]);

  const startSession = useCallback(
    async (mode: SessionMode, baseConfig: SessionConfig, autoRuns: number) => {
      appendSetupDebug(`startSession begin: mode=${mode}, autoRuns=${autoRuns}`);
      await openSessionMarkdown(mode);
      setSetupOpen(false);
      setSessionMode(mode);
      setAutoRunCompleted(0);
      extinctionCountRef.current = 0;
      extinctionAvgRef.current = null;
      setExtinctionCount(0);
      setExtinctionAvgSeconds(null);
      autoRunTargetRef.current = mode === "auto" ? Math.max(1, autoRuns) : 1;
      currentRunIndexRef.current = 1;
      const runConfig = mode === "auto" ? randomConfig() : baseConfig;
      resetUniverse(runConfig);
      nextCheckpointStepRef.current = CHECKPOINT_INTERVAL_STEPS;
      initRunSummary(mode, currentRunIndexRef.current, runConfig);
      appendSetupDebug("startSession complete");
    },
    [appendSetupDebug, initRunSummary, openSessionMarkdown, randomConfig, resetUniverse]
  );

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      appendSetupDebug(`window.error: ${event.message}${event.filename ? ` @ ${event.filename}:${event.lineno}:${event.colno}` : ""}`);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? `${event.reason.name}: ${event.reason.message}` : String(event.reason);
      appendSetupDebug(`unhandledrejection: ${reason}`);
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      if (setupDebugFlushRafRef.current !== null) {
        window.cancelAnimationFrame(setupDebugFlushRafRef.current);
        setupDebugFlushRafRef.current = null;
      }
      if (hudDimTimeoutRef.current !== null) {
        window.clearTimeout(hudDimTimeoutRef.current);
      }
      stopAmbientMusic();
      for (const oscillator of ambientNodesRef.current) {
        oscillator.stop();
      }
      ambientNodesRef.current = [];
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      markdownFileHandleRef.current = null;
      if (autoRestartTimeoutRef.current !== null) {
        window.clearTimeout(autoRestartTimeoutRef.current);
        autoRestartTimeoutRef.current = null;
      }
    };
  }, [appendSetupDebug, stopAmbientMusic]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        const isTextEditable = tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
        if (isTextEditable) {
          return;
        }
      }
      if (sessionModeRef.current === null) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      } else if (key === "r") {
        resetUniverse(currentConfigRef.current);
        currentRunIndexRef.current += 1;
        nextCheckpointStepRef.current = CHECKPOINT_INTERVAL_STEPS;
        initRunSummary(sessionModeRef.current ?? "individual", currentRunIndexRef.current, currentConfigRef.current);
      } else if (key === "h") {
        setShowHelp((value) => !value);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [initRunSummary, resetUniverse]);

  useEffect(() => {
    if (setupOpen) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const getPinchDistance = (pointers: PointerPoint[]) => {
      if (pointers.length < 2) {
        return 0;
      }
      const dx = pointers[1].x - pointers[0].x;
      const dy = pointers[1].y - pointers[0].y;
      return Math.hypot(dx, dy);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const onPointerDown = (event: PointerEvent) => {
      if (setupOpenRef.current) {
        return;
      }
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const activePointers = [...activePointersRef.current.values()];
      if (activePointers.length >= 2) {
        pinchRef.current.isPinching = true;
        pinchRef.current.initialDistance = getPinchDistance(activePointers);
        pinchRef.current.initialZoom = cameraRef.current.zoom;
        dragRef.current.isDragging = false;
      } else {
        dragRef.current.isDragging = true;
        dragRef.current.lastX = event.clientX;
        dragRef.current.lastY = event.clientY;
        dragRef.current.startX = event.clientX;
        dragRef.current.startY = event.clientY;
        dragRef.current.moved = false;
      }
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (setupOpenRef.current) {
        return;
      }
      if (!activePointersRef.current.has(event.pointerId)) {
        return;
      }

      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const activePointers = [...activePointersRef.current.values()];

      if (activePointers.length >= 2) {
        if (!pinchRef.current.isPinching) {
          pinchRef.current.isPinching = true;
          pinchRef.current.initialDistance = getPinchDistance(activePointers);
          pinchRef.current.initialZoom = cameraRef.current.zoom;
        }

        const nextDistance = getPinchDistance(activePointers);
        if (pinchRef.current.initialDistance > 0 && nextDistance > 0) {
          const pinchScale = nextDistance / pinchRef.current.initialDistance;
          setZoom(pinchRef.current.initialZoom * pinchScale);
        }
        dragRef.current.isDragging = false;
        return;
      }

      pinchRef.current.isPinching = false;
      if (!dragRef.current.isDragging) {
        dragRef.current.isDragging = true;
        dragRef.current.lastX = event.clientX;
        dragRef.current.lastY = event.clientY;
        return;
      }

      const camera = cameraRef.current;
      const dx = (event.clientX - dragRef.current.lastX) / camera.zoom;
      const dy = (event.clientY - dragRef.current.lastY) / camera.zoom;
      if (Math.hypot(event.clientX - dragRef.current.startX, event.clientY - dragRef.current.startY) > 6) {
        dragRef.current.moved = true;
      }
      camera.x -= dx;
      camera.y -= dy;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (setupOpenRef.current) {
        return;
      }
      const wasTap = !pinchRef.current.isPinching && !dragRef.current.moved;
      activePointersRef.current.delete(event.pointerId);
      const remainingPointers = [...activePointersRef.current.values()];
      if (remainingPointers.length >= 2) {
        pinchRef.current.initialDistance = getPinchDistance(remainingPointers);
        pinchRef.current.initialZoom = cameraRef.current.zoom;
      } else {
        pinchRef.current.isPinching = false;
      }

      if (remainingPointers.length === 1) {
        dragRef.current.isDragging = true;
        dragRef.current.lastX = remainingPointers[0].x;
        dragRef.current.lastY = remainingPointers[0].y;
      } else {
        dragRef.current.isDragging = false;
      }

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      if (wasTap) {
        const camera = cameraRef.current;
        let bestId: number | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < particlesRef.current.length; i += 1) {
          const particle = particlesRef.current[i];
          const sx = (particle.x - camera.x) * camera.zoom + canvas.width / 2;
          const sy = (particle.y - camera.y) * camera.zoom + canvas.height / 2;
          const hitRadius = Math.max(8, particle.radius * camera.zoom + 6);
          const dist = Math.hypot(event.clientX - sx, event.clientY - sy);
          if (dist <= hitRadius && dist < bestDistance) {
            bestDistance = dist;
            bestId = particle.id;
          }
        }
        setSelectedParticleId(bestId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (setupOpenRef.current) {
        return;
      }
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.12;
      const camera = cameraRef.current;
      setZoom(camera.zoom * factor);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const drawFrame = (time: number) => {
      if (!mountedRef.current) {
        return;
      }

      const particles = particlesRef.current;
      const residuals = residualsRef.current;
      const camera = cameraRef.current;
      const frameDeltaMs = Math.min(100, Math.max(8, time - lastFrameTimeRef.current));
      lastFrameTimeRef.current = time;

      const boundaryLeft = (0 - camera.x) * camera.zoom + canvas.width / 2;
      const boundaryTop = (0 - camera.y) * camera.zoom + canvas.height / 2;
      const boundarySize = WORLD_SIZE * camera.zoom;

      // Outside universe space is black.
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Inside universe area keeps the simulation background tone.
      ctx.fillStyle = "rgba(10, 10, 31, 1)";
      ctx.fillRect(boundaryLeft, boundaryTop, boundarySize, boundarySize);

      if (setupOpenRef.current) {
        rafRef.current = window.requestAnimationFrame(drawFrame);
        return;
      }

      if (!pausedRef.current) {
        const frameScale = (frameDeltaMs / 16.666) * timeScaleRef.current;
        const rawSubSteps = Math.max(1, Math.min(10, Math.ceil(frameScale / 1.8)));
        const adaptivePerformance = currentConfigRef.current.adaptivePerformanceMode;
        const workloadSubstepCap = adaptivePerformance
          ? particles.length > 2400
            ? 2
            : particles.length > 1600
              ? 3
              : particles.length > 1000
                ? 4
                : particles.length > 650
                  ? 6
                  : 10
          : 10;
        const subSteps = adaptivePerformance ? Math.min(rawSubSteps, workloadSubstepCap) : rawSubSteps;
        substepsAccumulatorRef.current += subSteps;
        const stepScale = frameScale / subSteps;

        for (let step = 0; step < subSteps; step += 1) {
          const inExplosionPhase = simulationStepsRef.current <= EXPLOSION_PHASE_STEPS;
          const residualGrid = residualGridRef.current;
          residualGrid.clear();
          for (let i = 0; i < residuals.length; i += 1) {
            const residual = residuals[i];
            const gridX = Math.floor(residual.x / RESIDUAL_CELL_SIZE);
            const gridY = Math.floor(residual.y / RESIDUAL_CELL_SIZE);
            const key = `${gridX}|${gridY}`;
            const existing = residualGrid.get(key);
            if (existing) {
              existing.push(i);
            } else {
              residualGrid.set(key, [i]);
            }
          }

          const interactionCounts = interactionCountsRef.current;
          if (interactionCounts.length < particles.length) {
            interactionCounts.length = particles.length;
          }
          interactionCounts.fill(0, 0, particles.length);

          const neededNearbySlots = particles.length * 5;
          if (nearbyTypeCountsRef.current.length < neededNearbySlots) {
            nearbyTypeCountsRef.current = new Uint16Array(neededNearbySlots);
          } else {
            nearbyTypeCountsRef.current.fill(0, 0, neededNearbySlots);
          }
          const nearbyTypeCounts = nearbyTypeCountsRef.current;

          const particlesToRemove = particlesToRemoveRef.current;
          particlesToRemove.clear();
          const particlesToSpawn = particlesToSpawnRef.current;
          particlesToSpawn.length = 0;
          const idToIndex = idToIndexRef.current;
          idToIndex.clear();
          for (let i = 0; i < particles.length; i += 1) {
            idToIndex.set(particles[i].id, i);
          }

          const particleGrid = particleGridRef.current;
          particleGrid.clear();
          for (let i = 0; i < particles.length; i += 1) {
            const p = particles[i];
            const gx = Math.floor(p.x / INTERACTION_CELL_SIZE);
            const gy = Math.floor(p.y / INTERACTION_CELL_SIZE);
            const key = `${gx}|${gy}`;
            const list = particleGrid.get(key);
            if (list) {
              list.push(i);
            } else {
              particleGrid.set(key, [i]);
            }
          }

          for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];
            particle.age += stepScale;
            let ax = 0;
            let ay = 0;
            const particleCellX = Math.floor(particle.x / INTERACTION_CELL_SIZE);
            const particleCellY = Math.floor(particle.y / INTERACTION_CELL_SIZE);
            for (let gx = particleCellX - 1; gx <= particleCellX + 1; gx += 1) {
              for (let gy = particleCellY - 1; gy <= particleCellY + 1; gy += 1) {
                const nearbyParticles = particleGrid.get(`${gx}|${gy}`);
                if (!nearbyParticles) {
                  continue;
                }
                for (let n = 0; n < nearbyParticles.length; n += 1) {
                  const j = nearbyParticles[n];
                  if (i === j) {
                    continue;
                  }
                  interactionChecksAccumulatorRef.current += 1;
                  const other = particles[j];
                  const dx = other.x - particle.x;
                  const dy = other.y - particle.y;
                  const distSq = dx * dx + dy * dy;
                  if (distSq < 1) {
                    continue;
                  }
                  const dist = Math.sqrt(distSq);
                  if (dist >= BASE_INTERACTION_DISTANCE) {
                    continue;
                  }
                  nearbyTypeCounts[i * 5 + ARCHETYPE_INDEX[other.type]] += 1;
                  interactionCounts[i] += 1;

                  if (!inExplosionPhase && particle.type === "AMOR" && dist < 80) {
                    other.love = clampStat(other.love + 0.18 * stepScale);
                    other.energy = clampStat(other.energy + 0.08 * stepScale);
                  }

                  if (
                    !inExplosionPhase &&
                    particle.type === "VOID" &&
                    other.type !== "VOID" &&
                    other.type !== "AMOR" &&
                    dist < 18 &&
                    Math.random() < 0.0038 * stepScale
                  ) {
                    particlesToRemove.add(other.id);
                    particle.energy = clampStat(particle.energy + 6);
                    particle.chaos = clampStat(particle.chaos + 2);
                  }

                  let force = 0;
                  if (inExplosionPhase) {
                    force = -0.18;
                  } else {
                    force = forceForPair(particle.type, other.type, currentConfigRef.current);
                    if (particle.bondId !== null && particle.bondId === other.id) {
                      force = currentConfigRef.current.amorPairForce;
                    }
                  }
                  ax += (dx / dist) * force;
                  ay += (dy / dist) * force;

                  if (
                    !inExplosionPhase &&
                    particle.type === "VOID" &&
                    other.type === "BLOOM" &&
                    particle.love > 74 &&
                    Math.random() < 0.0018 * stepScale
                  ) {
                    particle.type = "BLOOM";
                    particle.archetype = ARCHETYPES.BLOOM;
                    particle.radius = ARCHETYPES.BLOOM.size;
                    particle.chaos = clampStat(particle.chaos - 30);
                    particle.order = clampStat(particle.order + 24);
                  }

                  if (
                    !inExplosionPhase &&
                    particle.bondId === null &&
                    other.bondId === null &&
                    particle.love >= LOVE_BOND_THRESHOLD &&
                    other.love >= LOVE_BOND_THRESHOLD &&
                    dist <= LOVE_BOND_DISTANCE
                  ) {
                    particle.bondId = other.id;
                    other.bondId = particle.id;
                  }
                }
              }
            }

            const residualCellX = Math.floor(particle.x / RESIDUAL_CELL_SIZE);
            const residualCellY = Math.floor(particle.y / RESIDUAL_CELL_SIZE);
            for (let gx = residualCellX - 1; gx <= residualCellX + 1; gx += 1) {
              for (let gy = residualCellY - 1; gy <= residualCellY + 1; gy += 1) {
                const nearby = residualGrid.get(`${gx}|${gy}`);
                if (!nearby) {
                  continue;
                }

                for (let idx = 0; idx < nearby.length; idx += 1) {
                  const residual = residuals[nearby[idx]];
                  const dx = residual.x - particle.x;
                  const dy = residual.y - particle.y;
                  const distSq = dx * dx + dy * dy;

                  if (distSq < 4 || distSq > 42000) {
                    continue;
                  }

                  const dist = Math.sqrt(distSq);
                  if (residual.influenceTtl <= 0) {
                    continue;
                  }
                  const influence = residual.influenceTtl / residual.maxInfluenceTtl;
                  const dirX = dx / dist;
                  const dirY = dy / dist;
                  if (!inExplosionPhase) {
                    ax += dirX * ((residual.love / 100) * 0.028 + (residual.order / 100) * 0.014) * influence;
                    ay += dirY * ((residual.love / 100) * 0.028 + (residual.order / 100) * 0.014) * influence;
                  }

                  const avoidance = (residual.chaos / 100) * 0.026 * influence;
                  ax -= dirX * avoidance;
                  ay -= dirY * avoidance;

                  if (!inExplosionPhase && Math.random() < (residual.chaos / 1000) * influence) {
                    particle.chaos = clampStat(particle.chaos + (Math.random() - 0.5) * 7);
                    particle.order = clampStat(particle.order + (Math.random() - 0.5) * 5);
                    particle.energy = clampStat(particle.energy + (Math.random() - 0.5) * 8);
                  }

                  if (!inExplosionPhase && Math.random() < (residual.energy / 1600) * influence) {
                    particle.vx += dirX * 0.07;
                    particle.vy += dirY * 0.07;
                  }
                }
              }
            }

            const damping = inExplosionPhase ? 0.992 : Math.max(0.82, 0.96 - particle.chaos * 0.0006);
            particle.vx = particle.vx * damping + ax * stepScale;
            particle.vy = particle.vy * damping + ay * stepScale;
            particle.x += particle.vx * stepScale;
            particle.y += particle.vy * stepScale;
            particle.x = wrapCoordinate(particle.x);
            particle.y = wrapCoordinate(particle.y);

            if (!inExplosionPhase && Math.random() < 0.02 * stepScale) {
              particle.love = Math.max(0, particle.love - 0.25);
              particle.energy = Math.max(0, particle.energy - 0.1);
            }

            residualAccumulatorRef.current += stepScale;
            if (residualAccumulatorRef.current >= RESIDUAL_EMIT_INTERVAL) {
              residualAccumulatorRef.current = 0;
              const visualTtlBase = VISUAL_TRACE_TTL_STEPS;
              const influenceBase =
                (inExplosionPhase ? currentConfigRef.current.influenceTtlExplosionBase : currentConfigRef.current.influenceTtlBase) +
                particle.energy;
              residuals.push({
                x: particle.x,
                y: particle.y,
                prevX: particle.x - particle.vx * 2.2,
                prevY: particle.y - particle.vy * 2.2,
                love: particle.love,
                chaos: particle.chaos,
                order: particle.order,
                energy: particle.energy,
                visualTtl: visualTtlBase,
                maxVisualTtl: visualTtlBase,
                influenceTtl: influenceBase,
                maxInfluenceTtl: influenceBase,
                color: particle.archetype.color
              });
            }
          }

          if (!inExplosionPhase) {
            const typeCountsNow = createEmptyArchetypeCounts();
            for (let i = 0; i < particles.length; i += 1) {
              typeCountsNow[particles[i].type] += 1;
            }
            const totalPopulation = particles.length;
            const popBlend = Math.min(1, totalPopulation / Math.max(1, currentConfigRef.current.lowPopulationThreshold));
            const deathScale =
              currentConfigRef.current.lowPopulationDeathScale + (1 - currentConfigRef.current.lowPopulationDeathScale) * popBlend;
            const birthScale = 1 + (1 - popBlend) * 0.9;
            const rarityMultiplier = (type: ArchetypeKey) => {
              const deficit = Math.max(0, currentConfigRef.current.diversityFloor - typeCountsNow[type]);
              return 1 + (deficit / Math.max(1, currentConfigRef.current.diversityFloor)) * currentConfigRef.current.rarityBirthBoost;
            };
            for (let i = 0; i < particles.length; i += 1) {
              const particle = particles[i];
              const loveShield = 1 - (particle.love / 100) * currentConfigRef.current.loveDeathProtection;
              const deathBias = Math.max(0.1, deathScale * loveShield);
              if (interactionCounts[i] === 0) {
                particle.inactiveSteps += stepScale;
              } else {
                particle.inactiveSteps = Math.max(0, particle.inactiveSteps - stepScale * 0.6);
              }

              if (particle.type !== "AMOR" && particle.love <= 1 && Math.random() < 0.0018 * stepScale * deathBias) {
                particlesToRemove.add(particle.id);
              }

            if (particle.type === "PULSE" && particle.inactiveSteps > 80 && Math.random() < 0.03 * stepScale * deathBias) {
              particlesToRemove.add(particle.id);
            }
            if (particle.type === "BLOOM" && nearbyCount(nearbyTypeCounts, i, "VOID") >= 3) {
              if (Math.random() < 0.0036 * stepScale * deathBias) {
                particlesToRemove.add(particle.id);
              }
            }
            if (particle.type === "ECHO" && particle.chaos > 85) {
              if (Math.random() < 0.0036 * stepScale * deathBias) {
                particlesToRemove.add(particle.id);
              }
            }
            if (particle.type === "VOID" && Math.random() < 0.0019 * stepScale * deathBias) {
              particlesToRemove.add(particle.id);
            }
            if (particle.type === "AMOR" && nearbyCount(nearbyTypeCounts, i, "VOID") >= 2 && Math.random() < 0.0017 * stepScale * deathBias) {
              const saveTarget = particles.find((candidate) => candidate.type !== "AMOR" && !particlesToRemove.has(candidate.id));
              if (saveTarget) {
                saveTarget.love = clampStat(saveTarget.love + 45);
                saveTarget.energy = clampStat(saveTarget.energy + 28);
                // Amor sacrifices strength, not existence.
                particle.love = clampStat(particle.love - 35);
                particle.energy = clampStat(particle.energy - 25);
                particle.order = clampStat(particle.order + 5);
              }
            }

            if (particle.type === "PULSE" && nearbyCount(nearbyTypeCounts, i, "BLOOM") >= 1) {
              if (Math.random() < 0.0015 * stepScale * birthScale * rarityMultiplier("PULSE")) {
                particlesToSpawn.push(spawnParticle(particle.x + (Math.random() - 0.5) * 30, particle.y + (Math.random() - 0.5) * 30, "PULSE"));
              }
            }
            if (particle.type === "BLOOM" && nearbyCount(nearbyTypeCounts, i, "ECHO") >= 1) {
              if (Math.random() < 0.0017 * stepScale * birthScale * rarityMultiplier("BLOOM")) {
                particlesToSpawn.push(spawnParticle(particle.x + (Math.random() - 0.5) * 24, particle.y + (Math.random() - 0.5) * 24, "BLOOM"));
                if (Math.random() < 0.45) {
                  particlesToSpawn.push(spawnParticle(particle.x + (Math.random() - 0.5) * 24, particle.y + (Math.random() - 0.5) * 24, "BLOOM"));
                }
              }
            }
            if (particle.type === "ECHO" && nearbyCount(nearbyTypeCounts, i, "ECHO") >= 2) {
              if (Math.random() < 0.0015 * stepScale * birthScale * rarityMultiplier("ECHO")) {
                const echo = spawnParticle(particle.x + (Math.random() - 0.5) * 20, particle.y + (Math.random() - 0.5) * 20, "ECHO");
                echo.order = clampStat(echo.order + 18);
                echo.chaos = clampStat(echo.chaos - 14);
                particlesToSpawn.push(echo);
              }
            }
            if (particle.type === "VOID" && nearbyCount(nearbyTypeCounts, i, "PULSE") >= 2) {
              if (Math.random() < 0.0015 * stepScale * birthScale * rarityMultiplier("VOID")) {
                const v = spawnParticle(particle.x + (Math.random() - 0.5) * 24, particle.y + (Math.random() - 0.5) * 24, "VOID");
                v.chaos = clampStat(v.chaos + 14);
                particlesToSpawn.push(v);
              }
            }
            if (particle.type === "AMOR" && particle.love > 85) {
              const compatible =
                nearbyCount(nearbyTypeCounts, i, "BLOOM") +
                nearbyCount(nearbyTypeCounts, i, "ECHO") +
                nearbyCount(nearbyTypeCounts, i, "PULSE");
              if (compatible >= 1 && Math.random() < 0.0014 * stepScale * birthScale * rarityMultiplier("AMOR")) {
                const typeRoll = Math.random();
                const newType: ArchetypeKey = typeRoll < 0.34 ? "BLOOM" : typeRoll < 0.68 ? "ECHO" : "PULSE";
                const born = spawnParticle(particle.x + (Math.random() - 0.5) * 18, particle.y + (Math.random() - 0.5) * 18, newType);
                born.love = clampStat(born.love + 35);
                born.order = clampStat(born.order + 16);
                born.energy = clampStat(born.energy + 12);
                particlesToSpawn.push(born);
              }
            }

              if (particle.bondId !== null) {
                const bondIndex = idToIndex.get(particle.bondId);
                if (bondIndex === undefined || particlesToRemove.has(particle.bondId)) {
                  particle.bondId = null;
                }
              }
            }
          }

          if (particlesToRemove.size > 0) {
            const amorCandidates = particles.filter((particle) => particle.type === "AMOR");
            if (amorCandidates.length > 0) {
              const amorRemoved = amorCandidates.filter((particle) => particlesToRemove.has(particle.id)).length;
              if (amorRemoved >= amorCandidates.length) {
                // Preserve at least one Amor particle as the fundamental connective force.
                particlesToRemove.delete(amorCandidates[0].id);
              }
            }
            for (let i = particles.length - 1; i >= 0; i -= 1) {
              if (particlesToRemove.has(particles[i].id)) {
                particles.splice(i, 1);
              }
            }
          }

          if (particlesToSpawn.length > 0 && particles.length < currentConfigRef.current.maxParticles) {
            const room = Math.max(0, currentConfigRef.current.maxParticles - particles.length);
            for (let i = 0; i < Math.min(room, particlesToSpawn.length); i += 1) {
              particles.push(particlesToSpawn[i]);
            }
          }

          simulationStepsRef.current += stepScale;
          const overlapInterval = adaptivePerformance
            ? particles.length > 2400
              ? 4
              : particles.length > 1500
                ? 3
                : particles.length > 800
                  ? 2
                  : 1
            : 1;
          if (simulationStepsRef.current > NO_OVERLAP_DELAY_STEPS && step % overlapInterval === 0) {
            const overlapGrid = overlapGridRef.current;
            overlapGrid.clear();
            for (let i = 0; i < particles.length; i += 1) {
              const p = particles[i];
              const cellX = Math.floor(p.x / OVERLAP_CELL_SIZE);
              const cellY = Math.floor(p.y / OVERLAP_CELL_SIZE);
              const key = `${cellX}|${cellY}`;
              const list = overlapGrid.get(key);
              if (list) {
                list.push(i);
              } else {
                overlapGrid.set(key, [i]);
              }
            }

            for (let i = 0; i < particles.length; i += 1) {
              const a = particles[i];
              const cellX = Math.floor(a.x / OVERLAP_CELL_SIZE);
              const cellY = Math.floor(a.y / OVERLAP_CELL_SIZE);
              for (let gx = cellX - 1; gx <= cellX + 1; gx += 1) {
                for (let gy = cellY - 1; gy <= cellY + 1; gy += 1) {
                  const neighbors = overlapGrid.get(`${gx}|${gy}`);
                  if (!neighbors) {
                    continue;
                  }
                  for (let n = 0; n < neighbors.length; n += 1) {
                    const j = neighbors[n];
                    if (j <= i) {
                      continue;
                    }
                    const b = particles[j];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const distSq = dx * dx + dy * dy;
                    const pairHasLoveBond = a.bondId === b.id && b.bondId === a.id;
                    const minDistance = (a.radius + b.radius) * (pairHasLoveBond ? 0.92 : 1);
                    if (distSq === 0) {
                      const jitterX = (Math.random() - 0.5) * 0.02;
                      const jitterY = (Math.random() - 0.5) * 0.02;
                      a.x -= jitterX;
                      a.y -= jitterY;
                      b.x += jitterX;
                      b.y += jitterY;
                      continue;
                    }
                    const dist = Math.sqrt(distSq);
                    if (dist < minDistance) {
                      const overlap = (minDistance - dist) / 2;
                      const nx = dx / dist;
                      const ny = dy / dist;
                      a.x -= nx * overlap;
                      a.y -= ny * overlap;
                      b.x += nx * overlap;
                      b.y += ny * overlap;
                    }
                  }
                }
              }
            }
          }

          for (let i = residuals.length - 1; i >= 0; i -= 1) {
            residuals[i].visualTtl -= 1 * stepScale;
            residuals[i].influenceTtl -= 1 * stepScale;
            if (residuals[i].visualTtl <= 0 && residuals[i].influenceTtl <= 0) {
              residuals.splice(i, 1);
            }
          }

          const residualSoftCap = Math.min(MAX_RESIDUALS_SOFT, Math.max(700, Math.floor(particles.length * 1.6)));
          if (residuals.length > residualSoftCap) {
            residuals.splice(0, residuals.length - residualSoftCap);
          }
          if (residuals.length > MAX_RESIDUALS_HARD) {
            residuals.splice(0, residuals.length - MAX_RESIDUALS_HARD);
          }

          // Static universe: total and non-Amor counts unchanged for STATIC_UNIVERSE_UNCHANGED_SIM_SECONDS (sim time scales with Time control).
          if (
            !extinctionRecordedRef.current &&
            !staticRecordedRef.current &&
            simulationStepsRef.current > EXPLOSION_PHASE_STEPS
          ) {
            let naCount = 0;
            for (let si = 0; si < particles.length; si += 1) {
              if (particles[si].type !== "AMOR") {
                naCount += 1;
              }
            }
            const totalNow = particles.length;
            const deltaSimSec = stepScale / 60;
            const prev = staticPopulationLastRef.current;
            if (prev === null || prev.total !== totalNow || prev.nonAmor !== naCount) {
              staticPopulationLastRef.current = { total: totalNow, nonAmor: naCount };
              staticPopulationUnchangedSimRef.current = 0;
            } else {
              staticPopulationUnchangedSimRef.current += deltaSimSec;
              if (staticPopulationUnchangedSimRef.current >= STATIC_UNIVERSE_UNCHANGED_SIM_SECONDS) {
                staticRecordedRef.current = true;
                const runSecondsEq = simulationStepsRef.current / 60;
                setStaticUniverseSeconds(runSecondsEq);
                updateCurrentRunSummary(runSecondsEq, totalNow, naCount, residuals.length, "static");
                setExtinctionNotice(null);
                setPaused(true);
                const sm = sessionModeRef.current;
                if (sm === "auto" && currentRunIndexRef.current < autoRunTargetRef.current) {
                  setAutoRunCompleted(currentRunIndexRef.current);
                  setStaticUniverseNotice(
                    `Static universe: no change in total or non-Amor particle count for ${STATIC_UNIVERSE_UNCHANGED_SIM_SECONDS} sim seconds. Run ${currentRunIndexRef.current} saved. Next run in 1 second...`
                  );
                  setAutoRestartCountdown(1);
                  if (autoRestartTimeoutRef.current !== null) {
                    window.clearTimeout(autoRestartTimeoutRef.current);
                  }
                  autoRestartTimeoutRef.current = window.setTimeout(() => {
                    currentRunIndexRef.current += 1;
                    const nextConfig = randomConfig();
                    resetUniverse(nextConfig);
                    nextCheckpointStepRef.current = CHECKPOINT_INTERVAL_STEPS;
                    initRunSummary("auto", currentRunIndexRef.current, nextConfig);
                    setExtinctionNotice(null);
                    setStaticUniverseNotice(null);
                    setAutoRestartCountdown(null);
                    autoRestartTimeoutRef.current = null;
                  }, 1000);
                } else if (sm === "auto") {
                  setAutoRunCompleted(currentRunIndexRef.current);
                  setStaticUniverseNotice(
                    `Static universe on final auto run (${currentRunIndexRef.current}): counts frozen for ${STATIC_UNIVERSE_UNCHANGED_SIM_SECONDS} sim seconds; details saved.`
                  );
                  setAutoRestartCountdown(null);
                } else {
                  setStaticUniverseNotice(
                    `Static universe: total and non-Amor counts did not change for ${STATIC_UNIVERSE_UNCHANGED_SIM_SECONDS} sim seconds. Details saved — restart to run another universe?`
                  );
                  setAutoRestartCountdown(null);
                }
              }
            }
          }
        }
      }

      ctx.save();
      ctx.lineCap = "round";
      const residualRenderStride = residuals.length > 2500 ? 4 : residuals.length > 1800 ? 3 : residuals.length > 1100 ? 2 : 1;
      for (let i = 0; i < residuals.length; i += residualRenderStride) {
        const residual = residuals[i];
        if (residual.visualTtl <= 0) {
          continue;
        }
        const life = residual.visualTtl / residual.maxVisualTtl;
        const alpha = 0.03 + life * 0.1;
        const screenX = (residual.x - camera.x) * camera.zoom + canvas.width / 2;
        const screenY = (residual.y - camera.y) * camera.zoom + canvas.height / 2;
        const prevScreenX = (residual.prevX - camera.x) * camera.zoom + canvas.width / 2;
        const prevScreenY = (residual.prevY - camera.y) * camera.zoom + canvas.height / 2;
        const width = (0.35 + (residual.energy / 100) * 0.9) * Math.max(0.3, camera.zoom);

        ctx.strokeStyle = `${residual.color}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")}`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(prevScreenX, prevScreenY);
        ctx.lineTo(screenX, screenY);
        ctx.stroke();
      }
      ctx.restore();

      // World boundary guide: visual square for universe limits.
      ctx.save();
      ctx.strokeStyle = "rgba(167, 139, 250, 0.45)";
      ctx.lineWidth = Math.max(1, camera.zoom * 2);
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(boundaryLeft, boundaryTop, boundarySize, boundarySize);
      ctx.restore();

      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        const screenX = (particle.x - camera.x) * camera.zoom + canvas.width / 2;
        const screenY = (particle.y - camera.y) * camera.zoom + canvas.height / 2;
        const screenRadius = particle.radius * camera.zoom;

        ctx.fillStyle = particle.archetype.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);

        if (particle.type === "AMOR") {
          ctx.shadowColor = "#ec4899";
          ctx.shadowBlur = 25;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fill();
        }
      }

      if (selectedParticleIdRef.current !== null) {
        const selected = particles.find((particle) => particle.id === selectedParticleIdRef.current);
        if (selected) {
          const sx = (selected.x - camera.x) * camera.zoom + canvas.width / 2;
          const sy = (selected.y - camera.y) * camera.zoom + canvas.height / 2;
          const cardWidth = 184;
          const cardHeight = 96;
          const cardX = Math.max(10, Math.min(canvas.width - cardWidth - 10, sx - cardWidth / 2));
          const cardY = Math.max(10, sy - selected.radius * camera.zoom - cardHeight - 16);
          ctx.save();
          ctx.fillStyle = "rgba(8, 8, 26, 0.9)";
          ctx.strokeStyle = "rgba(177, 164, 255, 0.7)";
          ctx.lineWidth = 1;
          drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 10);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = selected.archetype.color;
          ctx.font = "bold 12px Inter, system-ui, sans-serif";
          ctx.fillText(`${selected.archetype.name} #${selected.id}`, cardX + 10, cardY + 17);

          ctx.fillStyle = "#ddd8ff";
          ctx.font = "11px Inter, system-ui, sans-serif";
          ctx.fillText(`Love: ${selected.love.toFixed(1)}  Chaos: ${selected.chaos.toFixed(1)}`, cardX + 10, cardY + 36);
          ctx.fillText(`Order: ${selected.order.toFixed(1)}  Energy: ${selected.energy.toFixed(1)}`, cardX + 10, cardY + 52);
          ctx.fillText(`Age: ${selected.age.toFixed(1)}  Bond: ${selected.bondId ?? "-"}`, cardX + 10, cardY + 68);
          ctx.fillStyle = "#bcb7e9";
          ctx.fillText(`Tap empty space to clear selection`, cardX + 10, cardY + 84);
          ctx.restore();
        }
      }

      frameCounterRef.current += 1;
      if (time - lastFpsTimeRef.current >= 1000) {
        const runSeconds = simulationStepsRef.current / 60;
        const nonAmorCount = particles.reduce((total, particle) => total + (particle.type === "AMOR" ? 0 : 1), 0);
        while (simulationStepsRef.current >= nextCheckpointStepRef.current && nonAmorCount > 0) {
          updateCurrentRunSummary(runSeconds, particles.length, nonAmorCount, residuals.length, "none");
          nextCheckpointStepRef.current += CHECKPOINT_INTERVAL_STEPS;
        }
        if (nonAmorCount === 0 && !extinctionRecordedRef.current) {
          extinctionRecordedRef.current = true;
          setStaticUniverseNotice(null);
          setStaticUniverseSeconds(null);
          setExtinctionSeconds(runSeconds);
          const nextCount = extinctionCountRef.current + 1;
          const previousAvg = extinctionAvgRef.current;
          const nextAvg = previousAvg === null ? runSeconds : (previousAvg * (nextCount - 1) + runSeconds) / nextCount;
          extinctionCountRef.current = nextCount;
          extinctionAvgRef.current = nextAvg;
          setExtinctionCount(nextCount);
          setExtinctionAvgSeconds(nextAvg);
          updateCurrentRunSummary(runSeconds, particles.length, nonAmorCount, residuals.length, "extinct");
          if (sessionMode === "auto" && currentRunIndexRef.current < autoRunTargetRef.current) {
            setAutoRunCompleted(currentRunIndexRef.current);
            setExtinctionNotice(`Extinction Event! All non-Amor particles vanished in run ${currentRunIndexRef.current}. Saved and restarting in 1 second...`);
            setAutoRestartCountdown(1);
            setPaused(true);
            if (autoRestartTimeoutRef.current !== null) {
              window.clearTimeout(autoRestartTimeoutRef.current);
            }
            autoRestartTimeoutRef.current = window.setTimeout(() => {
              currentRunIndexRef.current += 1;
              const nextConfig = randomConfig();
              resetUniverse(nextConfig);
              nextCheckpointStepRef.current = CHECKPOINT_INTERVAL_STEPS;
              initRunSummary("auto", currentRunIndexRef.current, nextConfig);
              setExtinctionNotice(null);
              setStaticUniverseNotice(null);
              setAutoRestartCountdown(null);
              autoRestartTimeoutRef.current = null;
            }, 1000);
          } else if (sessionMode === "auto") {
            setAutoRunCompleted(currentRunIndexRef.current);
            setExtinctionNotice(`Extinction Event! All non-Amor particles vanished. Final auto run (${currentRunIndexRef.current}) saved.`);
            setAutoRestartCountdown(null);
            setPaused(true);
          } else {
            setExtinctionNotice("Extinction Event! All non-Amor particles vanished. Details saved, do you want to restart?");
            setAutoRestartCountdown(null);
            setPaused(true);
          }
        }
        if (nonAmorCount > 0) {
          updateCurrentRunSummary(runSeconds, particles.length, nonAmorCount, residuals.length, "none");
        }
        setFps(frameCounterRef.current);
        frameCounterRef.current = 0;
        lastFpsTimeRef.current = time;
        setParticleCount(particles.length);
        setAmorCount(particles.filter((particle) => particle.type === "AMOR").length);
        setResidualCount(residuals.length);
        setExplosionPhaseActive(simulationStepsRef.current <= EXPLOSION_PHASE_STEPS);
        setElapsedSimSeconds(runSeconds);
        setSubstepsPerFrame(frameCounterRef.current > 0 ? substepsAccumulatorRef.current / frameCounterRef.current : 0);
        setInteractionChecksPerSecond(interactionChecksAccumulatorRef.current);
        substepsAccumulatorRef.current = 0;
        interactionChecksAccumulatorRef.current = 0;
        setArchetypeCounts(countArchetypes(particles));
      }

      rafRef.current = window.requestAnimationFrame(drawFrame);
    };

    rafRef.current = window.requestAnimationFrame(drawFrame);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      mountedRef.current = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [setupOpen]);

  const archetypeLegend = useMemo(
    () =>
      (Object.entries(ARCHETYPES) as [ArchetypeKey, Archetype][]).map(([key, archetype]) => ({
        color: archetype.color,
        name: archetype.name,
        count: archetypeCounts[key]
      })),
    [archetypeCounts]
  );

  const restartAfterRunEnd = useCallback(() => {
    currentRunIndexRef.current += 1;
    resetUniverse(currentConfigRef.current);
    nextCheckpointStepRef.current = CHECKPOINT_INTERVAL_STEPS;
    initRunSummary(sessionModeRef.current ?? "individual", currentRunIndexRef.current, currentConfigRef.current);
    setExtinctionNotice(null);
    setStaticUniverseNotice(null);
    setAutoRestartCountdown(null);
  }, [initRunSummary, resetUniverse]);

  if (setupOpen) {
    return (
      <main className="app">
        <div className="startup-overlay">
          <section
            className="startup-card"
            onPointerDownCapture={(event) => {
              event.stopPropagation();
              appendSetupDebug(`pointerdown: ${(event.target as HTMLElement).tagName}`);
            }}
            onWheelCapture={(event) => {
              event.stopPropagation();
              appendSetupDebug(`wheel: deltaY=${event.deltaY.toFixed(2)}`);
            }}
            onKeyDownCapture={(event) => {
              appendSetupDebug(`keydown: key=${event.key}`);
              if (event.key === "Enter") {
                event.preventDefault();
              }
            }}
            onInputCapture={(event) => {
              const target = event.target;
              const value = debugValueFromEventTarget(target);
              if (value === null) {
                return;
              }
              const el = target instanceof HTMLElement ? target : null;
              const id =
                el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
                  ? el.name || el.id || el.tagName
                  : el?.id || el?.tagName || "unknown";
              appendSetupDebug(`input: ${id}=${value}`);
            }}
            onChangeCapture={(event) => {
              const target = event.target;
              const value = debugValueFromEventTarget(target);
              if (value === null) {
                return;
              }
              const el = target instanceof HTMLElement ? target : null;
              const id =
                el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
                  ? el.name || el.id || el.tagName
                  : el?.id || el?.tagName || "unknown";
              appendSetupDebug(`change: ${id}=${value}`);
            }}
          >
            <h2>Choose Session Mode</h2>
            <p>Configure parameters before the first Big Bang. Session start opens one save dialog for a Markdown session log (`.md`).</p>
            <label className="startup-toggle">
              <span>Setup debug log</span>
              <input
                type="checkbox"
                checked={setupDebugEnabled}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSetupDebugEnabled(checked);
                  if (!checked) {
                    if (setupDebugFlushRafRef.current !== null) {
                      window.cancelAnimationFrame(setupDebugFlushRafRef.current);
                      setupDebugFlushRafRef.current = null;
                    }
                    setupDebugLinesRef.current = [];
                    setSetupDebugEvents([]);
                  }
                }}
              />
            </label>
            <div className="startup-mode-toggle">
              <button type="button" onClick={() => setStartupMode("individual")} className={startupMode === "individual" ? "is-active" : ""}>
                Individual
              </button>
              <button type="button" onClick={() => setStartupMode("auto")} className={startupMode === "auto" ? "is-active" : ""}>
                Auto
              </button>
            </div>
            <div className="startup-grid">
              <label>
                Pulse
                <input
                  name="pulse"
                  type="number"
                  min={0}
                  value={setupDraft.counts.PULSE}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({
                      ...prev,
                      counts: { ...prev.counts, PULSE: value }
                    }));
                  }}
                />
              </label>
              <label>
                Bloom
                <input
                  name="bloom"
                  type="number"
                  min={0}
                  value={setupDraft.counts.BLOOM}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({
                      ...prev,
                      counts: { ...prev.counts, BLOOM: value }
                    }));
                  }}
                />
              </label>
              <label>
                Echo
                <input
                  name="echo"
                  type="number"
                  min={0}
                  value={setupDraft.counts.ECHO}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({
                      ...prev,
                      counts: { ...prev.counts, ECHO: value }
                    }));
                  }}
                />
              </label>
              <label>
                Void
                <input
                  name="void"
                  type="number"
                  min={0}
                  value={setupDraft.counts.VOID}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({
                      ...prev,
                      counts: { ...prev.counts, VOID: value }
                    }));
                  }}
                />
              </label>
              <label>
                Amor
                <input
                  name="amor"
                  type="number"
                  min={0}
                  value={setupDraft.counts.AMOR}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({
                      ...prev,
                      counts: { ...prev.counts, AMOR: value }
                    }));
                  }}
                />
              </label>
              <label>
                Max particles
                <input
                  name="max-particles"
                  type="number"
                  min={100}
                  max={10000}
                  value={setupDraft.maxParticles}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({
                      ...prev,
                      maxParticles: value
                    }));
                  }}
                />
              </label>
              <label>
                Attraction scale
                <input
                  type="number"
                  step="0.01"
                  value={setupDraft.attractionScale}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, attractionScale: value }));
                  }}
                />
              </label>
              <label>
                Same-type repulsion
                <input
                  type="number"
                  step="0.001"
                  value={setupDraft.sameTypeRepulsion}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, sameTypeRepulsion: value }));
                  }}
                />
              </label>
              <label>
                Bond pull force
                <input
                  type="number"
                  step="0.01"
                  value={setupDraft.amorPairForce}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, amorPairForce: value }));
                  }}
                />
              </label>
              <label>
                Influence TTL base
                <input
                  type="number"
                  min={1}
                  value={setupDraft.influenceTtlBase}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, influenceTtlBase: value }));
                  }}
                />
              </label>
              <label>
                Influence TTL explosion base
                <input
                  type="number"
                  min={1}
                  value={setupDraft.influenceTtlExplosionBase}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, influenceTtlExplosionBase: value }));
                  }}
                />
              </label>
              <label>
                Low-pop threshold
                <input
                  type="number"
                  min={1}
                  value={setupDraft.lowPopulationThreshold}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, lowPopulationThreshold: value }));
                  }}
                />
              </label>
              <label>
                Low-pop death scale
                <input
                  type="number"
                  step="0.01"
                  min={0.05}
                  max={1}
                  value={setupDraft.lowPopulationDeathScale}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, lowPopulationDeathScale: value }));
                  }}
                />
              </label>
              <label>
                Rarity birth boost
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  value={setupDraft.rarityBirthBoost}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, rarityBirthBoost: value }));
                  }}
                />
              </label>
              <label>
                Diversity floor
                <input
                  type="number"
                  min={1}
                  value={setupDraft.diversityFloor}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, diversityFloor: value }));
                  }}
                />
              </label>
              <label>
                Love death protection
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={0.95}
                  value={setupDraft.loveDeathProtection}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setSetupDraft((prev) => ({ ...prev, loveDeathProtection: value }));
                  }}
                />
              </label>
              <label className="startup-toggle">
                <span>Adaptive performance mode</span>
                <input
                  type="checkbox"
                  checked={setupDraft.adaptivePerformanceMode}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSetupDraft((prev) => ({
                      ...prev,
                      adaptivePerformanceMode: checked
                    }));
                  }}
                />
              </label>
              {startupMode === "auto" ? (
                <label>
                  Auto runs
                  <input
                    type="number"
                    min={1}
                    value={setupDraft.autoRunTarget}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSetupDraft((prev) => ({ ...prev, autoRunTarget: value }));
                    }}
                  />
                </label>
              ) : null}
            </div>
            <div className="startup-actions">
              <button
                type="button"
                onClick={async () => {
                  wakeHud();
                  try {
                    const parsed = parseSetupSession();
                    appendSetupDebug(`start-click: pulse=${parsed.config.counts.PULSE}, max=${parsed.config.maxParticles}`);
                    await startSession(startupMode, parsed.config, parsed.autoRuns);
                  } catch (error) {
                    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
                    appendSetupDebug(`start-click error: ${message}`);
                    throw error;
                  }
                }}
              >
                Start {startupMode === "individual" ? "Individual Session" : "Auto Mode"}
              </button>
            </div>
            {setupDebugEnabled ? (
              <div style={{ marginTop: 12, border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: 10 }}>
                <p className="dim" style={{ marginBottom: 8 }}>
                  Setup Debug Console
                </p>
                <div
                  style={{
                    maxHeight: 170,
                    overflowY: "auto",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 11,
                    lineHeight: 1.4
                  }}
                >
                  {setupDebugEvents.length === 0 ? <div className="dim">No events yet.</div> : null}
                  {setupDebugEvents.map((line, index) => (
                    <div key={`${line}-${index}`}>{line}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <canvas ref={canvasRef} className="simulation-canvas" />

      <div
        className={`hud-layer ${hudAwake ? "is-awake" : ""}`}
        onPointerDownCapture={wakeHud}
        onPointerMoveCapture={wakeHud}
      >
        <section className="panel">
          <div className="title-row">
            <span className="pulse-dot" />
            <strong>Universe Game v1.3.16</strong>
          </div>
          <p className="dim">Particles: {particleCount} | Amor: {amorCount} | FPS: {fps}</p>
          <p className="dim">Session: {sessionMode === null ? "Not started" : sessionMode === "individual" ? "Individual" : "Auto"}</p>
          <p className="dim">Adaptive Performance: {currentConfigRef.current.adaptivePerformanceMode ? "On" : "Off"}</p>
          <p className="dim">Session export: {sessionExportStatus}</p>
          {sessionMode === "auto" ? <p className="dim">Auto progress: {autoRunCompleted}/{autoRunTargetRef.current}</p> : null}
          <p className="dim">State: {paused ? "Paused" : "Running"} | Time: {timeScale.toFixed(timeScale >= 100 ? 0 : timeScale >= 10 ? 1 : 2)}x</p>
          <p className="dim">World: {WORLD_SIZE} x {WORLD_SIZE} (wrap)</p>
          <p className="dim">
            Sim Timer: {elapsedSimSeconds.toFixed(1)}s (scales with Time control)
            {extinctionSeconds !== null ? ` | Extinction: ${extinctionSeconds.toFixed(1)}s` : ""}
            {staticUniverseSeconds !== null ? ` | Static: ${staticUniverseSeconds.toFixed(1)}s` : ""}
          </p>
          <p className="dim">
            Extinction Avg ({extinctionCount} run{extinctionCount === 1 ? "" : "s"}):{" "}
            {extinctionAvgSeconds !== null ? `${extinctionAvgSeconds.toFixed(1)}s` : "-"}
          </p>
          <p className="dim">Phase: {explosionPhaseActive ? "Explosion" : "Rules Active"} | Residuals: {residualCount}</p>
          <p className="dim">
            Workload: substeps/frame {substepsPerFrame.toFixed(2)} | interaction checks/s {interactionChecksPerSecond.toLocaleString()}
          </p>
          <p className="dim">Ambient: {isMusicPlaying ? "Playing" : "Off"} (optional)</p>
          <div className="legend dim">
            {archetypeLegend.map((entry) => (
              <span key={entry.name}>
                <span className="chip" style={{ background: entry.color }} />
                {entry.name}: {entry.count}
              </span>
            ))}
          </div>
          {showHelp ? (
            <p className="dim">
              Drag: pan • Pinch/Scroll: zoom • Space: pause • R: reset • H: toggle help • Residual Frequencies: attraction, mutation, inspiration, avoidance • Sim timer
              scales with the Time control. If total and non-Amor counts stay identical for {STATIC_UNIVERSE_UNCHANGED_SIM_SECONDS} sim seconds, a Static Universe pause triggers (like extinction).
            </p>
          ) : null}
        </section>

        <div className="controls">
          <div className="slider-stack">
            <label className="vertical-control" htmlFor="zoom-control">
              <span>Zoom</span>
              <input
                id="zoom-control"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={zoomSliderValue}
                onChange={(event) => {
                  wakeHud();
                  setZoomFromSlider(Number(event.currentTarget.value));
                }}
              />
              <strong>{cameraZoom.toFixed(cameraZoom < 0.1 ? 3 : 2)}x</strong>
            </label>

            <label className="vertical-control" htmlFor="time-scale">
              <span>Time</span>
              <input
                id="time-scale"
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={sliderValue}
                onChange={(event) => {
                  wakeHud();
                  setTimeScaleFromSlider(Number(event.currentTarget.value));
                }}
              />
              <strong>{timeScale.toFixed(timeScale >= 100 ? 0 : timeScale >= 10 ? 1 : 2)}x</strong>
            </label>
          </div>

          <button
            type="button"
            onClick={() => {
              wakeHud();
              setPaused((value) => !value);
            }}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => {
              wakeHud();
              void toggleAmbientMusic();
            }}
          >
            {isMusicPlaying ? "Pause Ambient" : "Play Ambient"}
          </button>
          <button
            type="button"
            onClick={() => {
              wakeHud();
              currentRunIndexRef.current += 1;
              resetUniverse(currentConfigRef.current);
              nextCheckpointStepRef.current = CHECKPOINT_INTERVAL_STEPS;
              initRunSummary(sessionModeRef.current ?? "individual", currentRunIndexRef.current, currentConfigRef.current);
            }}
          >
            Big Bang Reset
          </button>
        </div>
      </div>

      {extinctionNotice || staticUniverseNotice ? (
        <div className="event-overlay">
          <section className="event-card">
            <h3>{extinctionNotice ? "Extinction Event!" : "Static universe"}</h3>
            <p>{extinctionNotice ?? staticUniverseNotice}</p>
            {sessionMode === "individual" ? (
              <button
                type="button"
                onClick={() => {
                  wakeHud();
                  restartAfterRunEnd();
                }}
              >
                Restart Universe
              </button>
            ) : autoRestartCountdown !== null ? (
              <p className="dim">Auto restart in {autoRestartCountdown}s...</p>
            ) : null}
          </section>
        </div>
      ) : null}

    </main>
  );
}

export default App;
