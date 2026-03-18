# DVD Architecture: Cast-Based Recording

## Overview

DVD is transitioning from direct frame capture to a cast-based intermediate representation. This separates **recording** (capturing terminal I/O) from **rendering** (generating SVG frames).

## Current Architecture (Before)

```
.cd script → CDExecutor → Shell spawn + inline frame capture → TerminalFrame[] → Animated SVG
```

**Problem**: Frame capture happens during shell execution, which misses output from fast/animated commands (like lolcat) because:
- Output arrives in chunks that may not align with frame capture timing
- ANSI sequences get partially processed
- No opportunity to replay/debug what was captured

## New Architecture (After)

```
.cd script → CDExecutor → TerminalRecorder → Recording (in-memory)
                                                   ↓
                                          RecordingPlayer → TerminalFrame[] → Animated SVG
```

**Benefits**:
- All terminal I/O is captured with precise timestamps
- Rendering happens from complete data
- Can debug exactly what output was received
- Future: import .cast files, save recordings

## Data Format

Uses asciinema v2 cast format internally:

```typescript
interface Recording {
  header: CastHeader;
  events: CastEvent[];
}

interface CastHeader {
  version: 2;
  width: number;
  height: number;
  // DVD-specific settings stored here
  dvd?: {
    theme: string;
    template: string;
    fontSize: number;
    // ... other settings
  };
}

interface CastEvent = [
  number,      // timestamp in seconds
  'o' | 'i',   // output or input
  string       // data
];
```

## Implementation Plan

### Phase 1: Recording Infrastructure

Create `src/recorder/` module:

```
src/recorder/
  index.ts              # Re-exports
  types.ts              # Recording, CastEvent, CastHeader
  terminal-recorder.ts  # Captures events during execution
  recording-player.ts   # Replays events to generate frames
```

### Phase 2: Integrate with Executor

1. **Modify shell.ts**: Stream ALL output to recorder (no inline processing)
2. **Modify typing.ts**: Record input events with timing
3. **Modify cd-executor.ts**:
   - Create recorder at start
   - Pass recorder to handlers
   - After execution, pass recording to player
   - Player generates TerminalFrame[]

### Phase 3: Player Implementation

The `RecordingPlayer`:
1. Creates a fresh vterminal grid
2. Replays events in order, feeding output to vterminal
3. Captures frames at appropriate intervals
4. Returns TerminalFrame[] compatible with existing animator

## Key Files to Modify

| File | Change |
|------|--------|
| `src/executor/cd-executor.ts` | Create recorder, use player for frames |
| `src/executor/handlers/shell.ts` | Stream output to recorder |
| `src/executor/handlers/typing.ts` | Record input events |
| `src/executor/frame-capture.ts` | Move to recording-player.ts |

## Why This Fixes Lolcat

Current issue: lolcat outputs `\x1b[38;5;83m▜\x1b[39m` (colored char + reset) for EACH character. The current inline capture misses characters because:

1. Shell output handler stores lines in `ctx.lines`
2. Frame capture happens on line count change
3. Fast output doesn't trigger enough captures

With recording:
1. ALL output bytes are recorded with timestamps
2. Player feeds complete output to vterminal
3. vterminal correctly parses all ANSI sequences
4. Frame capture happens after vterminal has full state

## Migration Strategy

1. Build recorder module (non-breaking)
2. Add recording to executor (output unchanged)
3. Add player that generates frames from recording
4. Switch to player-generated frames
5. Remove old inline capture code

## Testing

- All existing .cd examples must produce identical output
- New test: lolcat output with box-drawing characters
- Verify timing is preserved (animation speed)
