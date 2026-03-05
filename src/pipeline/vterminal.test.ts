/**
 * VTerminal Tests
 */

import { describe, it, expect } from 'vitest';
import { createGridState, applyCommand, processInput, parseInput } from './vterminal';
import type { VTerminalCommand } from '../types';

describe('VTerminal', () => {
  describe('createGridState', () => {
    it('should create empty grid with correct dimensions', () => {
      const state = createGridState(80, 24);
      expect(state.width).toBe(80);
      expect(state.height).toBe(24);
      expect(state.cells.length).toBe(24);
      expect(state.cells[0].length).toBe(80);
      expect(state.cursor).toEqual({ row: 0, col: 0 });
    });

    it('should initialize cells with default values', () => {
      const state = createGridState(10, 5);
      const cell = state.cells[0][0];
      expect(cell.char).toBe(' ');
      expect(cell.fg.mode).toBe('default');
      expect(cell.bold).toBe(false);
    });
  });

  describe('print command', () => {
    it('should write character at cursor position', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'print', char: 'A', width: 1 });

      expect(state.cells[0][0].char).toBe('A');
      expect(state.cursor.col).toBe(1);
    });

    it('should apply current attributes to printed character', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'sgr', params: [1] }); // Bold
      state = applyCommand(state, { type: 'sgr', params: [31] }); // Red
      state = applyCommand(state, { type: 'print', char: 'X', width: 1 });

      const cell = state.cells[0][0];
      expect(cell.char).toBe('X');
      expect(cell.bold).toBe(true);
      expect(cell.fg.mode).toBe('ansi16');
      expect((cell.fg as { value: number }).value).toBe(1); // Red
    });

    it('should handle fullwidth characters', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'print', char: '\u4E2D', width: 2 });

      expect(state.cells[0][0].char).toBe('\u4E2D');
      expect(state.cells[0][0].width).toBe(2);
      expect(state.cursor.col).toBe(2);
    });
  });

  describe('cursor movement', () => {
    it('should move cursor up', () => {
      let state = createGridState(10, 10);
      state = applyCommand(state, { type: 'cursorPosition', row: 5, col: 5 });
      state = applyCommand(state, { type: 'cursorUp', count: 2 });

      expect(state.cursor).toEqual({ row: 3, col: 5 });
    });

    it('should clamp cursor to bounds', () => {
      let state = createGridState(10, 10);
      state = applyCommand(state, { type: 'cursorUp', count: 100 });

      expect(state.cursor.row).toBe(0);
    });

    it('should handle CUP (cursor position) command', () => {
      let state = createGridState(80, 24);
      state = applyCommand(state, { type: 'cursorPosition', row: 10, col: 20 });

      expect(state.cursor).toEqual({ row: 10, col: 20 });
    });
  });

  describe('erase operations', () => {
    it('should erase from cursor to end of line (EL 0)', () => {
      let state = createGridState(10, 5);

      // Write some text
      state = processInput(state, 'ABCDEFGHIJ');
      state = applyCommand(state, { type: 'cursorPosition', row: 0, col: 3 });
      state = applyCommand(state, { type: 'eraseInLine', mode: 0 });

      expect(state.cells[0][0].char).toBe('A');
      expect(state.cells[0][2].char).toBe('C');
      expect(state.cells[0][3].char).toBe(' ');
      expect(state.cells[0][9].char).toBe(' ');
    });

    it('should erase entire screen (ED 2)', () => {
      let state = createGridState(5, 5);
      state = processInput(state, 'XXXXX');
      state = applyCommand(state, { type: 'eraseInDisplay', mode: 2 });

      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
          expect(state.cells[row][col].char).toBe(' ');
        }
      }
    });
  });

  describe('SGR (colors and styles)', () => {
    it('should handle bold', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'sgr', params: [1] });

      expect(state.attributes.bold).toBe(true);
    });

    it('should handle reset', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'sgr', params: [1, 3, 31] });
      state = applyCommand(state, { type: 'sgr', params: [0] });

      expect(state.attributes.bold).toBe(false);
      expect(state.attributes.italic).toBe(false);
      expect(state.attributes.fg.mode).toBe('default');
    });

    it('should handle 256-color foreground', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'sgr', params: [38, 5, 196] });

      expect(state.attributes.fg.mode).toBe('ansi256');
      expect((state.attributes.fg as { value: number }).value).toBe(196);
    });

    it('should handle true color', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'sgr', params: [38, 2, 255, 128, 0] });

      expect(state.attributes.fg.mode).toBe('rgb');
      expect((state.attributes.fg as { value: [number, number, number] }).value).toEqual([255, 128, 0]);
    });

    it('should handle bright colors', () => {
      let state = createGridState(10, 5);
      state = applyCommand(state, { type: 'sgr', params: [91] }); // Bright red

      expect(state.attributes.fg.mode).toBe('ansi16');
      expect((state.attributes.fg as { value: number }).value).toBe(9); // 91 - 90 + 8 = 9
    });
  });

  describe('save/restore cursor', () => {
    it('should save and restore cursor position', () => {
      let state = createGridState(80, 24);
      state = applyCommand(state, { type: 'cursorPosition', row: 10, col: 20 });
      state = applyCommand(state, { type: 'saveCursor' });
      state = applyCommand(state, { type: 'cursorPosition', row: 0, col: 0 });
      state = applyCommand(state, { type: 'restoreCursor' });

      expect(state.cursor).toEqual({ row: 10, col: 20 });
    });

    it('should save and restore attributes', () => {
      let state = createGridState(80, 24);
      state = applyCommand(state, { type: 'sgr', params: [1, 31] });
      state = applyCommand(state, { type: 'saveCursor' });
      state = applyCommand(state, { type: 'sgr', params: [0] });
      state = applyCommand(state, { type: 'restoreCursor' });

      expect(state.attributes.bold).toBe(true);
      expect((state.attributes.fg as { value: number }).value).toBe(1);
    });
  });
});

describe('parseInput', () => {
  it('should tokenize plain text', () => {
    const commands = parseInput('Hello');
    expect(commands).toHaveLength(5);
    expect(commands[0]).toEqual({ type: 'print', char: 'H', width: 1 });
  });

  it('should tokenize control characters', () => {
    const commands = parseInput('A\nB');
    expect(commands).toHaveLength(3);
    expect(commands[0]).toEqual({ type: 'print', char: 'A', width: 1 });
    expect(commands[1]).toEqual({ type: 'newline' });
    expect(commands[2]).toEqual({ type: 'print', char: 'B', width: 1 });
  });

  it('should tokenize CSI sequences', () => {
    const commands = parseInput('\x1b[31mRed');
    expect(commands).toHaveLength(4); // sgr + 'R' + 'e' + 'd'
    expect(commands[0]).toEqual({ type: 'sgr', params: [31] });
  });

  it('should handle cursor movement sequences', () => {
    const commands = parseInput('\x1b[5;10H');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual({ type: 'cursorPosition', row: 4, col: 9 }); // 1-indexed to 0-indexed
  });
});

describe('processInput integration', () => {
  it('should handle neofetch-style output', () => {
    let state = createGridState(80, 24);

    // Simulate cursor movements and colored output
    state = processInput(state, '\x1b[1;1H'); // Move to top-left
    state = processInput(state, '\x1b[32m'); // Green
    state = processInput(state, 'Logo');
    state = processInput(state, '\x1b[1;10H'); // Move to column 10
    state = processInput(state, '\x1b[0m'); // Reset
    state = processInput(state, 'Info');

    expect(state.cells[0][0].char).toBe('L');
    expect(state.cells[0][9].char).toBe('I');
  });

  it('should handle progress bar updates', () => {
    let state = createGridState(80, 24);

    // Initial progress
    state = processInput(state, 'Progress: [          ]');
    // Carriage return and overwrite
    state = processInput(state, '\rProgress: [=====     ]');
    // Final state
    state = processInput(state, '\rProgress: [==========]');

    expect(state.cells[0][11].char).toBe('=');
    expect(state.cells[0][20].char).toBe('=');
  });
});
