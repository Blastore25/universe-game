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

function spawnParticle(x: number, y: number, type: ArchetypeKey): Particle {
  const archetype = ARCHETYPES[type];
  return {
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
    radius: archetype.size
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

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [timeScale, setTimeScale] = useState(1);
  const [fps, setFps] = useState(0);
  const [particleCount, setParticleCount] = useState(0);
  const [amorCount, setAmorCount] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  const particlesRef = useRef<Particle[]>([]);
  const residualsRef = useRef<ResidualFrequency[]>([]);
  const residualAccumulatorRef = useRef(0);
  const cameraRef = useRef<Camera>({
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    zoom: 0.65
  });
  const dragRef = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0
  });
  const rafRef = useRef<number | null>(null);
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

  const sliderValue = useMemo(() => {
    return (Math.log10(timeScale) - TIME_SCALE_LOG_MIN) / (TIME_SCALE_LOG_MAX - TIME_SCALE_LOG_MIN);
  }, [timeScale]);

  const setTimeScaleFromSlider = useCallback((normalized: number) => {
    const nextLog = TIME_SCALE_LOG_MIN + normalized * (TIME_SCALE_LOG_MAX - TIME_SCALE_LOG_MIN);
    const nextScale = 10 ** nextLog;
    setTimeScale(nextScale);
  }, []);

  const resetUniverse = useCallback(() => {
    const particles = createBigBangParticles();
    particlesRef.current = particles;
    residualsRef.current = [];
    residualAccumulatorRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    setParticleCount(particles.length);
    setAmorCount(particles.filter((particle) => particle.type === "AMOR").length);
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

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const onPointerDown = (event: PointerEvent) => {
      dragRef.current.isDragging = true;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current.isDragging) {
        return;
      }

      const camera = cameraRef.current;
      const dx = (event.clientX - dragRef.current.lastX) / camera.zoom;
      const dy = (event.clientY - dragRef.current.lastY) / camera.zoom;
      camera.x -= dx;
      camera.y -= dy;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      dragRef.current.isDragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.12;
      const camera = cameraRef.current;
      camera.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.zoom * factor));
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

          for (let i = 0; i < particles.length; i += 1) {
            const particle = particles[i];
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
              if (dist >= 120) {
                continue;
              }

              const isAmor = particle.type === "AMOR" || other.type === "AMOR";
              let force = 0;

              if (isAmor) {
                force = 0.08;
              } else if (particle.type === other.type) {
                force = -0.03;
              } else {
                force = (particle.archetype.reactivity - other.archetype.reactivity) * 0.12;
              }

              ax += (dx / dist) * force;
              ay += (dy / dist) * force;
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

                  // Attraction and inspiration from coherent frequencies.
                  ax += dirX * ((residual.love / 100) * 0.028 + (residual.order / 100) * 0.014) * influence;
                  ay += dirY * ((residual.love / 100) * 0.028 + (residual.order / 100) * 0.014) * influence;

                  // Avoidance from chaotic frequencies.
                  const avoidance = (residual.chaos / 100) * 0.026 * influence;
                  ax -= dirX * avoidance;
                  ay -= dirY * avoidance;

                  // Mutation pressure: chaos and energy softly drift properties.
                  if (Math.random() < (residual.chaos / 1000) * influence) {
                    particle.chaos = Math.min(100, Math.max(0, particle.chaos + (Math.random() - 0.5) * 7));
                    particle.order = Math.min(100, Math.max(0, particle.order + (Math.random() - 0.5) * 5));
                    particle.energy = Math.min(100, Math.max(0, particle.energy + (Math.random() - 0.5) * 8));
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

      frameCounterRef.current += 1;
      if (time - lastFpsTimeRef.current >= 1000) {
        setFps(frameCounterRef.current);
        frameCounterRef.current = 0;
        lastFpsTimeRef.current = time;
        setParticleCount(particles.length);
        setAmorCount(particles.filter((particle) => particle.type === "AMOR").length);
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
    () => Object.values(ARCHETYPES).map((archetype) => ({ color: archetype.color, name: archetype.name })),
    []
  );

  return (
    <main className="app">
      <canvas ref={canvasRef} className="simulation-canvas" />

      <div className="hud-layer">
        <section className="panel">
          <div className="title-row">
            <span className="pulse-dot" />
            <strong>Universe Game v1.2.1</strong>
          </div>
          <p className="dim">Particles: {particleCount} | Amor: {amorCount} | FPS: {fps}</p>
          <p className="dim">State: {paused ? "Paused" : "Running"} | Time: {timeScale.toFixed(timeScale >= 100 ? 0 : timeScale >= 10 ? 1 : 2)}x</p>
          <p className="dim">Ambient: {isMusicPlaying ? "Playing" : "Off"} (optional)</p>
          <div className="legend dim">
            {archetypeLegend.map((entry) => (
              <span key={entry.name}>
                <span className="chip" style={{ background: entry.color }} />
                {entry.name}
              </span>
            ))}
          </div>
          {showHelp ? (
            <p className="dim">Drag: pan • Scroll: zoom • Space: pause • R: reset • H: toggle help • Residual Frequencies: attraction, mutation, inspiration, avoidance</p>
          ) : null}
        </section>

        <div className="controls">
          <button type="button" onClick={() => setPaused((value) => !value)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={() => void toggleAmbientMusic()}>
            {isMusicPlaying ? "Pause Ambient" : "Play Ambient"}
          </button>
          <label className="time-control" htmlFor="time-scale">
            <span>Time Flow</span>
            <input
              id="time-scale"
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={sliderValue}
              onChange={(event) => setTimeScaleFromSlider(Number(event.currentTarget.value))}
            />
            <strong>{timeScale.toFixed(timeScale >= 100 ? 0 : timeScale >= 10 ? 1 : 2)}x</strong>
          </label>
          <button type="button" onClick={resetUniverse}>
            Big Bang Reset
          </button>
        </div>
      </div>
    </main>
  );
}

export default App;
