/**
 * Core types for the DVD pipeline
 * These types are shared across all pipeline stages
 */

// ============================================================================
// Color Types
// ============================================================================

/**
 * Color representation supporting multiple ANSI color modes
 */
export type Color =
  | { mode: 'default' }
  | { mode: 'ansi16'; value: number }
  | { mode: 'ansi256'; value: number }
  | { mode: 'rgb'; value: [number, number, number] };

export const DEFAULT_FG: Color = { mode: 'default' };
export const DEFAULT_BG: Color = { mode: 'default' };

// ============================================================================
// Cell Types
// ============================================================================

/**
 * Text attributes (style properties without character)
 */
export interface CellAttributes {
  fg: Color;
  bg: Color;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  strikethrough: boolean;
}

export const DEFAULT_ATTRIBUTES: Readonly<CellAttributes> = Object.freeze({
  fg: DEFAULT_FG,
  bg: DEFAULT_BG,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strikethrough: false,
});

/**
 * A single character cell in the terminal grid
 */
export interface Cell {
  char: string;
  width: 1 | 2;
  fg: Color;
  bg: Color;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  strikethrough: boolean;
}

export const DEFAULT_CELL: Readonly<Cell> = Object.freeze({
  char: ' ',
  width: 1,
  fg: DEFAULT_FG,
  bg: DEFAULT_BG,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strikethrough: false,
});

// ============================================================================
// Cursor & Grid State
// ============================================================================

export interface CursorPosition {
  row: number;
  col: number;
}

export interface SavedCursorState {
  position: CursorPosition;
  attributes: CellAttributes;
}

/**
 * Complete terminal grid state - the core data structure for VTerminal
 */
export interface GridState {
  cells: Cell[][];
  cursor: CursorPosition;
  width: number;
  height: number;
  scrollback: Cell[][];
  attributes: CellAttributes;
  savedCursor: SavedCursorState | null;
  autoWrap: boolean;
  wrapPending: boolean;
}

// ============================================================================
// VTerminal Command Types
// ============================================================================

export type VTerminalCommand =
  // Text output
  | { type: 'print'; char: string; width: 1 | 2 }

  // Control characters
  | { type: 'newline' }
  | { type: 'carriageReturn' }
  | { type: 'tab' }
  | { type: 'backspace' }
  | { type: 'bell' }

  // Cursor movement
  | { type: 'cursorUp'; count: number }
  | { type: 'cursorDown'; count: number }
  | { type: 'cursorForward'; count: number }
  | { type: 'cursorBack'; count: number }
  | { type: 'cursorPosition'; row: number; col: number }
  | { type: 'cursorColumn'; col: number }
  | { type: 'cursorNextLine'; count: number }
  | { type: 'cursorPrevLine'; count: number }

  // Cursor save/restore
  | { type: 'saveCursor' }
  | { type: 'restoreCursor' }

  // Erase operations
  | { type: 'eraseInDisplay'; mode: 0 | 1 | 2 | 3 }
  | { type: 'eraseInLine'; mode: 0 | 1 | 2 }

  // SGR (Select Graphic Rendition)
  | { type: 'sgr'; params: number[] }

  // Scroll operations
  | { type: 'scrollUp'; count: number }
  | { type: 'scrollDown'; count: number }

  // Mode changes
  | { type: 'setAutoWrap'; enabled: boolean }

  // No-op for unrecognized sequences
  | { type: 'noop' };

// ============================================================================
// Span Types (Coalescer output)
// ============================================================================

/**
 * Resolved cell style with colors converted to strings
 */
export interface CellStyle {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
  strikethrough: boolean;
}

/**
 * A span is a run of consecutive cells with identical style
 */
export interface Span {
  text: string;
  style: CellStyle;
  col: number;
  row: number;
}

export type SpanRow = Span[];

// ============================================================================
// Frame Types
// ============================================================================

export interface Frame {
  timestamp: number;
  grid: GridState;
  cursorVisible: boolean;
  cursorActive: boolean;
}

// ============================================================================
// Theme Types (compatible with shellfie)
// ============================================================================

export interface Theme {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  selection?: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// ============================================================================
// Emitter Options
// ============================================================================

export interface EmitterOptions {
  theme: Theme;
  template: 'macos' | 'windows' | 'minimal';
  width: number;
  height: number;
  fontSize: number;
  lineHeight?: number;
  charWidth?: number;
  padding?: number;
  title?: string;
  watermark?: string;
  embedFont?: boolean;
  fontData?: string;
  fontFamily?: string;
  headerBackground?: string;
  footerBackground?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  cursorBlink?: boolean;
  activeCursor?: boolean;
  selection?: { start: number; end: number; row: number } | null;
  // Header/Footer config (shellfie 2.0 style)
  headerHeight?: number;
  headerBorder?: boolean;
  headerBorderColor?: string;
  headerBorderWidth?: number;
  footerHeight?: number;
  footerBorder?: boolean;
  footerBorderColor?: string;
  footerBorderWidth?: number;
  // Cursor config
  cursorStyle?: 'block' | 'bar' | 'underline';
  cursorColor?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a cell with given attributes
 */
export function createCell(char: string, width: 1 | 2, attrs: CellAttributes): Cell {
  return {
    char,
    width,
    fg: attrs.fg,
    bg: attrs.bg,
    bold: attrs.bold,
    dim: attrs.dim,
    italic: attrs.italic,
    underline: attrs.underline,
    inverse: attrs.inverse,
    strikethrough: attrs.strikethrough,
  };
}

/**
 * Check if two colors are equal
 */
export function colorsEqual(a: Color, b: Color): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'default') return true;
  if (a.mode === 'rgb' && b.mode === 'rgb') {
    return a.value[0] === b.value[0] && a.value[1] === b.value[1] && a.value[2] === b.value[2];
  }
  if ((a.mode === 'ansi16' || a.mode === 'ansi256') && (b.mode === 'ansi16' || b.mode === 'ansi256')) {
    return (a as { value: number }).value === (b as { value: number }).value;
  }
  return false;
}

/**
 * Check if two cell styles are equal (for coalescing)
 */
export function stylesEqual(a: CellStyle, b: CellStyle): boolean {
  return (
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.dim === b.dim &&
    a.strikethrough === b.strikethrough
  );
}

/**
 * Check if two cell attributes are equal
 */
export function attributesEqual(a: CellAttributes, b: CellAttributes): boolean {
  return (
    colorsEqual(a.fg, b.fg) &&
    colorsEqual(a.bg, b.bg) &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.strikethrough === b.strikethrough
  );
}
