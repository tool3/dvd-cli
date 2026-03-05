/**
 * VTerminal - Pure function terminal state machine
 * The core component of the DVD pipeline
 *
 * All functions are pure: (state, input) => newState
 */

import type {
  Cell,
  GridState,
  CellAttributes,
  CursorPosition,
  VTerminalCommand,
  Color,
} from '../types';
import {
  DEFAULT_CELL,
  DEFAULT_ATTRIBUTES,
  DEFAULT_FG,
  DEFAULT_BG,
  createCell,
} from '../types';
import { getCharWidth } from '../utils/wcwidth';

const MAX_SCROLLBACK = 1000;
const TAB_WIDTH = 8;

// ============================================================================
// State Creation
// ============================================================================

/**
 * Create initial terminal state
 */
export function createGridState(width: number, height: number): GridState {
  const cells: Cell[][] = [];
  for (let row = 0; row < height; row++) {
    cells.push(createEmptyRow(width));
  }

  return {
    cells,
    cursor: { row: 0, col: 0 },
    width,
    height,
    scrollback: [],
    attributes: { ...DEFAULT_ATTRIBUTES },
    savedCursor: null,
    autoWrap: true,
    wrapPending: false,
  };
}

// ============================================================================
// Core State Machine
// ============================================================================

/**
 * Apply a single command to the terminal state
 * Pure function: (state, command) => newState
 */
export function applyCommand(state: GridState, command: VTerminalCommand): GridState {
  switch (command.type) {
    case 'print':
      return handlePrint(state, command.char, command.width);
    case 'newline':
      return handleNewline(state);
    case 'carriageReturn':
      return handleCarriageReturn(state);
    case 'tab':
      return handleTab(state);
    case 'backspace':
      return handleBackspace(state);
    case 'bell':
      return state; // No visual effect
    case 'cursorUp':
      return handleCursorUp(state, command.count);
    case 'cursorDown':
      return handleCursorDown(state, command.count);
    case 'cursorForward':
      return handleCursorForward(state, command.count);
    case 'cursorBack':
      return handleCursorBack(state, command.count);
    case 'cursorPosition':
      return handleCursorPosition(state, command.row, command.col);
    case 'cursorColumn':
      return handleCursorColumn(state, command.col);
    case 'cursorNextLine':
      return handleCursorNextLine(state, command.count);
    case 'cursorPrevLine':
      return handleCursorPrevLine(state, command.count);
    case 'saveCursor':
      return handleSaveCursor(state);
    case 'restoreCursor':
      return handleRestoreCursor(state);
    case 'eraseInDisplay':
      return handleEraseInDisplay(state, command.mode);
    case 'eraseInLine':
      return handleEraseInLine(state, command.mode);
    case 'sgr':
      return handleSGR(state, command.params);
    case 'scrollUp':
      return handleScrollUp(state, command.count);
    case 'scrollDown':
      return handleScrollDown(state, command.count);
    case 'setAutoWrap':
      return { ...state, autoWrap: command.enabled };
    case 'noop':
      return state;
    default:
      return state;
  }
}

/**
 * Apply multiple commands in sequence
 */
export function applyCommands(state: GridState, commands: VTerminalCommand[]): GridState {
  return commands.reduce(applyCommand, state);
}

/**
 * Process raw input string through tokenizer and state machine
 */
export function processInput(state: GridState, input: string): GridState {
  const commands = parseInput(input);
  return applyCommands(state, commands);
}

// ============================================================================
// Helper Functions
// ============================================================================

function createEmptyRow(width: number): Cell[] {
  return Array.from({ length: width }, () => ({ ...DEFAULT_CELL }));
}

function cloneRow(row: readonly Cell[]): Cell[] {
  return row.map((cell) => ({ ...cell }));
}

function cloneCells(cells: readonly (readonly Cell[])[]): Cell[][] {
  return cells.map(cloneRow);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Print Handler
// ============================================================================

function handlePrint(state: GridState, char: string, width: 1 | 2): GridState {
  let newState = state;

  // Handle pending wrap from previous character at end of line
  if (state.wrapPending && state.autoWrap) {
    newState = handleNewline({ ...state, wrapPending: false });
  }

  const { cursor, cells, attributes, width: termWidth, height } = newState;

  // Bounds check
  if (cursor.row < 0 || cursor.row >= height) {
    return newState;
  }

  // If wide char doesn't fit at end of line, wrap first
  if (width === 2 && cursor.col === termWidth - 1 && newState.autoWrap) {
    // Mark last cell as spacer and wrap
    const spacerCells = cloneCells(cells);
    spacerCells[cursor.row][cursor.col] = { ...DEFAULT_CELL };
    newState = handleNewline({ ...newState, cells: spacerCells, wrapPending: false });
  }

  // Clone cells for immutability
  const newCells = cloneCells(newState.cells);
  const row = newState.cursor.row;
  const col = newState.cursor.col;

  // Create cell with current attributes
  const cell = createCell(char, width, attributes);
  newCells[row][col] = cell;

  // For wide characters, write a spacer in the next cell
  if (width === 2 && col + 1 < termWidth) {
    newCells[row][col + 1] = {
      ...DEFAULT_CELL,
      char: '',
      width: 1,
    };
  }

  // Calculate new cursor position
  let newCol = col + width;
  let wrapPending = false;

  // Check if we've reached or exceeded the edge
  if (newCol >= termWidth) {
    if (newState.autoWrap) {
      newCol = termWidth - 1;
      wrapPending = true;
    } else {
      newCol = termWidth - 1;
    }
  }

  return {
    ...newState,
    cells: newCells,
    cursor: { row, col: newCol },
    wrapPending,
  };
}

// ============================================================================
// Cursor Movement Handlers
// ============================================================================

function handleCursorUp(state: GridState, count: number): GridState {
  return {
    ...state,
    cursor: {
      row: Math.max(0, state.cursor.row - count),
      col: state.cursor.col,
    },
    wrapPending: false,
  };
}

function handleCursorDown(state: GridState, count: number): GridState {
  return {
    ...state,
    cursor: {
      row: Math.min(state.height - 1, state.cursor.row + count),
      col: state.cursor.col,
    },
    wrapPending: false,
  };
}

function handleCursorForward(state: GridState, count: number): GridState {
  return {
    ...state,
    cursor: {
      row: state.cursor.row,
      col: Math.min(state.width - 1, state.cursor.col + count),
    },
    wrapPending: false,
  };
}

function handleCursorBack(state: GridState, count: number): GridState {
  return {
    ...state,
    cursor: {
      row: state.cursor.row,
      col: Math.max(0, state.cursor.col - count),
    },
    wrapPending: false,
  };
}

function handleCursorPosition(state: GridState, row: number, col: number): GridState {
  return {
    ...state,
    cursor: {
      row: clamp(row, 0, state.height - 1),
      col: clamp(col, 0, state.width - 1),
    },
    wrapPending: false,
  };
}

function handleCursorColumn(state: GridState, col: number): GridState {
  return {
    ...state,
    cursor: {
      row: state.cursor.row,
      col: clamp(col, 0, state.width - 1),
    },
    wrapPending: false,
  };
}

function handleCursorNextLine(state: GridState, count: number): GridState {
  return {
    ...state,
    cursor: {
      row: Math.min(state.height - 1, state.cursor.row + count),
      col: 0,
    },
    wrapPending: false,
  };
}

function handleCursorPrevLine(state: GridState, count: number): GridState {
  return {
    ...state,
    cursor: {
      row: Math.max(0, state.cursor.row - count),
      col: 0,
    },
    wrapPending: false,
  };
}

function handleCarriageReturn(state: GridState): GridState {
  return {
    ...state,
    cursor: { row: state.cursor.row, col: 0 },
    wrapPending: false,
  };
}

function handleNewline(state: GridState): GridState {
  const newRow = state.cursor.row + 1;

  // If we're past the last line, scroll
  if (newRow >= state.height) {
    return scrollContentUp(state, 1);
  }

  return {
    ...state,
    cursor: { row: newRow, col: 0 },
    wrapPending: false,
  };
}

function handleTab(state: GridState): GridState {
  const currentCol = state.cursor.col;
  const nextTabStop = Math.floor(currentCol / TAB_WIDTH + 1) * TAB_WIDTH;
  const newCol = Math.min(nextTabStop, state.width - 1);

  return {
    ...state,
    cursor: { row: state.cursor.row, col: newCol },
    wrapPending: false,
  };
}

function handleBackspace(state: GridState): GridState {
  return {
    ...state,
    cursor: {
      row: state.cursor.row,
      col: Math.max(0, state.cursor.col - 1),
    },
    wrapPending: false,
  };
}

// ============================================================================
// Cursor Save/Restore
// ============================================================================

function handleSaveCursor(state: GridState): GridState {
  return {
    ...state,
    savedCursor: {
      position: { ...state.cursor },
      attributes: { ...state.attributes },
    },
  };
}

function handleRestoreCursor(state: GridState): GridState {
  if (!state.savedCursor) {
    return state;
  }

  return {
    ...state,
    cursor: { ...state.savedCursor.position },
    attributes: { ...state.savedCursor.attributes },
  };
}

// ============================================================================
// Erase Operations
// ============================================================================

function handleEraseInDisplay(state: GridState, mode: 0 | 1 | 2 | 3): GridState {
  const newCells = cloneCells(state.cells);
  const { cursor, width, height, attributes } = state;
  const blankCell: Cell = { ...DEFAULT_CELL, bg: attributes.bg };

  switch (mode) {
    case 0: // Erase from cursor to end of screen
      // Erase rest of current line
      for (let col = cursor.col; col < width; col++) {
        newCells[cursor.row][col] = { ...blankCell };
      }
      // Erase all lines below
      for (let row = cursor.row + 1; row < height; row++) {
        for (let col = 0; col < width; col++) {
          newCells[row][col] = { ...blankCell };
        }
      }
      break;

    case 1: // Erase from start to cursor
      // Erase start of current line
      for (let col = 0; col <= cursor.col; col++) {
        newCells[cursor.row][col] = { ...blankCell };
      }
      // Erase all lines above
      for (let row = 0; row < cursor.row; row++) {
        for (let col = 0; col < width; col++) {
          newCells[row][col] = { ...blankCell };
        }
      }
      break;

    case 2: // Erase entire screen
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          newCells[row][col] = { ...blankCell };
        }
      }
      break;

    case 3: // Erase entire screen AND scrollback
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          newCells[row][col] = { ...blankCell };
        }
      }
      return { ...state, cells: newCells, scrollback: [] };
  }

  return { ...state, cells: newCells };
}

function handleEraseInLine(state: GridState, mode: 0 | 1 | 2): GridState {
  const newCells = cloneCells(state.cells);
  const { cursor, width, attributes } = state;
  const row = cursor.row;
  const blankCell: Cell = { ...DEFAULT_CELL, bg: attributes.bg };

  switch (mode) {
    case 0: // Erase from cursor to end of line
      for (let col = cursor.col; col < width; col++) {
        newCells[row][col] = { ...blankCell };
      }
      break;

    case 1: // Erase from start of line to cursor
      for (let col = 0; col <= cursor.col; col++) {
        newCells[row][col] = { ...blankCell };
      }
      break;

    case 2: // Erase entire line
      for (let col = 0; col < width; col++) {
        newCells[row][col] = { ...blankCell };
      }
      break;
  }

  return { ...state, cells: newCells };
}

// ============================================================================
// Scroll Operations
// ============================================================================

function scrollContentUp(state: GridState, count: number): GridState {
  const newCells = cloneCells(state.cells);
  const newScrollback = [...state.scrollback];

  for (let i = 0; i < count; i++) {
    // Move top line to scrollback
    if (newCells.length > 0) {
      newScrollback.push([...newCells[0]]);
    }

    // Trim scrollback if too long
    while (newScrollback.length > MAX_SCROLLBACK) {
      newScrollback.shift();
    }

    // Shift all rows up
    for (let row = 0; row < state.height - 1; row++) {
      newCells[row] = newCells[row + 1];
    }

    // Add blank row at bottom
    newCells[state.height - 1] = createEmptyRow(state.width);
  }

  return {
    ...state,
    cells: newCells,
    scrollback: newScrollback,
    cursor: {
      row: state.height - 1,
      col: 0,
    },
    wrapPending: false,
  };
}

function handleScrollUp(state: GridState, count: number): GridState {
  const newCells = cloneCells(state.cells);
  const newScrollback = [...state.scrollback];

  for (let i = 0; i < count; i++) {
    newScrollback.push([...newCells[0]]);
    while (newScrollback.length > MAX_SCROLLBACK) {
      newScrollback.shift();
    }

    for (let row = 0; row < state.height - 1; row++) {
      newCells[row] = newCells[row + 1];
    }
    newCells[state.height - 1] = createEmptyRow(state.width);
  }

  return { ...state, cells: newCells, scrollback: newScrollback };
}

function handleScrollDown(state: GridState, count: number): GridState {
  const newCells = cloneCells(state.cells);

  for (let i = 0; i < count; i++) {
    // Shift all rows down
    for (let row = state.height - 1; row > 0; row--) {
      newCells[row] = newCells[row - 1];
    }
    // Add blank row at top
    newCells[0] = createEmptyRow(state.width);
  }

  return { ...state, cells: newCells };
}

// ============================================================================
// SGR (Select Graphic Rendition)
// ============================================================================

function handleSGR(state: GridState, params: number[]): GridState {
  const newAttrs: CellAttributes = { ...state.attributes };

  let i = 0;
  while (i < params.length) {
    const code = params[i];

    switch (code) {
      // Reset
      case 0:
        Object.assign(newAttrs, DEFAULT_ATTRIBUTES);
        break;

      // Text styles ON
      case 1:
        newAttrs.bold = true;
        break;
      case 2:
        newAttrs.dim = true;
        break;
      case 3:
        newAttrs.italic = true;
        break;
      case 4:
        newAttrs.underline = true;
        break;
      case 7:
        newAttrs.inverse = true;
        break;
      case 9:
        newAttrs.strikethrough = true;
        break;

      // Text styles OFF
      case 22:
        newAttrs.bold = false;
        newAttrs.dim = false;
        break;
      case 23:
        newAttrs.italic = false;
        break;
      case 24:
        newAttrs.underline = false;
        break;
      case 27:
        newAttrs.inverse = false;
        break;
      case 29:
        newAttrs.strikethrough = false;
        break;

      // Standard foreground (30-37)
      case 30:
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
      case 36:
      case 37:
        newAttrs.fg = { mode: 'ansi16', value: code - 30 };
        break;

      // Extended foreground (38)
      case 38:
        if (params[i + 1] === 5 && params[i + 2] !== undefined) {
          // 256-color: 38;5;N
          newAttrs.fg = { mode: 'ansi256', value: params[i + 2] };
          i += 2;
        } else if (
          params[i + 1] === 2 &&
          params[i + 2] !== undefined &&
          params[i + 3] !== undefined &&
          params[i + 4] !== undefined
        ) {
          // True color: 38;2;R;G;B
          newAttrs.fg = {
            mode: 'rgb',
            value: [params[i + 2], params[i + 3], params[i + 4]],
          };
          i += 4;
        }
        break;

      // Default foreground (39)
      case 39:
        newAttrs.fg = { mode: 'default' };
        break;

      // Standard background (40-47)
      case 40:
      case 41:
      case 42:
      case 43:
      case 44:
      case 45:
      case 46:
      case 47:
        newAttrs.bg = { mode: 'ansi16', value: code - 40 };
        break;

      // Extended background (48)
      case 48:
        if (params[i + 1] === 5 && params[i + 2] !== undefined) {
          // 256-color: 48;5;N
          newAttrs.bg = { mode: 'ansi256', value: params[i + 2] };
          i += 2;
        } else if (
          params[i + 1] === 2 &&
          params[i + 2] !== undefined &&
          params[i + 3] !== undefined &&
          params[i + 4] !== undefined
        ) {
          // True color: 48;2;R;G;B
          newAttrs.bg = {
            mode: 'rgb',
            value: [params[i + 2], params[i + 3], params[i + 4]],
          };
          i += 4;
        }
        break;

      // Default background (49)
      case 49:
        newAttrs.bg = { mode: 'default' };
        break;

      // Bright foreground (90-97)
      case 90:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 97:
        newAttrs.fg = { mode: 'ansi16', value: code - 90 + 8 };
        break;

      // Bright background (100-107)
      case 100:
      case 101:
      case 102:
      case 103:
      case 104:
      case 105:
      case 106:
      case 107:
        newAttrs.bg = { mode: 'ansi16', value: code - 100 + 8 };
        break;
    }

    i++;
  }

  return { ...state, attributes: newAttrs };
}

// ============================================================================
// ANSI Parser
// ============================================================================

const CONTROL_CHARS: Record<string, VTerminalCommand['type']> = {
  '\x07': 'bell',
  '\x08': 'backspace',
  '\x09': 'tab',
  '\x0a': 'newline',
  '\x0b': 'newline', // VT treated as LF
  '\x0c': 'newline', // FF treated as LF
  '\x0d': 'carriageReturn',
};

/**
 * Parse raw input into commands
 */
export function parseInput(input: string): VTerminalCommand[] {
  const commands: VTerminalCommand[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    const code = char.charCodeAt(0);

    // Check for escape sequence
    if (char === '\x1b') {
      const result = parseEscapeSequence(input, i);
      if (result) {
        commands.push(result.command);
        i = result.endIndex;
        continue;
      }
    }

    // Check for control characters
    if (code < 0x20) {
      const cmdType = CONTROL_CHARS[char];
      if (cmdType) {
        commands.push({ type: cmdType } as VTerminalCommand);
      }
      i++;
      continue;
    }

    // Regular printable character
    const width = getCharWidth(char);
    if (width > 0) {
      commands.push({ type: 'print', char, width: width as 1 | 2 });
    }
    i++;
  }

  return commands;
}

interface ParseResult {
  command: VTerminalCommand;
  endIndex: number;
}

function parseEscapeSequence(input: string, start: number): ParseResult | null {
  if (start + 1 >= input.length) return null;

  const next = input[start + 1];

  // CSI sequence: ESC [
  if (next === '[') {
    return parseCSI(input, start + 2);
  }

  // ESC 7 - Save cursor
  if (next === '7') {
    return { command: { type: 'saveCursor' }, endIndex: start + 2 };
  }

  // ESC 8 - Restore cursor
  if (next === '8') {
    return { command: { type: 'restoreCursor' }, endIndex: start + 2 };
  }

  // OSC sequence: ESC ]
  if (next === ']') {
    // Skip OSC sequences (window title, etc.)
    let j = start + 2;
    while (j < input.length) {
      if (input[j] === '\x07') {
        return { command: { type: 'noop' }, endIndex: j + 1 };
      }
      if (input[j] === '\x1b' && input[j + 1] === '\\') {
        return { command: { type: 'noop' }, endIndex: j + 2 };
      }
      j++;
    }
    return { command: { type: 'noop' }, endIndex: input.length };
  }

  return null;
}

function parseCSI(input: string, start: number): ParseResult | null {
  let params = '';
  let intermediate = '';
  let i = start;

  // Collect parameter bytes (0x30-0x3F: 0-9, ;, <, =, >, ?)
  while (i < input.length) {
    const code = input.charCodeAt(i);
    if (code >= 0x30 && code <= 0x3f) {
      params += input[i];
      i++;
    } else {
      break;
    }
  }

  // Collect intermediate bytes (0x20-0x2F)
  while (i < input.length) {
    const code = input.charCodeAt(i);
    if (code >= 0x20 && code <= 0x2f) {
      intermediate += input[i];
      i++;
    } else {
      break;
    }
  }

  // Final byte (0x40-0x7E)
  if (i >= input.length) return null;

  const finalCode = input.charCodeAt(i);
  if (finalCode < 0x40 || finalCode > 0x7e) return null;

  const final = input[i];
  const command = interpretCSI(params, intermediate, final);

  return { command, endIndex: i + 1 };
}

function interpretCSI(params: string, intermediate: string, final: string): VTerminalCommand {
  // Check for private mode (starts with ?)
  const isPrivate = params.startsWith('?');
  const cleanParams = isPrivate ? params.slice(1) : params;

  // Parse parameters
  const paramList = cleanParams
    ? cleanParams.split(';').map((p) => (p === '' ? 0 : parseInt(p, 10)))
    : [];

  const p1 = paramList[0] || 1;
  const p2 = paramList[1] || 1;

  switch (final) {
    // Cursor movement
    case 'A':
      return { type: 'cursorUp', count: p1 };
    case 'B':
      return { type: 'cursorDown', count: p1 };
    case 'C':
      return { type: 'cursorForward', count: p1 };
    case 'D':
      return { type: 'cursorBack', count: p1 };
    case 'E':
      return { type: 'cursorNextLine', count: p1 };
    case 'F':
      return { type: 'cursorPrevLine', count: p1 };
    case 'G':
      return { type: 'cursorColumn', col: p1 - 1 }; // 1-indexed to 0-indexed
    case 'H':
    case 'f':
      return {
        type: 'cursorPosition',
        row: p1 - 1, // 1-indexed to 0-indexed
        col: p2 - 1,
      };

    // Erase
    case 'J':
      return { type: 'eraseInDisplay', mode: (paramList[0] || 0) as 0 | 1 | 2 | 3 };
    case 'K':
      return { type: 'eraseInLine', mode: (paramList[0] || 0) as 0 | 1 | 2 };

    // Scroll
    case 'S':
      return { type: 'scrollUp', count: p1 };
    case 'T':
      return { type: 'scrollDown', count: p1 };

    // SGR
    case 'm':
      return { type: 'sgr', params: paramList.length ? paramList : [0] };

    // Cursor save/restore (alternative)
    case 's':
      return { type: 'saveCursor' };
    case 'u':
      return { type: 'restoreCursor' };

    // Private modes
    case 'h':
    case 'l':
      if (isPrivate && paramList[0] === 7) {
        return { type: 'setAutoWrap', enabled: final === 'h' };
      }
      return { type: 'noop' };

    default:
      return { type: 'noop' };
  }
}

// ============================================================================
// Exports
// ============================================================================

export { MAX_SCROLLBACK, TAB_WIDTH };
