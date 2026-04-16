# Universe Game

Universe Game is a contemplative particle simulation inspired by a symbolic Big Bang.  
The simulation runs in a React + TypeScript app powered by Vite and is ready for Vercel deployment.

## Version

- `v1.2.1` - Fixed static HUD overlay independent of camera zoom and added optional contemplative ambient music play/pause control.
- `v1.2.0` - Wide zoom-out universe view, contemplative time controls (0.1x-1000x), and Residual Frequencies with fading reactive trails.
- `v1.1.0` - Converted from a single-file app to a production-ready Vite + React + TypeScript project.

## Features

- Real-time 2D particle simulation with Big Bang reset
- Five archetypes: `Pulse`, `Bloom`, `Echo`, `Void`, `Amor`
- `Amor` behavior preserved as a unifying force with attraction-driven interactions
- Residual Frequencies trail system with subtle visual echoes carrying Love, Chaos, Order, and Energy
- Frequency-driven reactions: attraction, mutation, inspiration, and avoidance
- Time Flow controls: pause/resume + slider from `0.1x` to `1000x`
- Mouse camera controls: drag to pan, wheel to zoom
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

- `Drag` (mouse): Move camera
- `Scroll` wheel: Zoom in/out
- `Space`: Pause/resume simulation
- `Time Flow` slider: adjust simulation speed from `0.1x` to `1000x`
- `R`: Trigger a fresh Big Bang reset
- `H`: Toggle help text

## License

This project is licensed under the MIT License. See `LICENSE` for details.
