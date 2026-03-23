# DVD Phase 2: Core Library + Web App

## Overview

Extract DVD's pure-computation core into a browser-compatible library (`dvd`), rename this repo to `dvd-cli`, and build a web app for .cast → SVG conversion with live theming and browser-based .cd execution.

## Architecture

```
dvd (new repo — the library)
├── src/
│   ├── pipeline/          # vterminal, coalescer, svg-emitter/*
│   ├── animator/          # svg-animator, svg-optimizer
│   ├── recorder/          # cast-parser, recording-player, types
│   ├── parser/            # cd-parser
│   ├── types/             # All shared types
│   └── utils/             # wcwidth, etc.
├── package.json           # Zero Node.js deps, ESM + CJS
└── tsconfig.json

dvd-cli (this repo, renamed)
├── src/
│   ├── commands/          # pipe, render, render-cast, new, validate
│   ├── executor/          # cd-executor, handlers (shell, typing, etc.)
│   ├── shell/             # persistent-shell
│   └── cli.ts             # yargs entry point
├── package.json           # depends on dvd + node:fs, node:child_process
└── tsconfig.json

dvd-web (new repo — the webapp)
├── src/
│   ├── cast-converter/    # Upload .cast → preview → theme picker → download SVG
│   ├── cd-runner/         # xterm.js terminal + .cd playback → frame capture → SVG
│   ├── theme-editor/      # Real-time theme customization with live preview
│   └── components/        # Shared UI
├── package.json           # depends on dvd + xterm.js
└── tsconfig.json
```

## Browser-Compatible Modules (already pure TypeScript)

These modules have **zero Node.js dependencies** and can move to `dvd` as-is:

| Module | Description | Lines |
|--------|-------------|-------|
| `src/pipeline/vterminal.ts` | ANSI parser + terminal grid state machine | ~540 |
| `src/pipeline/coalescer.ts` | Grid cells → styled text spans | ~200 |
| `src/pipeline/svg-emitter/*` | All SVG generation (filmstrip, animated, text, cursor, chrome) | ~1200 |
| `src/pipeline/customGlyphs.ts` | Box-drawing & block element rendering | ~450 |
| `src/animator/svg-animator.ts` | Animation sequencing, loop styles | ~675 |
| `src/animator/svg-optimizer.ts` | SVG minification | ~107 |
| `src/recorder/cast-parser.ts` | Asciinema v1/v2/v3 parser (pure JSON/NDJSON) | ~150 |
| `src/recorder/recording-player.ts` | Event replay → frame generation | ~200 |
| `src/recorder/types.ts` | Recording types | ~50 |
| `src/parser/cd-parser.ts` | .cd script parser | ~300 |
| `src/types/index.ts` | Core types (Color, Cell, GridState, Theme, etc.) | ~200 |
| `src/utils/wcwidth.ts` | East Asian character width | ~100 |

## Node.js-Only Modules (stay in dvd-cli)

| Module | Why Node.js required |
|--------|---------------------|
| `src/executor/cd-executor.ts` | Orchestrates shell command execution |
| `src/executor/handlers/shell.ts` | `child_process.spawn` |
| `src/shell/persistent-shell.ts` | Long-lived shell process |
| `src/commands/*` | File I/O (`node:fs`), stdin (`process.stdin`) |

## dvd Library Public API

```typescript
// === Cast file → SVG (primary browser workflow) ===
import { parseCastFile, RecordingPlayer, createFilmstripSVG, themes } from 'dvd';

const recording = parseCastFile(castFileContent);
const player = new RecordingPlayer(recording);
const frames = player.generateFrames({ theme: themes.dark, width: 80, height: 24 });
const svg = createFilmstripSVG({ frameData: frames, theme: themes.dark, ... });

// === Direct ANSI input → SVG (for xterm.js integration) ===
import { createGridState, processInput, coalesce, emit } from 'dvd';

let grid = createGridState(80, 24);
grid = processInput(grid, ansiContent);
const rows = coalesce(grid, themes.dark);
const { svg } = emit(rows, cursor, true, options);

// === Theme management ===
import { themes, type Theme } from 'dvd';
const myTheme: Theme = { ...themes.dark, background: '#000', foreground: '#fff' };
```

## Web App Features (dvd-web)

### 1. Cast Converter
- Drag & drop .cast file upload
- Instant preview using dvd's pipeline
- Theme picker (all shellfie/pipeline themes)
- Customizable: font size, line height, padding, border radius, watermark
- Loop style selector (loop, reverse, rewind, fade)
- Download as .svg

### 2. CD Runner (xterm.js)
- Browser-based terminal emulator via xterm.js
- Parse .cd scripts with dvd's `cd-parser`
- Play commands into xterm.js (Type, Key, Sleep, etc.)
- Capture terminal state at each frame
- Feed through dvd pipeline → SVG
- No real shell needed — xterm.js handles terminal emulation

### 3. Theme Editor
- Visual theme builder
- Real-time preview with sample terminal content
- Export theme as JSON
- Apply to any .cast conversion

## Migration Strategy

1. Create `dvd` repo with pure modules (copy, not move — keep dvd-cli working)
2. Publish `dvd` to npm
3. Update `dvd-cli` to `import from 'dvd'` instead of local paths
4. Build `dvd-web` using `dvd` library
5. Rename this repo to `dvd-cli`

## Immediate Action: --smil Flag

Before Phase 2, add `--smil` / `-S` flag to dvd-cli:
- **With flag**: Routes through `emit()` + `createAnimatedSVG()` (master's proven 60fps mobile path, larger files)
- **Without flag**: Uses current filmstrip (symbols + SMIL, smaller files)
- Files to change: `src/cli.ts`, `src/commands/pipe.ts`, `src/commands/render-cast.ts`
