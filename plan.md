# Plan: dvd Lib High-Level API & CLI Deduplication

## Context

The dvd project has two packages:
- **dvd** (lib) — exports low-level primitives (vterminal, coalescer, SVG emitter, recorder)
- **dvd-cli** — a CLI that bundles its own copy of all those primitives + the executor/orchestration layer

Two problems:
1. **No high-level API** — library consumers can't create animated SVGs from steps without reimplementing the entire executor pipeline
2. **Full duplication** — dvd-cli does NOT import from dvd at all; it has its own copies of pipeline, animator, recorder, types, and parser

The goal: move orchestration into the lib, expose a clean high-level API, and make the CLI a thin consumer.

---

## Proposed High-Level API

```typescript
import { dvd, parseCDScript } from 'dvd';

// From programmatic steps
const result = await dvd({
  steps: [
    { type: 'Type', text: 'echo hello world' },
    { type: 'Enter' },
    { type: 'Sleep', duration: 500 },
  ],
  theme: 'dracula',
  template: 'macos',
  title: 'Demo',
  optimize: true,
});
// result.svg — the animated SVG string

// From a .cd script string
const result = await dvd({
  cdScript: `
    Set Theme dracula
    Type "echo hello"
    Enter
    Sleep 500ms
  `,
});

// From a .cast recording
const result = await dvd({ castContent: '...' });
```

### API Types

```typescript
interface DVDOptions {
  // Input (pick one)
  steps?: CDCommand[];        // programmatic steps
  script?: CDScript;          // pre-parsed script
  cdScript?: string;          // raw .cd script string
  castContent?: string;       // .cast file content

  // Styling
  theme?: string;
  template?: 'macos' | 'windows' | 'minimal';
  title?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  fontFamily?: string;
  padding?: number;
  // ... all existing CDExecutorOptions fields

  // Animation
  fps?: number;
  loopStyle?: 'loop' | 'reverse' | 'rewind' | 'fade';
  loopPause?: number;
  pauseAtEnd?: number;
  fadeDuration?: number;
  rewindSpeed?: number;
  playbackSpeed?: number;

  // Output
  optimize?: boolean;
  filmstrip?: boolean;       // default true; false = legacy mode
  customGlyphs?: boolean;

  // Callbacks
  onProgress?: (current: number, total: number, desc: string) => void;
  onFrame?: (frame: TerminalFrame) => void;
}

interface DVDResult {
  svg: string;
  frames: TerminalFrame[];
  metadata: { duration: number; frameCount: number };
}
```

---

## Implementation Phases

### Phase 1: Move Executor into dvd Lib

Create `src/executor/` in the dvd lib by moving these files from dvd-cli:

| dvd-cli source | dvd lib destination |
|---|---|
| `src/executor/cd-executor.ts` | `src/executor/cd-executor.ts` |
| `src/executor/types.ts` | `src/executor/types.ts` |
| `src/executor/frame-capture.ts` | `src/executor/frame-capture.ts` |
| `src/executor/settings.ts` | `src/executor/settings.ts` |
| `src/executor/handlers/index.ts` | `src/executor/handlers/index.ts` |
| `src/executor/handlers/shell.ts` | `src/executor/handlers/shell.ts` |
| `src/executor/handlers/typing.ts` | `src/executor/handlers/typing.ts` |
| `src/executor/handlers/navigation.ts` | `src/executor/handlers/navigation.ts` |
| `src/executor/handlers/screenshot.ts` | `src/executor/handlers/screenshot.ts` |

**Not moved** — stays in dvd-cli:
- `src/executor/handlers/shell-recorder.ts` — CLI-specific shell recording feature

Update all internal import paths to match the dvd lib structure.

### Phase 2: Create High-Level API

Create `src/api.ts` in dvd lib:
- Implements the `dvd()` function
- Logic extracted from dvd-cli's `src/commands/render.ts`:
  1. Determine input mode (steps → CDScript, cdScript → parse, castContent → parse cast)
  2. Create `CDExecutor` with options
  3. Execute → TerminalFrame[]
  4. Generate animated SVG (`createFilmstripSVG` or `createAnimatedSVG`)
  5. Optionally optimize
  6. Return `DVDResult`

### Phase 3: Update dvd Lib Exports

Add to `src/index.ts`:
```typescript
// High-level API
export { dvd } from './api';
export type { DVDOptions, DVDResult } from './api';

// Executor (for advanced users)
export { CDExecutor } from './executor/cd-executor';
export type { CDExecutorOptions, ExecutorContext, TerminalFrame } from './executor/types';
```

### Phase 4: Refactor dvd-cli to Use dvd Lib

**Delete from dvd-cli** (all duplicated):
- `src/pipeline/`
- `src/types/`
- `src/animator/`
- `src/recorder/`
- `src/parser/`
- `src/executor/` (except `handlers/shell-recorder.ts`)
- `src/utils/wcwidth.ts`

**Refactor commands to use the lib:**

`src/commands/render.ts` becomes a thin wrapper:
```typescript
import { dvd } from 'dvd';

const result = await dvd({
  cdScript: readFileSync(file, 'utf-8'),
  ...cliOptionsToApiOptions(args),
  onProgress: (cur, total, desc) => spinner.update(desc),
});
writeFileSync(outputPath, result.svg);
```

Similar thin wrappers for `render-cast.ts` and `pipe.ts`.

**What stays in dvd-cli:**
- `src/cli.ts` — yargs argument parsing
- `src/commands/*.ts` — thin wrappers (read input, call `dvd()`, write output, show spinner)
- `src/executor/handlers/shell-recorder.ts` — CLI shell recording
- `src/utils/spinner.ts` — CLI progress indicator

### Phase 5: Wire Up Dependency

- Add `dvd` to dvd-cli's `package.json` dependencies
- Ensure both packages use the same `shellfie` version
- Update `tsconfig.json` if needed

---

## Edge Cases

1. **Animation options from script vs API** — Script `Set LoopStyle fade` should be defaults; explicit API options override them.
2. **Shell spawning** — The lib spawns real shell processes when executing `Enter` commands. This is expected behavior. Document clearly.
3. **Screenshot handler** — Writes files to disk. Keep as-is since it's an explicit user action.
4. **`onProgress` callback** — Already in CDExecutorOptions, passes through naturally so CLI can still show its spinner.

---

## Verification

1. Run all existing `.cd` examples through dvd-cli — output SVGs must be identical
2. Write a script that uses `dvd()` with programmatic steps — verify valid SVG output
3. Verify `dvd render` still works for `.cast` files
4. Both packages compile with no type errors
5. Verify dvd-cli no longer contains duplicated source files

---

## Critical Files

| File | Role |
|---|---|
| `/dvd/src/index.ts` | Update exports |
| `/dvd/src/api.ts` | NEW — high-level `dvd()` function |
| `/dvd-cli/src/executor/cd-executor.ts` | Move to lib |
| `/dvd-cli/src/commands/render.ts` | Template for `dvd()` logic; then refactor to call it |
| `/dvd-cli/package.json` | Add dvd dependency |
