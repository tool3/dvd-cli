import { describe, it, expect } from 'vitest';
import { r, rx, fmt, stripAnsi, escapeXml, isTruecolor } from './utils';

//#region r (round to 1 decimal) Tests

describe('r', () => {
  it('rounds to 1 decimal place', () => {
    expect(r(1.234)).toBe(1.2);
    expect(r(1.256)).toBe(1.3);
  });

  it('keeps whole numbers as-is', () => {
    expect(r(5)).toBe(5);
    expect(r(100)).toBe(100);
  });

  it('handles negative numbers', () => {
    expect(r(-1.234)).toBe(-1.2);
    expect(r(-1.256)).toBe(-1.3);
  });

  it('handles zero', () => {
    expect(r(0)).toBe(0);
  });
});


//#region rx (round to integer) Tests

describe('rx', () => {
  it('rounds to nearest integer', () => {
    expect(rx(1.4)).toBe(1);
    expect(rx(1.6)).toBe(2);
  });

  it('keeps whole numbers as-is', () => {
    expect(rx(5)).toBe(5);
    expect(rx(100)).toBe(100);
  });

  it('rounds 0.5 up', () => {
    expect(rx(1.5)).toBe(2);
    expect(rx(2.5)).toBe(3);
  });

  it('handles negative numbers', () => {
    expect(rx(-1.4)).toBe(-1);
    expect(rx(-1.6)).toBe(-2);
  });
});


//#region fmt (format number for SVG) Tests

describe('fmt', () => {
  it('removes .0 from whole numbers', () => {
    expect(fmt(5.0)).toBe('5');
    expect(fmt(100.0)).toBe('100');
  });

  it('keeps single decimal when needed', () => {
    expect(fmt(5.5)).toBe('5.5');
    expect(fmt(10.3)).toBe('10.3');
  });

  it('handles zero', () => {
    expect(fmt(0)).toBe('0');
  });

  it('rounds to 1 decimal then formats', () => {
    expect(fmt(5.123)).toBe('5.1');
    expect(fmt(5.167)).toBe('5.2');
  });
});


//#region stripAnsi Tests

describe('stripAnsi', () => {
  it('removes SGR color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
    expect(stripAnsi('\x1b[1;32mbold green\x1b[0m')).toBe('bold green');
  });

  it('removes cursor movement codes', () => {
    expect(stripAnsi('\x1b[2Aup\x1b[3Bdown')).toBe('updown');
    expect(stripAnsi('\x1b[10Cright')).toBe('right');
  });

  it('removes private mode codes', () => {
    expect(stripAnsi('\x1b[?25hshow cursor\x1b[?25l')).toBe('show cursor');
  });

  it('handles text without ANSI codes', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('handles multiple consecutive codes', () => {
    expect(stripAnsi('\x1b[1m\x1b[31m\x1b[4mformatted\x1b[0m')).toBe('formatted');
  });
});


//#region escapeXml Tests

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes less than', () => {
    expect(escapeXml('A < B')).toBe('A &lt; B');
  });

  it('escapes greater than', () => {
    expect(escapeXml('A > B')).toBe('A &gt; B');
  });

  it('escapes double quote', () => {
    expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quote', () => {
    expect(escapeXml("it's")).toBe('it&apos;s');
  });

  it('escapes multiple special characters', () => {
    expect(escapeXml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('handles text without special characters', () => {
    expect(escapeXml('plain text')).toBe('plain text');
  });

  it('strips ANSI codes before escaping', () => {
    expect(escapeXml('\x1b[31m<red>\x1b[0m')).toBe('&lt;red&gt;');
  });

  it('handles empty string', () => {
    expect(escapeXml('')).toBe('');
  });
});


//#region isTruecolor Tests

describe('isTruecolor', () => {
  it('returns true for rgb() colors', () => {
    expect(isTruecolor('rgb(255, 0, 0)')).toBe(true);
    expect(isTruecolor('rgb(0,128,255)')).toBe(true);
  });

  it('returns false for hex colors', () => {
    expect(isTruecolor('#ff0000')).toBe(false);
    expect(isTruecolor('#fff')).toBe(false);
  });

  it('returns false for named colors', () => {
    expect(isTruecolor('red')).toBe(false);
    expect(isTruecolor('blue')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTruecolor(null)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTruecolor('')).toBe(false);
  });

  it('returns false for rgba (only rgb prefix)', () => {
    expect(isTruecolor('rgba(255, 0, 0, 0.5)')).toBe(false);
  });
});

