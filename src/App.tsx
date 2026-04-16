import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WORLD_SIZE = 6000;
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
  ttl: number;
  maxTtl: number;
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

const MAX_PARTICLES = 1200;
const LOVE_BOND_DISTANCE = 34;
const LOVE_BOND_THRESHOLD = 80;
const BASE_INTERACTION_DISTANCE = 130;
const NO_OVERLAP_DELAY_STEPS = 60;
const OVERLAP_CELL_SIZE = 24;

const ATTRACTION_MATRIX: Record<ArchetypeKey, Partial<Record<ArchetypeKey, number>>> = {
  PULSE: { BLOOM: 0.09, AMOR: 0.12, ECHO: -0.08, VOID: -0.06 },
  BLOOM: { PULSE: 0.08, ECHO: 0.07, AMOR: 0.12, VOID: -0.04 },
  ECHO: { BLOOM: 0.07, AMOR: 0.1, PULSE: -0.07, VOID: -0.08 },
  VOID: { PULSE: 0.08, BLOOM: -0.08, ECHO: -0.08, AMOR: -0.02, VOID: -0.03 },
  AMOR: { PULSE: 0.11, BLOOM: 0.12, ECHO: 0.12, VOID: 0.09, AMOR: 0.03 }
};

let nextParticleId = 1;

function clampStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function forceForPair(a: ArchetypeKey, b: ArchetypeKey): number {
  if (a === b) {
    return -0.03;
  }
  return ATTRACTION_MATRIX[a][b] ?? 0;
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

function createBigBangParticles(): Particle[] {
  const particles: Particle[] = [];
  const centerX = WORLD_SIZE / 2;
  const centerY = WORLD_SIZE / 2;

  for (const type of Object.keys(BIG_BANG_COUNTS) as ArchetypeKey[]) {
    const count = BIG_BANG_COUNTS[type];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.2 + Math.random() * 2.8;
      const dist = 35 + Math.random() * 95;
      const particle = spawnParticle(centerX + Math.cos(angle) * dist, centerY + Math.sin(angle) * dist, type);
      particle.vx = Math.cos(angle) * speed;
      particle.vy = Math.sin(angle) * speed;
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

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [timeScale, setTimeScale] = useState(1);
  const [cameraZoom, setCameraZoom] = useState(0.65);
  const [fps, setFps] = useState(0);
  const [particleCount, setParticleCount] = useState(0);
  const [amorCount, setAmorCount] = useState(0);
  const [archetypeCounts, setArchetypeCounts] = useState<Record<ArchetypeKey, number>>(createEmptyArchetypeCounts);
  const [hudAwake, setHudAwake] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [selectedParticleId, setSelectedParticleId] = useState<number | null>(null);

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
  const frameCounterRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const pausedRef = useRef(paused);
  const timeScaleRef = useRef(timeScale);
  const mountedRef = useRef(true);
  const lastFrameTimeRef = useRef(performance.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const ambientNodesRef = useRef<OscillatorNode[]>([]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    selectedParticleIdRef.current = selectedParticleId;
  }, [selectedParticleId]);

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

  const resetUniverse = useCallback(() => {
    nextParticleId = 1;
    const particles = createBigBangParticles();
    particlesRef.current = particles;
    residualsRef.current = [];
    residualAccumulatorRef.current = 0;
    simulationStepsRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    setSelectedParticleId(null);
    setParticleCount(particles.length);
    setAmorCount(particles.filter((particle) => particle.type === "AMOR").length);
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

  useEffect(() => {
    resetUniverse();
  }, [resetUniverse]);

  useEffect(() => {
    return () => {
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
    };
  }, [stopAmbientMusic]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      } else if (key === "r") {
        resetUniverse();
      } else if (key === "h") {
        setShowHelp((value) => !value);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [resetUniverse]);

  useEffect(() => {
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

      ctx.fillStyle = "rgba(10, 10, 31, 0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!pausedRef.current) {
        const frameScale = (frameDeltaMs / 16.666) * timeScaleRef.current;
        const subSteps = Math.max(1, Math.min(10, Math.ceil(frameScale / 1.8)));
        const stepScale = frameScale / subSteps;

        for (let step = 0; step < subSteps; step += 1) {
          const residualGrid = new Map<string, number[]>();
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

          const interactionCounts = new Array<number>(particles.length).fill(0);
          const nearbyTypeCounts = particles.map(() => createEmptyArchetypeCounts());
          const particlesToRemove = new Set<number>();
          const particlesToSpawn: Particle[] = [];
          const idToIndex = new Map<number, number>();
          for (let i = 0; i < particles.length; i += 1) {
            idToIndex.set(particles[i].id, i);
          }

          for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];
            particle.age += stepScale;
            let ax = 0;
            let ay = 0;

            for (let j = 0; j < particles.length; j += 1) {
              if (i === j) {
                continue;
              }

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

              nearbyTypeCounts[i][other.type] += 1;
              interactionCounts[i] += 1;

              if (particle.type === "AMOR" && dist < 80) {
                other.love = clampStat(other.love + 0.18 * stepScale);
                other.energy = clampStat(other.energy + 0.08 * stepScale);
              }

              if (particle.type === "VOID" && other.type !== "VOID" && dist < 18 && Math.random() < 0.0038 * stepScale) {
                particlesToRemove.add(other.id);
                particle.energy = clampStat(particle.energy + 6);
                particle.chaos = clampStat(particle.chaos + 2);
              }

              let force = forceForPair(particle.type, other.type);
              if (particle.bondId !== null && particle.bondId === other.id) {
                force = 0.22;
              }
              ax += (dx / dist) * force;
              ay += (dy / dist) * force;

              if (particle.type === "VOID" && other.type === "BLOOM" && particle.love > 74 && Math.random() < 0.0018 * stepScale) {
                particle.type = "BLOOM";
                particle.archetype = ARCHETYPES.BLOOM;
                particle.radius = ARCHETYPES.BLOOM.size;
                particle.chaos = clampStat(particle.chaos - 30);
                particle.order = clampStat(particle.order + 24);
              }

              if (
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

            const particleCellX = Math.floor(particle.x / RESIDUAL_CELL_SIZE);
            const particleCellY = Math.floor(particle.y / RESIDUAL_CELL_SIZE);
            for (let gx = particleCellX - 1; gx <= particleCellX + 1; gx += 1) {
              for (let gy = particleCellY - 1; gy <= particleCellY + 1; gy += 1) {
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
                  const influence = residual.ttl / residual.maxTtl;
                  const dirX = dx / dist;
                  const dirY = dy / dist;
                  ax += dirX * ((residual.love / 100) * 0.028 + (residual.order / 100) * 0.014) * influence;
                  ay += dirY * ((residual.love / 100) * 0.028 + (residual.order / 100) * 0.014) * influence;

                  const avoidance = (residual.chaos / 100) * 0.026 * influence;
                  ax -= dirX * avoidance;
                  ay -= dirY * avoidance;

                  if (Math.random() < (residual.chaos / 1000) * influence) {
                    particle.chaos = clampStat(particle.chaos + (Math.random() - 0.5) * 7);
                    particle.order = clampStat(particle.order + (Math.random() - 0.5) * 5);
                    particle.energy = clampStat(particle.energy + (Math.random() - 0.5) * 8);
                  }

                  if (Math.random() < (residual.energy / 1600) * influence) {
                    particle.vx += dirX * 0.07;
                    particle.vy += dirY * 0.07;
                  }
                }
              }
            }

            const damping = Math.max(0.82, 0.96 - particle.chaos * 0.0006);
            particle.vx = particle.vx * damping + ax * stepScale;
            particle.vy = particle.vy * damping + ay * stepScale;
            particle.x += particle.vx * stepScale;
            particle.y += particle.vy * stepScale;

            if (particle.x < 100) {
              particle.vx += 0.4 * stepScale;
            }
            if (particle.x > WORLD_SIZE - 100) {
              particle.vx -= 0.4 * stepScale;
            }
            if (particle.y < 100) {
              particle.vy += 0.4 * stepScale;
            }
            if (particle.y > WORLD_SIZE - 100) {
              particle.vy -= 0.4 * stepScale;
            }

            if (Math.random() < 0.02 * stepScale) {
              particle.love = Math.max(0, particle.love - 0.25);
              particle.energy = Math.max(0, particle.energy - 0.1);
            }

            residualAccumulatorRef.current += stepScale;
            if (residualAccumulatorRef.current >= RESIDUAL_EMIT_INTERVAL) {
              residualAccumulatorRef.current = 0;
              residuals.push({
                x: particle.x,
                y: particle.y,
                prevX: particle.x - particle.vx * 2.2,
                prevY: particle.y - particle.vy * 2.2,
                love: particle.love,
                chaos: particle.chaos,
                order: particle.order,
                energy: particle.energy,
                ttl: 170 + particle.energy,
                maxTtl: 170 + particle.energy,
                color: particle.archetype.color
              });
            }
          }

          for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];
            const nearby = nearbyTypeCounts[i];

            if (interactionCounts[i] === 0) {
              particle.inactiveSteps += stepScale;
            } else {
              particle.inactiveSteps = Math.max(0, particle.inactiveSteps - stepScale * 0.6);
            }

            if (particle.love <= 1 && Math.random() < 0.0018 * stepScale) {
              particlesToRemove.add(particle.id);
            }

            if (particle.type === "PULSE" && particle.inactiveSteps > 80) {
              particlesToRemove.add(particle.id);
            }
            if (particle.type === "BLOOM" && nearby.VOID >= 3) {
              if (Math.random() < 0.0036 * stepScale) {
                particlesToRemove.add(particle.id);
              }
            }
            if (particle.type === "ECHO" && particle.chaos > 85) {
              if (Math.random() < 0.0036 * stepScale) {
                particlesToRemove.add(particle.id);
              }
            }
            if (particle.type === "VOID" && Math.random() < 0.0019 * stepScale) {
              particlesToRemove.add(particle.id);
            }
            if (particle.type === "AMOR" && nearby.VOID >= 2 && Math.random() < 0.0017 * stepScale) {
              const saveTarget = particles.find((candidate) => candidate.type !== "AMOR" && !particlesToRemove.has(candidate.id));
              if (saveTarget) {
                saveTarget.love = clampStat(saveTarget.love + 45);
                saveTarget.energy = clampStat(saveTarget.energy + 28);
                particlesToRemove.add(particle.id);
              }
            }

            if (particle.type === "PULSE" && nearby.BLOOM >= 1) {
              if (Math.random() < 0.0015 * stepScale) {
                particlesToSpawn.push(spawnParticle(particle.x + (Math.random() - 0.5) * 30, particle.y + (Math.random() - 0.5) * 30, "PULSE"));
              }
            }
            if (particle.type === "BLOOM" && nearby.ECHO >= 1) {
              if (Math.random() < 0.0017 * stepScale) {
                particlesToSpawn.push(spawnParticle(particle.x + (Math.random() - 0.5) * 24, particle.y + (Math.random() - 0.5) * 24, "BLOOM"));
                if (Math.random() < 0.45) {
                  particlesToSpawn.push(spawnParticle(particle.x + (Math.random() - 0.5) * 24, particle.y + (Math.random() - 0.5) * 24, "BLOOM"));
                }
              }
            }
            if (particle.type === "ECHO" && nearby.ECHO >= 2) {
              if (Math.random() < 0.0015 * stepScale) {
                const echo = spawnParticle(particle.x + (Math.random() - 0.5) * 20, particle.y + (Math.random() - 0.5) * 20, "ECHO");
                echo.order = clampStat(echo.order + 18);
                echo.chaos = clampStat(echo.chaos - 14);
                particlesToSpawn.push(echo);
              }
            }
            if (particle.type === "VOID" && nearby.PULSE >= 2) {
              if (Math.random() < 0.0015 * stepScale) {
                const v = spawnParticle(particle.x + (Math.random() - 0.5) * 24, particle.y + (Math.random() - 0.5) * 24, "VOID");
                v.chaos = clampStat(v.chaos + 14);
                particlesToSpawn.push(v);
              }
            }
            if (particle.type === "AMOR" && particle.love > 85) {
              const compatible = nearby.BLOOM + nearby.ECHO + nearby.PULSE;
              if (compatible >= 1 && Math.random() < 0.0014 * stepScale) {
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

          if (particlesToRemove.size > 0) {
            for (let i = particles.length - 1; i >= 0; i -= 1) {
              if (particlesToRemove.has(particles[i].id)) {
                particles.splice(i, 1);
              }
            }
          }

          if (particlesToSpawn.length > 0 && particles.length < MAX_PARTICLES) {
            const room = Math.max(0, MAX_PARTICLES - particles.length);
            for (let i = 0; i < Math.min(room, particlesToSpawn.length); i += 1) {
              particles.push(particlesToSpawn[i]);
            }
          }

          simulationStepsRef.current += stepScale;
          if (simulationStepsRef.current > NO_OVERLAP_DELAY_STEPS) {
            const overlapGrid = new Map<string, number[]>();
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
            residuals[i].ttl -= 1 * stepScale;
            if (residuals[i].ttl <= 0) {
              residuals.splice(i, 1);
            }
          }

          if (residuals.length > MAX_RESIDUALS) {
            residuals.splice(0, residuals.length - MAX_RESIDUALS);
          }
        }
      }

      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < residuals.length; i += 1) {
        const residual = residuals[i];
        const life = residual.ttl / residual.maxTtl;
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
        setFps(frameCounterRef.current);
        frameCounterRef.current = 0;
        lastFpsTimeRef.current = time;
        setParticleCount(particles.length);
        setAmorCount(particles.filter((particle) => particle.type === "AMOR").length);
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
  }, []);

  const archetypeLegend = useMemo(
    () =>
      (Object.entries(ARCHETYPES) as [ArchetypeKey, Archetype][]).map(([key, archetype]) => ({
        color: archetype.color,
        name: archetype.name,
        count: archetypeCounts[key]
      })),
    [archetypeCounts]
  );

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
            <strong>Universe Game v1.3.1</strong>
          </div>
          <p className="dim">Particles: {particleCount} | Amor: {amorCount} | FPS: {fps}</p>
          <p className="dim">State: {paused ? "Paused" : "Running"} | Time: {timeScale.toFixed(timeScale >= 100 ? 0 : timeScale >= 10 ? 1 : 2)}x</p>
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
            <p className="dim">Drag: pan • Pinch/Scroll: zoom • Space: pause • R: reset • H: toggle help • Residual Frequencies: attraction, mutation, inspiration, avoidance</p>
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
              resetUniverse();
            }}
          >
            Big Bang Reset
          </button>
        </div>
      </div>
    </main>
  );
}

export default App;
