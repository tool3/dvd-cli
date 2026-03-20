import { describe, it, expect } from 'vitest';
import { renderCursor, renderSelection, type CursorConfig, type SelectionConfig } from './cursor';

//#region Test Data

const createCursorConfig = (overrides: Partial<CursorConfig> = {}): CursorConfig => ({
  cursor: { col: 0, row: 0 },
  charWidth: 8,
  lineHeight: 16,
  padding: 12,
  contentStartY: 40,
  fontSize: 14,
  cursorColor: '#ffffff',
  cursorStyle: 'block',
  activeCursor: false,
  ...overrides,
});

const createSelectionConfig = (overrides: Partial<SelectionConfig> = {}): SelectionConfig => ({
  start: 0,
  end: 5,
  row: 0,
  charWidth: 8,
  lineHeight: 16,
  padding: 12,
  contentStartY: 40,
  selectionColor: '#4466ff',
  ...overrides,
});


//#region renderCursor Tests

describe('renderCursor', () => {
  it('renders block cursor', () => {
    const config = createCursorConfig({ cursorStyle: 'block' });

    const result = renderCursor(config);

    expect(result).toContain('<g class="cursor-layer">');
    expect(result).toContain('</g>');
    expect(result).toContain('<rect');
    expect(result).toContain('class="cursor"');
  });

  it('renders bar cursor with width 2', () => {
    const config = createCursorConfig({ cursorStyle: 'bar' });

    const result = renderCursor(config);

    expect(result).toContain('width="2"');
  });

  it('renders underline cursor', () => {
    const config = createCursorConfig({ cursorStyle: 'underline' });

    const result = renderCursor(config);

    expect(result).toContain('height="2"');
  });

  it('uses active cursor class when activeCursor is true', () => {
    const config = createCursorConfig({ activeCursor: true });

    const result = renderCursor(config);

    expect(result).toContain('class="cursor-active"');
    expect(result).not.toContain('class="cursor"');
  });

  it('uses inactive cursor class when activeCursor is false', () => {
    const config = createCursorConfig({ activeCursor: false });

    const result = renderCursor(config);

    expect(result).toContain('class="cursor"');
    expect(result).not.toContain('class="cursor-active"');
  });

  it('positions cursor at correct column', () => {
    const config = createCursorConfig({ cursor: { col: 5, row: 0 } });

    const result = renderCursor(config);

    // x = padding + col * charWidth = 12 + 5 * 8 = 52
    expect(result).toContain('x="52"');
  });

  it('positions cursor at correct row', () => {
    const config = createCursorConfig({ cursor: { col: 0, row: 3 } });

    const result = renderCursor(config);

    // With minimum visual padding (10% of fontSize on each side):
    // minPadding = 14 * 0.1 = 1.4
    // minCursorHeight = 14 + 2 * 1.4 = 16.8
    // effectiveCursorHeight = max(16, 16.8) = 16.8
    // cursorYOffset = (16 - 16.8) / 2 = -0.4
    // y = contentStartY + row * lineHeight + cursorYOffset = 40 + 3 * 16 - 0.4 = 87.6
    expect(result).toContain('y="87.6"');
  });

  it('uses provided cursor color', () => {
    const config = createCursorConfig({ cursorColor: '#ff0000' });

    const result = renderCursor(config);

    expect(result).toContain('fill="#ff0000"');
  });

  it('sets cursor width to charWidth for block cursor', () => {
    const config = createCursorConfig({ cursorStyle: 'block', charWidth: 10 });

    const result = renderCursor(config);

    expect(result).toContain('width="10"');
  });
});


//#region renderSelection Tests

describe('renderSelection', () => {
  it('renders selection layer', () => {
    const config = createSelectionConfig();

    const result = renderSelection(config);

    expect(result).toContain('<g class="selection-layer">');
    expect(result).toContain('</g>');
  });

  it('handles selection where start > end', () => {
    const config = createSelectionConfig({ start: 10, end: 5 });

    const result = renderSelection(config);

    // Should swap to use min/max, so x = padding + 5 * charWidth = 12 + 40 = 52
    expect(result).toContain('x="52"');
    // width = (10 - 5) * 8 = 40
    expect(result).toContain('width="40"');
  });

  it('positions selection at correct row', () => {
    const config = createSelectionConfig({ row: 2 });

    const result = renderSelection(config);

    // y = contentStartY + row * lineHeight = 40 + 2 * 16 = 72
    expect(result).toContain('y="72"');
  });

  it('calculates selection width correctly', () => {
    const config = createSelectionConfig({ start: 2, end: 7, charWidth: 8 });

    const result = renderSelection(config);

    // width = (7 - 2) * 8 = 40
    expect(result).toContain('width="40"');
  });

  it('uses provided selection color', () => {
    const config = createSelectionConfig({ selectionColor: '#ff00ff' });

    const result = renderSelection(config);

    expect(result).toContain('fill="#ff00ff"');
  });

  it('sets selection height to lineHeight', () => {
    const config = createSelectionConfig({ lineHeight: 20 });

    const result = renderSelection(config);

    expect(result).toContain('height="20"');
  });

  it('includes opacity for semi-transparent selection', () => {
    const config = createSelectionConfig();

    const result = renderSelection(config);

    expect(result).toContain('opacity="0.5"');
  });
});

