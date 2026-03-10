//#region Imports

import type { Theme, CursorPosition, EmitterOptions } from '../../types';
import { r, fmt } from './utils';


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
    hasCustomLineHeight,
    cursorColor,
    cursorStyle,
    activeCursor,
  } = config;

  const cursorX = r(padding + cursor.col * charWidth);
  const rowY = r(contentStartY + cursor.row * lineHeight);
  const cursorHeight = r(hasCustomLineHeight ? fontSize : lineHeight);
  const cursorYOffset = hasCustomLineHeight ? fontSize * 0.65 - cursorHeight / 2 : 0;
  const cursorY = r(rowY + cursorYOffset);
  const cursorClass = activeCursor ? 'cursor-active' : 'cursor';

  const parts: string[] = [];
  parts.push('<g class="cursor-layer">');

  if (cursorStyle === 'block') {
    parts.push(
      `<rect class="${cursorClass}" x="${fmt(cursorX)}" y="${fmt(cursorY)}" ` +
        `width="${fmt(charWidth)}" height="${fmt(cursorHeight)}" fill="${cursorColor}"/>`
    );
  } else if (cursorStyle === 'bar') {
    parts.push(
      `<rect class="${cursorClass}" x="${fmt(cursorX)}" y="${fmt(cursorY)}" ` +
        `width="2" height="${fmt(cursorHeight)}" fill="${cursorColor}"/>`
    );
  } else if (cursorStyle === 'underline') {
    const underlineY = r(cursorY + cursorHeight - 2);
    parts.push(
      `<rect class="${cursorClass}" x="${fmt(cursorX)}" y="${fmt(underlineY)}" ` +
        `width="${fmt(charWidth)}" height="2" fill="${cursorColor}"/>`
    );
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

