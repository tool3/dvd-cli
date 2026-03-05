/**
 * Coalescer Tests
 */

import { describe, it, expect } from 'vitest';
import { createGridState, processInput } from './vterminal';
import { coalesce, coalesceBackgrounds, getCoalesceStats, resolveColor } from './coalescer';
import { themes } from './index';
import type { Color } from '../types';

const theme = themes.dracula;

describe('Coalescer', () => {
  describe('coalesce', () => {
    it('should coalesce plain text into single span', () => {
      let state = createGridState(80, 24);
      state = processInput(state, 'Hello World');

      const rows = coalesce(state, theme);

      // First row should have one span (all same style - includes trailing spaces)
      expect(rows[0].length).toBe(1);
      expect(rows[0][0].text.startsWith('Hello World')).toBe(true);
      expect(rows[0][0].col).toBe(0);
      expect(rows[0][0].row).toBe(0);
    });

    it('should split spans on color change', () => {
      let state = createGridState(80, 24);
      state = processInput(state, 'Hello \x1b[31mWorld\x1b[0m');

      const rows = coalesce(state, theme);

      // Should have two spans: "Hello " and "World"
      expect(rows[0].length).toBe(2);
      expect(rows[0][0].text).toBe('Hello ');
      expect(rows[0][1].text).toBe('World');
      expect(rows[0][1].style.fg).toBe(theme.red);
    });

    it('should split spans on style change', () => {
      let state = createGridState(80, 24);
      state = processInput(state, 'Normal \x1b[1mBold\x1b[0m');

      const rows = coalesce(state, theme);

      expect(rows[0].length).toBe(2);
      expect(rows[0][0].style.bold).toBe(false);
      expect(rows[0][1].style.bold).toBe(true);
    });

    it('should handle multiple lines', () => {
      let state = createGridState(80, 24);
      state = processInput(state, 'Line 1\nLine 2\nLine 3');

      const rows = coalesce(state, theme);

      expect(rows[0][0].text.startsWith('Line 1')).toBe(true);
      expect(rows[1][0].text.startsWith('Line 2')).toBe(true);
      expect(rows[2][0].text.startsWith('Line 3')).toBe(true);
    });

    it('should handle empty lines', () => {
      let state = createGridState(80, 24);
      state = processInput(state, 'A\n\nB');

      const rows = coalesce(state, theme);

      expect(rows[0][0].text.startsWith('A')).toBe(true);
      // Row 1 has only whitespace, which gets coalesced but may be filtered
      expect(rows[2][0].text.startsWith('B')).toBe(true);
    });
  });

  describe('coalesceBackgrounds', () => {
    it('should coalesce consecutive background colors', () => {
      let state = createGridState(80, 24);
      state = processInput(state, '\x1b[41mRed Background\x1b[0m');

      const rows = coalesce(state, theme);
      const bgRects = coalesceBackgrounds(rows, {
        charWidth: 10,
        lineHeight: 20,
        padding: 16,
        headerHeight: 40,
      });

      // Should have one background rect
      expect(bgRects.length).toBe(1);
      expect(bgRects[0].color).toBe(theme.red);
    });

    it('should merge adjacent same-color backgrounds', () => {
      let state = createGridState(80, 24);
      // Two adjacent red-background spans that should merge
      state = processInput(state, '\x1b[41m\x1b[30mA\x1b[31mB\x1b[0m');

      const rows = coalesce(state, theme);
      const bgRects = coalesceBackgrounds(rows, {
        charWidth: 10,
        lineHeight: 20,
        padding: 16,
        headerHeight: 40,
      });

      // Both spans have same bg color, so should be one rect
      expect(bgRects.length).toBe(1);
    });
  });

  describe('getCoalesceStats', () => {
    it('should calculate correct reduction', () => {
      let state = createGridState(80, 24);
      state = processInput(state, 'Hello World');

      const rows = coalesce(state, theme);
      const stats = getCoalesceStats(state, rows);

      // 80*24 = 1920 cells, but only 1 span
      expect(stats.cellCount).toBe(1920);
      expect(stats.spanCount).toBe(1);
      expect(stats.reduction).toBeGreaterThan(99);
    });

    it('should show lower reduction for varied content', () => {
      let state = createGridState(10, 1);
      // Each char different color
      state = processInput(state, '\x1b[31mR\x1b[32mG\x1b[34mB\x1b[0m');

      const rows = coalesce(state, theme);
      const stats = getCoalesceStats(state, rows);

      expect(stats.spanCount).toBe(3);
    });
  });

  describe('resolveColor', () => {
    it('should resolve default foreground', () => {
      const color: Color = { mode: 'default' };
      expect(resolveColor(color, theme, false)).toBe(theme.foreground);
    });

    it('should resolve default background as null', () => {
      const color: Color = { mode: 'default' };
      expect(resolveColor(color, theme, true)).toBe(null);
    });

    it('should resolve ANSI 16 colors', () => {
      const red: Color = { mode: 'ansi16', value: 1 };
      expect(resolveColor(red, theme, false)).toBe(theme.red);

      const brightGreen: Color = { mode: 'ansi16', value: 10 };
      expect(resolveColor(brightGreen, theme, false)).toBe(theme.brightGreen);
    });

    it('should resolve ANSI 256 colors', () => {
      // Color cube: index 196 should be bright red
      const color: Color = { mode: 'ansi256', value: 196 };
      const resolved = resolveColor(color, theme, false);
      expect(resolved).toBe('#ff0000');
    });

    it('should resolve RGB colors', () => {
      const color: Color = { mode: 'rgb', value: [128, 64, 255] };
      expect(resolveColor(color, theme, false)).toBe('rgb(128,64,255)');
    });
  });
});
