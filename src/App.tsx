import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WORLD_SIZE = 6000;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 3.5;

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
  radius: number;
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
  const [fps, setFps] = useState(0);
  const [particleCount, setParticleCount] = useState(0);
  const [amorCount, setAmorCount] = useState(0);

  const particlesRef = useRef<Particle[]>([]);
  const cameraRef = useRef<Camera>({
    x: WORLD_SIZE / 2,
    y: WORLD_SIZE / 2,
    zoom: 0.8
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
  const mountedRef = useRef(true);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const resetUniverse = useCallback(() => {
    const particles = createBigBangParticles();
    particlesRef.current = particles;
    setParticleCount(particles.length);
    setAmorCount(particles.filter((particle) => particle.type === "AMOR").length);
    setPaused(false);
  }, []);

  useEffect(() => {
    resetUniverse();
  }, [resetUniverse]);

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
      const camera = cameraRef.current;

      ctx.fillStyle = "rgba(10, 10, 31, 0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!pausedRef.current) {
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

          particle.vx = particle.vx * 0.96 + ax;
          particle.vy = particle.vy * 0.96 + ay;
          particle.x += particle.vx;
          particle.y += particle.vy;

          if (particle.x < 100) {
            particle.vx += 0.4;
          }
          if (particle.x > WORLD_SIZE - 100) {
            particle.vx -= 0.4;
          }
          if (particle.y < 100) {
            particle.vy += 0.4;
          }
          if (particle.y > WORLD_SIZE - 100) {
            particle.vy -= 0.4;
          }

          if (Math.random() < 0.02) {
            particle.love = Math.max(0, particle.love - 0.3);
          }
        }
      }

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

      <section className="panel">
        <div className="title-row">
          <span className="pulse-dot" />
          <strong>Universe Game v1.1.0</strong>
        </div>
        <p className="dim">Particles: {particleCount} | Amor: {amorCount} | FPS: {fps}</p>
        <p className="dim">State: {paused ? "Paused" : "Running"}</p>
        <div className="legend dim">
          {archetypeLegend.map((entry) => (
            <span key={entry.name}>
              <span className="chip" style={{ background: entry.color }} />
              {entry.name}
            </span>
          ))}
        </div>
        {showHelp ? (
          <p className="dim">Drag: pan • Scroll: zoom • Space: pause • R: reset • H: toggle help</p>
        ) : null}
      </section>

      <div className="controls">
        <button type="button" onClick={() => setPaused((value) => !value)}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={resetUniverse}>
          Big Bang Reset
        </button>
      </div>
    </main>
  );
}

export default App;
