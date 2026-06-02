# Hyperframes Starter Project

Minimal Vite + Hyperframes starter used by generated projects.

## What Stays In The Starter

- `index.html`: local preview shell for the host editor controls
- `composition/index.html`: Hyperframes composition rendered to video
- `src/main.ts`: preview-player bridge for play, pause, seek, mute, and frame capture
- `src/styles/global.css`: native CSS only
- `hyperframes.json`: Hyperframes registry paths for blocks, components, and assets

## Commands

Node 22+ is required by the pinned Hyperframes CLI.

```bash
npm install
npm run dev
npm run build
npm run lint
npm run render
```

## Rules

- Use native HTML, CSS, SVG, and Hyperframes data attributes.
- Drive timeline animation with paused GSAP timelines registered on `window.__timelines`.
- Keep `data-composition-id="Main"` unless the host app is updated too.
- Do not expose segment markers from the starter; the host app controls playback through one continuous timeline.
- Do not add utility CSS frameworks, demo tooling, component-library demos, or generated lab assets to the starter.
- Keep the starter small; project-specific helpers should be created only when a generated video needs them.

## Hyperframes Contract

Timed elements need `class="clip"`, `data-start`, `data-duration`, and `data-track-index`.
The render command uses the Hyperframes CLI and writes to `renders/output.mp4`.
The starter pins Hyperframes packages and CLI usage to `0.6.65`; keep these in sync with the host app renderer.
