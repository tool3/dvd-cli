import { describe, it, expect } from 'vitest';
import { getCharWidth, getStringWidth, isControlChar } from './wcwidth';

//#region getCharWidth Tests

describe('getCharWidth', () => {
  it('returns 0 for empty string', () => {
    expect(getCharWidth('')).toBe(0);
  });

  it('returns 1 for ASCII characters', () => {
    expect(getCharWidth('a')).toBe(1);
    expect(getCharWidth('Z')).toBe(1);
    expect(getCharWidth('5')).toBe(1);
    expect(getCharWidth('!')).toBe(1);
  });

  it('returns 0 for control characters', () => {
    expect(getCharWidth('\x00')).toBe(0);
    expect(getCharWidth('\x1b')).toBe(0);
    expect(getCharWidth('\x7f')).toBe(0);
  });

  it('returns 2 for CJK characters', () => {
    expect(getCharWidth('中')).toBe(2);
    expect(getCharWidth('文')).toBe(2);
    expect(getCharWidth('日')).toBe(2);
    expect(getCharWidth('本')).toBe(2);
  });

  it('returns 2 for Japanese hiragana', () => {
    expect(getCharWidth('あ')).toBe(2);
    expect(getCharWidth('い')).toBe(2);
  });

  it('returns 2 for Japanese katakana', () => {
    expect(getCharWidth('ア')).toBe(2);
    expect(getCharWidth('イ')).toBe(2);
  });

  it('returns 2 for Korean characters', () => {
    expect(getCharWidth('한')).toBe(2);
    expect(getCharWidth('글')).toBe(2);
  });

  it('returns 2 for fullwidth ASCII', () => {
    expect(getCharWidth('Ａ')).toBe(2);
    expect(getCharWidth('１')).toBe(2);
  });

  it('returns 0 for combining diacritical marks', () => {
    expect(getCharWidth('\u0300')).toBe(0); // combining grave accent
    expect(getCharWidth('\u0301')).toBe(0); // combining acute accent
  });

  it('returns 0 for zero-width characters', () => {
    expect(getCharWidth('\u200b')).toBe(0); // zero-width space
    expect(getCharWidth('\ufeff')).toBe(0); // BOM
  });

  it('returns 2 for emoji', () => {
    expect(getCharWidth('😀')).toBe(2);
    expect(getCharWidth('🚀')).toBe(2);
  });
});


//#region getStringWidth Tests

describe('getStringWidth', () => {
  it('returns 0 for empty string', () => {
    expect(getStringWidth('')).toBe(0);
  });

  it('returns correct width for ASCII string', () => {
    expect(getStringWidth('hello')).toBe(5);
    expect(getStringWidth('world!')).toBe(6);
  });

  it('returns correct width for CJK string', () => {
    expect(getStringWidth('中文')).toBe(4);
    expect(getStringWidth('日本語')).toBe(6);
  });

  it('returns correct width for mixed ASCII and CJK', () => {
    expect(getStringWidth('hello中文')).toBe(9);
    expect(getStringWidth('a中b文c')).toBe(7);
  });

  it('handles strings with combining characters', () => {
    expect(getStringWidth('e\u0301')).toBe(1); // e with combining acute = 1
    expect(getStringWidth('café')).toBe(4);
  });

  it('handles strings with zero-width characters', () => {
    expect(getStringWidth('a\u200bb')).toBe(2); // a + zero-width space + b
  });

  it('handles emoji strings', () => {
    expect(getStringWidth('👋🌍')).toBe(4);
  });
});


//#region isControlChar Tests

describe('isControlChar', () => {
  it('returns false for empty string', () => {
    expect(isControlChar('')).toBe(false);
  });

  it('returns true for null character', () => {
    expect(isControlChar('\x00')).toBe(true);
  });

  it('returns true for tab', () => {
    expect(isControlChar('\t')).toBe(true);
  });

  it('returns true for newline', () => {
    expect(isControlChar('\n')).toBe(true);
  });

  it('returns true for carriage return', () => {
    expect(isControlChar('\r')).toBe(true);
  });

  it('returns true for escape', () => {
    expect(isControlChar('\x1b')).toBe(true);
  });

  it('returns true for DEL character', () => {
    expect(isControlChar('\x7f')).toBe(true);
  });

  it('returns false for space', () => {
    expect(isControlChar(' ')).toBe(false);
  });

  it('returns false for printable ASCII', () => {
    expect(isControlChar('a')).toBe(false);
    expect(isControlChar('Z')).toBe(false);
    expect(isControlChar('!')).toBe(false);
  });

  it('returns false for non-ASCII characters', () => {
    expect(isControlChar('中')).toBe(false);
    expect(isControlChar('é')).toBe(false);
  });
});

