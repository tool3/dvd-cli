//#region Imports

import type { Theme, CursorPosition, EmitterOptions } from '../../types';
import { r, fmt, escapeXml } from './utils';


//#region Cursor Config

export interface CursorConfig {
  cursor: CursorPosition;
  charWidth: number;
  lineHeight: number;
  padding: number;
  contentStartY: number;
  fontSize: number;
  hasCustomLineHeight: boolean;
  cursorColor: string;
  cursorStyle: 'block' | 'bar' | 'underline';
  activeCursor: boolean;
  charUnderCursor?: string;
  backgroundColor?: string;
  fontFamily?: string;
}


//#region Cursor Rendering

export const renderCursor = (config: CursorConfig): string => {
  const {
    cursor,
    charWidth,
    lineHeight,
    padding,
    contentStartY,
    fontSize,
    cursorColor,
    cursorStyle,
    activeCursor,
    charUnderCursor,
    backgroundColor,
    fontFamily,
  } = config;

  const cursorX = r(padding + cursor.col * charWidth);
  const cursorY = r(contentStartY + cursor.row * lineHeight);
  // Cursor height matches lineHeight to align with text selection
  const cursorHeight = r(lineHeight);
  const cursorClass = activeCursor ? 'cursor-active' : 'cursor';

  const parts: string[] = [];
  parts.push('<g class="cursor-layer">');

  if (cursorStyle === 'block') {
    // Wrap cursor rect and inverted character in a group so they blink together
    parts.push(`<g class="${cursorClass}">`);
    parts.push(
      `<rect x="${fmt(cursorX)}" y="${fmt(cursorY)}" ` +
        `width="${fmt(charWidth)}" height="${fmt(cursorHeight)}" fill="${cursorColor}"/>`
    );
    // Render inverted character on top of block cursor (same position as text layer)
    if (charUnderCursor && charUnderCursor.trim() && backgroundColor) {
      const defaultFonts = "'SF Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace";
      const font = fontFamily ? `'${fontFamily}', monospace` : defaultFonts;
      parts.push(
        `<text x="${fmt(cursorX)}" y="${fmt(cursorY)}" fill="${backgroundColor}" ` +
          `font-family="${font}" font-size="${fontSize}" dominant-baseline="text-before-edge">${escapeXml(charUnderCursor)}</text>`
      );
    }
    parts.push('</g>');
  } else if (cursorStyle === 'bar') {
    parts.push(`<g class="${cursorClass}">`);
    parts.push(
      `<rect x="${fmt(cursorX)}" y="${fmt(cursorY)}" ` +
        `width="2" height="${fmt(cursorHeight)}" fill="${cursorColor}"/>`
    );
    parts.push('</g>');
  } else if (cursorStyle === 'underline') {
    const underlineY = r(cursorY + cursorHeight - 2);
    parts.push(`<g class="${cursorClass}">`);
    parts.push(
      `<rect x="${fmt(cursorX)}" y="${fmt(underlineY)}" ` +
        `width="${fmt(charWidth)}" height="2" fill="${cursorColor}"/>`
    );
    parts.push('</g>');
  }

  parts.push('</g>');
  return parts.join('\n');
};


//#region Selection Rendering

export interface SelectionConfig {
  start: number;
  end: number;
  row: number;
  charWidth: number;
  lineHeight: number;
  padding: number;
  contentStartY: number;
  selectionColor: string;
}

export const renderSelection = (config: SelectionConfig): string => {
  const {
    start,
    end,
    row,
    charWidth,
    lineHeight,
    padding,
    contentStartY,
    selectionColor,
  } = config;

  const selStart = Math.min(start, end);
  const selEnd = Math.max(start, end);
  const selectionX = r(padding + selStart * charWidth);
  const selectionY = r(contentStartY + row * lineHeight);
  const selectionWidth = r((selEnd - selStart) * charWidth);

  const parts: string[] = [];
  parts.push('<g class="selection-layer">');
  parts.push(
    `<rect x="${fmt(selectionX)}" y="${fmt(selectionY)}" ` +
      `width="${fmt(selectionWidth)}" height="${fmt(lineHeight)}" fill="${selectionColor}" opacity="0.5"/>`
  );
  parts.push('</g>');

  return parts.join('\n');
};

