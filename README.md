# MKRSHIFT-AD-Panel

A Vite + Three.js-powered digital signage tool for building animated ad panels with post-processing effects, layered design controls, and playlist-style playback.

## Features
- Three.js rendering pipeline with post-processing effects and color grading.
- Configurable presets for animation, halftone, and media pipelines.
- UI controls for playback, transitions, and visual tuning.
- Modular code structure for effects, sampling, and scene management.

## Getting Started

### Prerequisites
- Node.js 18+ (recommended)
- npm

### Setup
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

## Project Structure
- `src/` — core application code (scene setup, rendering, and UI logic).
- `src/postfx/` — post-processing pipeline utilities (effects, compositing, and tuning).
- `src/shaders.js` — shader definitions shared by the rendering pipeline.
- `src/styles.css` — app styling.

## Roadmap
See `Instructions.txt` for the current development roadmap and implementation notes.

## License
See `LICENSE` for details.
