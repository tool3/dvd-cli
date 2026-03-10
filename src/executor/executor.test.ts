import { describe, it, expect } from 'vitest';
import { stripAnsi, parseEscapes, sleep } from './types';
import { hasSelection, clearSelection, deleteSelection } from './handlers/typing';
import { findWordBoundary } from './handlers/navigation';
import type { ExecutorContext } from './types';

//#region Utility Functions Tests

describe('stripAnsi', () => {
  it('returns plain text unchanged', () => {
    expect(stripAnsi('Hello World')).toBe('Hello World');
  });

  it('removes SGR color codes', () => {
    expect(stripAnsi('\x1b[31mRed\x1b[0m')).toBe('Red');
  });

  it('removes multiple color codes', () => {
    expect(stripAnsi('\x1b[1;32mGreen Bold\x1b[0m Normal')).toBe('Green Bold Normal');
  });

  it('removes cursor movement codes', () => {
    expect(stripAnsi('\x1b[2AUp 2\x1b[3BDown 3')).toBe('Up 2Down 3');
  });

  it('removes mode control codes', () => {
    expect(stripAnsi('\x1b[?25hShow cursor\x1b[?25l')).toBe('Show cursor');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('handles complex sequences', () => {
    expect(stripAnsi('\x1b[38;2;255;0;0mRGB Red\x1b[0m')).toBe('RGB Red');
  });
});

describe('parseEscapes', () => {
  it('converts \\e to escape character', () => {
    expect(parseEscapes('\\e[31m')).toBe('\x1b[31m');
  });

  it('converts \\x1b to escape character', () => {
    expect(parseEscapes('\\x1b[31m')).toBe('\x1b[31m');
  });

  it('converts \\n to newline', () => {
    expect(parseEscapes('Line1\\nLine2')).toBe('Line1\nLine2');
  });

  it('converts \\t to tab', () => {
    expect(parseEscapes('Col1\\tCol2')).toBe('Col1\tCol2');
  });

  it('handles multiple escape sequences', () => {
    expect(parseEscapes('\\e[1m\\tBold\\e[0m\\n')).toBe('\x1b[1m\tBold\x1b[0m\n');
  });

  it('leaves plain text unchanged', () => {
    expect(parseEscapes('Hello World')).toBe('Hello World');
  });
});

describe('sleep', () => {
  it('resolves after the specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(100);
  });
});


//#region Selection Functions Tests

describe('hasSelection', () => {
  it('returns false when no selection', () => {
    const ctx = createTestContext();
    expect(hasSelection(ctx)).toBe(false);
  });

  it('returns false when selection start equals end', () => {
    const ctx = createTestContext();
    ctx.selectionStart = 5;
    ctx.selectionEnd = 5;
    expect(hasSelection(ctx)).toBe(false);
  });

  it('returns true when selection exists', () => {
    const ctx = createTestContext();
    ctx.selectionStart = 2;
    ctx.selectionEnd = 8;
    expect(hasSelection(ctx)).toBe(true);
  });
});

describe('clearSelection', () => {
  it('clears selection start and end', () => {
    const ctx = createTestContext();
    ctx.selectionStart = 2;
    ctx.selectionEnd = 8;

    clearSelection(ctx);

    expect(ctx.selectionStart).toBeUndefined();
    expect(ctx.selectionEnd).toBeUndefined();
  });
});

describe('deleteSelection', () => {
  it('returns false when no selection', () => {
    const ctx = createTestContext();
    ctx.currentLine = 'Hello World';
    expect(deleteSelection(ctx)).toBe(false);
    expect(ctx.currentLine).toBe('Hello World');
  });

  it('deletes selected text', () => {
    const ctx = createTestContext();
    ctx.currentLine = 'Hello World';
    ctx.selectionStart = 0;
    ctx.selectionEnd = 6;
    ctx.cursorX = 6;

    const result = deleteSelection(ctx);

    expect(result).toBe(true);
    expect(ctx.currentLine).toBe('World');
    expect(ctx.cursorX).toBe(0);
  });

  it('handles reverse selection', () => {
    const ctx = createTestContext();
    ctx.currentLine = 'Hello World';
    ctx.selectionStart = 6;
    ctx.selectionEnd = 0;
    ctx.cursorX = 0;

    const result = deleteSelection(ctx);

    expect(result).toBe(true);
    expect(ctx.currentLine).toBe('World');
    expect(ctx.cursorX).toBe(0);
  });

  it('clears selection after delete', () => {
    const ctx = createTestContext();
    ctx.currentLine = 'Hello World';
    ctx.selectionStart = 0;
    ctx.selectionEnd = 5;

    deleteSelection(ctx);

    expect(ctx.selectionStart).toBeUndefined();
    expect(ctx.selectionEnd).toBeUndefined();
  });
});


//#region Word Boundary Tests

describe('findWordBoundary', () => {
  describe('left direction', () => {
    it('returns 0 when at position 0', () => {
      expect(findWordBoundary('left', 0, 'Hello World')).toBe(0);
    });

    it('moves to start of current word', () => {
      expect(findWordBoundary('left', 8, 'Hello World')).toBe(6);
    });

    it('moves past whitespace to previous word', () => {
      expect(findWordBoundary('left', 6, 'Hello World')).toBe(0);
    });

    it('handles punctuation as separate word', () => {
      expect(findWordBoundary('left', 6, 'foo!! bar')).toBe(3);
    });
  });

  describe('right direction', () => {
    it('returns end when at end', () => {
      const text = 'Hello World';
      expect(findWordBoundary('right', text.length, text)).toBe(text.length);
    });

    it('moves to end of current word', () => {
      expect(findWordBoundary('right', 0, 'Hello World')).toBe(5);
    });

    it('moves past whitespace to next word end', () => {
      expect(findWordBoundary('right', 5, 'Hello World')).toBe(11);
    });

    it('handles punctuation as separate word', () => {
      expect(findWordBoundary('right', 3, 'foo!! bar')).toBe(5);
    });
  });
});


//#region Test Helpers

const createTestContext = (): ExecutorContext => ({
  grid: { cells: [], cursor: { row: 0, col: 0 }, width: 80, height: 24, scrollback: [], attributes: { fg: { mode: 'default' }, bg: { mode: 'default' }, bold: false, dim: false, italic: false, underline: false, inverse: false, strikethrough: false }, savedCursor: null, autoWrap: true, wrapPending: false },
  lines: [''],
  currentLine: '',
  cursorX: 0,
  cursorY: 0,
  frames: [],
  frameData: [],
  startTime: Date.now(),
  captureOverhead: 0,
  width: 800,
  height: 600,
  fontSize: 14,
  typingSpeed: 50,
  template: 'minimal',
  theme: {
    name: 'test',
    background: '#1e1e1e',
    foreground: '#c9d1d9',
    cursor: '#c9d1d9',
    selection: '#264f78',
    black: '#000000',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
  promptPrefix: '❯ ',
  cursorBlink: true,
  clipboard: '',
  screenshotCounter: 0,
  autoWidth: false,
  autoHeight: false,
  maxLineLength: 0,
  maxLines: 0,
  maxVisualRow: 0,
  scroll: false,
  scrollOffset: 0,
  isExecutingCommand: false,
  isMultiLineContinuation: false,
  lineHeight: 1.4,
  hasCustomLineHeight: false,
  charWidthRatio: 0.6,
  shell: '/bin/sh',
  animationSpeed: 50,
});

