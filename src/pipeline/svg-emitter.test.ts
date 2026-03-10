import { describe, it, expect } from 'vitest';
import { emit, styleToClasses, generateStylesheet, getColorClass } from './svg-emitter';
import type { SpanRow, Theme, CellStyle } from '../types';

//#region Test Theme

const testTheme: Theme = {
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
};


//#region styleToClasses Tests

describe('styleToClasses', () => {
  it('returns empty array for default style', () => {
    const style: CellStyle = {};
    expect(styleToClasses(style)).toEqual([]);
  });

  it('adds bold class when bold is true', () => {
    const style: CellStyle = { bold: true };
    expect(styleToClasses(style)).toContain('bold');
  });

  it('adds italic class when italic is true', () => {
    const style: CellStyle = { italic: true };
    expect(styleToClasses(style)).toContain('italic');
  });

  it('adds underline class when underline is true', () => {
    const style: CellStyle = { underline: true };
    expect(styleToClasses(style)).toContain('uline');
  });

  it('adds dim class when dim is true', () => {
    const style: CellStyle = { dim: true };
    expect(styleToClasses(style)).toContain('dim');
  });

  it('adds strikethrough class when strikethrough is true', () => {
    const style: CellStyle = { strikethrough: true };
    expect(styleToClasses(style)).toContain('strike');
  });

  it('combines multiple style classes', () => {
    const style: CellStyle = { bold: true, italic: true, underline: true };
    const classes = styleToClasses(style);
    expect(classes).toContain('bold');
    expect(classes).toContain('italic');
    expect(classes).toContain('uline');
    expect(classes.length).toBe(3);
  });
});


//#region getColorClass Tests

describe('getColorClass', () => {
  it('returns fg for foreground color', () => {
    expect(getColorClass('#c9d1d9', testTheme)).toBe('fg');
  });

  it('returns f0 for black color', () => {
    expect(getColorClass('#000000', testTheme)).toBe('f0');
  });

  it('returns f1 for red color', () => {
    expect(getColorClass('#ff7b72', testTheme)).toBe('f1');
  });

  it('returns f2 for green color', () => {
    expect(getColorClass('#3fb950', testTheme)).toBe('f2');
  });

  it('returns null for unknown color', () => {
    expect(getColorClass('#123456', testTheme)).toBeNull();
  });

  it('returns bg for background color when isBackground is true', () => {
    expect(getColorClass('#1e1e1e', testTheme, true)).toBe('bg');
  });

  it('returns b0 for black background', () => {
    expect(getColorClass('#000000', testTheme, true)).toBe('b0');
  });
});


//#region generateStylesheet Tests

describe('generateStylesheet', () => {
  it('generates stylesheet with text class', () => {
    const css = generateStylesheet(testTheme, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(css).toContain('.text {');
    expect(css).toContain('font-size: 14px');
  });

  it('includes style helper classes', () => {
    const css = generateStylesheet(testTheme, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(css).toContain('.bold { font-weight: bold; }');
    expect(css).toContain('.italic { font-style: italic; }');
    expect(css).toContain('.dim { opacity: 0.5; }');
  });

  it('includes cursor blink animation by default', () => {
    const css = generateStylesheet(testTheme, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(css).toContain('@keyframes blink');
    expect(css).toContain('.cursor { animation: blink');
  });

  it('omits cursor blink animation when disabled', () => {
    const css = generateStylesheet(testTheme, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      cursorBlink: false,
    });

    expect(css).not.toContain('@keyframes blink');
    expect(css).toContain('.cursor { opacity: 1; }');
  });

  it('includes font-face when embedFont is true', () => {
    const css = generateStylesheet(testTheme, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      embedFont: true,
      fontData: 'base64encodeddata',
    });

    expect(css).toContain('@font-face');
    expect(css).toContain("font-family: 'DVDMono'");
  });
});


//#region emit Tests

describe('emit', () => {
  it('generates valid SVG structure', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
    expect(result.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('renders text spans', () => {
    const rows: SpanRow[] = [
      [{ text: 'Hello', row: 0, col: 0, style: {} }],
    ];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(result.svg).toContain('>Hello<');
  });

  it('renders cursor when visible', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, { row: 0, col: 0 }, true, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(result.svg).toContain('class="cursor"');
  });

  it('does not render cursor when not visible', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, { row: 0, col: 0 }, false, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(result.svg).not.toContain('class="cursor"');
  });

  it('includes chrome for macos template', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'macos',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(result.svg).toContain('class="chrome"');
    expect(result.svg).toContain('fill="#ff5f56"'); // macOS close button
  });

  it('includes chrome for windows template', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'windows',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(result.svg).toContain('class="chrome"');
  });

  it('omits chrome for minimal template', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
    });

    expect(result.svg).not.toContain('class="chrome"');
  });

  it('includes title in header when provided', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'macos',
      width: 800,
      height: 600,
      fontSize: 14,
      title: 'My Terminal',
    });

    expect(result.svg).toContain('My Terminal');
  });

  it('includes watermark when provided', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      watermark: 'Generated by DVD',
    });

    expect(result.svg).toContain('Generated by DVD');
  });

  it('renders selection highlight', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      selection: { start: 0, end: 5, row: 0 },
    });

    expect(result.svg).toContain('class="selection-layer"');
    expect(result.svg).toContain(`fill="${testTheme.selection}"`);
  });

  it('applies border when borderWidth is set', () => {
    const rows: SpanRow[] = [];
    const result = emit(rows, null, false, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      borderWidth: 2,
      borderColor: '#ff0000',
    });

    expect(result.svg).toContain('stroke="#ff0000"');
    expect(result.svg).toContain('stroke-width="2"');
  });

  it('renders different cursor styles', () => {
    const rows: SpanRow[] = [];

    // Block cursor
    const blockResult = emit(rows, { row: 0, col: 0 }, true, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      cursorStyle: 'block',
    });
    expect(blockResult.svg).toContain('class="cursor"');

    // Bar cursor
    const barResult = emit(rows, { row: 0, col: 0 }, true, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      cursorStyle: 'bar',
    });
    expect(barResult.svg).toContain('width="2"');

    // Underline cursor
    const underlineResult = emit(rows, { row: 0, col: 0 }, true, {
      theme: testTheme,
      template: 'minimal',
      width: 800,
      height: 600,
      fontSize: 14,
      cursorStyle: 'underline',
    });
    expect(underlineResult.svg).toContain('height="2"');
  });
});

