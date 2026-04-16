# Universe Game

Universe Game is a contemplative browser-based particle life simulation inspired by a symbolic Big Bang.  
Five archetypal particle forces interact in a large 2D space: `Pulse`, `Bloom`, `Echo`, `Void`, and `Amor` (Love).

This project explores emergence, tension, balance, and connection through motion and interaction rather than traditional win/lose gameplay.

## Version

- `v1.0.0` - Initial public release: Big Bang particle simulation with 5 fundamental forces, including Love.

## Features

- Real-time particle simulation in an expansive world
- Five archetypes with distinct tendencies and reactions
- Love (`Amor`) as a rare unifying force with strong attraction behavior
- Smooth camera pan and zoom for contemplative exploration
- Lightweight single-file web app (no build step required)

## Project Structure

- `index.html` - Main simulation app (UI + rendering + simulation logic)
- `Universe_Rules.md` - Narrative/spec rules for archetypes
- `Universe_Rules.csv` - Spreadsheet-friendly rules table
- `LICENSE` - MIT license

## How To Run

No installation required.

1. Open `index.html` directly in your browser  
   **or**
2. Serve the folder with a local static server and open it:

```bash
python3 -m http.server 8080
```

Then visit: [http://localhost:8080](http://localhost:8080)

## Controls

- `Drag` (mouse or one-finger touch): Move the camera
- `Scroll` wheel: Zoom in/out
- `Space`: Pause/resume simulation
- `R`: Trigger a fresh Big Bang reset
- `H`: Toggle help overlay

## Simulation Notes

- The simulation starts with a single Big Bang event near world center.
- Particle interactions are local and force-based.
- `Amor` particles strongly attract all archetypes and act as social/cohesive catalysts.
- Motion damping and soft world bounds keep the system stable enough for long observation.

## Best Practices For Contemplative Particle Simulations

- Prefer gentle gradients and low visual noise over aggressive effects
- Keep controls discoverable but minimal
- Favor emergent behavior over scripted outcomes
- Track frame rate and entity counts to preserve meditative flow
- Keep symbolic language clear: mechanics should reflect the intended philosophy

## Future Ideas

- Add configurable force sliders for each archetype interaction
- Add particle birth/death evolution rules from `Universe_Rules.md`
- Introduce bond visualization for long-term Love connections
- Add timeline recording/replay mode for pattern observation
- Add presets (Calm, Turbulent, Harmonic, Entropic)
- Add accessibility options (high contrast mode, reduced motion mode)
- Add deterministic seed support for reproducible universes

## License

This project is licensed under the MIT License. See `LICENSE` for details.
