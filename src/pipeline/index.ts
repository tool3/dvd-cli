/**
 * Pipeline Orchestration
 *
 * Main entry point for the new DVD rendering pipeline.
 * Coordinates all 7 stages: Lexer → Parser → Executor → Optimizer → VTerminal → Coalescer → SVG Emitter
 */

import type { GridState, SpanRow, Frame, Theme, EmitterOptions, CursorPosition } from '../types';
import { createGridState, processInput, applyCommand } from './vterminal';
import { coalesce, getCoalesceStats } from './coalescer';
import { emit, emitAnimated, type FrameData, type AnimatedSVGOptions, type EmitResult } from './svg-emitter';
import { PersistentShell, executeCommandStreaming, type CommandResult, type OutputChunk } from '../shell/persistent-shell';

// Re-export commonly used types and functions
export * from '../types';
export * from './vterminal';
export * from './coalescer';
export * from './svg-emitter';
export * from '../shell/persistent-shell';

// ============================================================================
// High-Level Pipeline API
// ============================================================================

export interface RenderOptions {
  width: number;
  height: number;
  fontSize: number;
  theme: Theme;
  template?: 'macos' | 'windows' | 'minimal';
  title?: string;
  watermark?: string;
  embedFont?: boolean;
  fontData?: string;
  // Callbacks
  onFrame?: (frame: FrameData, index: number) => void;
  onProgress?: (current: number, total: number, description?: string) => void;
}

/**
 * Render a static terminal state to SVG
 */
export function renderStatic(input: string, options: RenderOptions): EmitResult {
  // Create terminal grid
  const termWidth = Math.floor(options.width / (options.fontSize * 0.6));
  const termHeight = Math.floor(options.height / (options.fontSize * 1.4));
  let state = createGridState(termWidth, termHeight);

  // Process input through VTerminal
  state = processInput(state, input);

  // Coalesce cells into spans
  const rows = coalesce(state, options.theme);

  // Log stats in development
  if (process.env.DEBUG) {
    const stats = getCoalesceStats(state, rows);
    console.log(`Coalesce: ${stats.cellCount} cells → ${stats.spanCount} spans (${stats.reduction}% reduction)`);
  }

  // Emit SVG
  return emit(
    rows,
    state.cursor,
    true,
    createEmitterOptions(options)
  );
}

/**
 * Render multiple frames to animated SVG
 */
export function renderAnimated(frames: FrameData[], options: RenderOptions & { fps?: number; loop?: boolean }): EmitResult {
  return emitAnimated(frames, {
    ...createEmitterOptions(options),
    fps: options.fps,
    loop: options.loop,
  });
}

// ============================================================================
// Frame Capture
// ============================================================================

export interface CaptureOptions {
  width: number;
  height: number;
  fontSize: number;
  theme: Theme;
}

/**
 * Create a frame capturer for building animations
 */
export function createFrameCapturer(options: CaptureOptions) {
  const termWidth = Math.floor(options.width / (options.fontSize * 0.6));
  const termHeight = Math.floor(options.height / (options.fontSize * 1.4));
  let state = createGridState(termWidth, termHeight);
  const frames: FrameData[] = [];
  const startTime = Date.now();

  return {
    /**
     * Get current grid state
     */
    getState(): GridState {
      return state;
    },

    /**
     * Process input and update state
     */
    write(input: string): void {
      state = processInput(state, input);
    },

    /**
     * Capture current state as a frame
     */
    capture(cursorVisible: boolean = true): void {
      const rows = coalesce(state, options.theme);
      frames.push({
        rows,
        cursor: { ...state.cursor },
        cursorVisible,
        timestamp: Date.now() - startTime,
      });
    },

    /**
     * Get all captured frames
     */
    getFrames(): FrameData[] {
      return frames;
    },

    /**
     * Reset state to initial
     */
    reset(): void {
      state = createGridState(termWidth, termHeight);
      frames.length = 0;
    },
  };
}

// ============================================================================
// Typing Simulation
// ============================================================================

export interface TypeOptions {
  speed?: number; // ms per character
  variance?: number; // random variance in timing
}

/**
 * Simulate typing with realistic timing
 */
export async function* simulateTyping(
  text: string,
  options: TypeOptions = {}
): AsyncGenerator<{ char: string; delay: number }> {
  const speed = options.speed ?? 50;
  const variance = options.variance ?? 20;

  for (const char of text) {
    const delay = speed + (Math.random() - 0.5) * variance * 2;
    yield { char, delay: Math.max(10, delay) };
  }
}

// ============================================================================
// Command Execution with Frame Capture
// ============================================================================

export interface ExecuteAndCaptureOptions extends CaptureOptions {
  frameInterval?: number; // ms between frame captures during output
  shell?: PersistentShell;
}

/**
 * Execute a command and capture frames of the output
 */
export async function executeAndCapture(
  command: string,
  capturer: ReturnType<typeof createFrameCapturer>,
  options: ExecuteAndCaptureOptions
): Promise<CommandResult> {
  const frameInterval = options.frameInterval ?? 100;
  let lastFrameTime = Date.now();

  const result = await executeCommandStreaming(
    command,
    (chunk: OutputChunk) => {
      // Write chunk to terminal
      capturer.write(chunk.data.toString());

      // Capture frame if enough time has passed
      const now = Date.now();
      if (now - lastFrameTime >= frameInterval) {
        capturer.capture(false); // Hide cursor during output
        lastFrameTime = now;
      }
    },
    {
      width: Math.floor(options.width / (options.fontSize * 0.6)),
      height: Math.floor(options.height / (options.fontSize * 1.4)),
    }
  );

  // Capture final frame with output complete
  capturer.capture(true);

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

function createEmitterOptions(options: RenderOptions): EmitterOptions {
  return {
    theme: options.theme,
    template: options.template ?? 'minimal',
    width: options.width,
    height: options.height,
    fontSize: options.fontSize,
    title: options.title,
    watermark: options.watermark,
    embedFont: options.embedFont,
    fontData: options.fontData,
  };
}

// ============================================================================
// Default Themes
// ============================================================================

export const themes = {
  dracula: {
    name: 'dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },

  nord: {
    name: 'nord',
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    selection: '#434c5e',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  },

  monokai: {
    name: 'monokai',
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selection: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#f4bf75',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
    brightBlack: '#75715e',
    brightRed: '#f92672',
    brightGreen: '#a6e22e',
    brightYellow: '#f4bf75',
    brightBlue: '#66d9ef',
    brightMagenta: '#ae81ff',
    brightCyan: '#a1efe4',
    brightWhite: '#f9f8f5',
  },

  oneDark: {
    name: 'oneDark',
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    selection: '#3e4451',
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  },

  catppuccinMocha: {
    name: 'catppuccinMocha',
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selection: '#45475a',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },

  tokyoNight: {
    name: 'tokyoNight',
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    selection: '#33467c',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5',
  },
} as const;
