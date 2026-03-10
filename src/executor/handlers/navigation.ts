//#region Imports

import type { ExecutorContext, CDExecutorOptions } from '../types';
import { sleep, stripAnsi } from '../types';
import { captureFrame } from '../frame-capture';
import { hasSelection, clearSelection, deleteSelection } from './typing';


//#region Arrow Handler

export const executeArrow = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  direction: 'Left' | 'Right' | 'Up' | 'Down'
): Promise<void> => {
  switch (direction) {
    case 'Left':
      if (ctx.cursorX > 0) ctx.cursorX--;
      break;
    case 'Right':
      if (ctx.cursorX < ctx.currentLine.length) ctx.cursorX++;
      break;
    case 'Up':
      if (ctx.cursorY > 0) {
        ctx.cursorY--;
        ctx.currentLine = ctx.lines[ctx.cursorY] || '';
        ctx.cursorX = Math.min(ctx.cursorX, ctx.currentLine.length);
      }
      break;
    case 'Down':
      if (ctx.cursorY < ctx.lines.length - 1) {
        ctx.cursorY++;
        ctx.currentLine = ctx.lines[ctx.cursorY] || '';
        ctx.cursorX = Math.min(ctx.cursorX, ctx.currentLine.length);
      }
      break;
  }

  await sleep(50);
  captureFrame(ctx, options, true, true);
};


//#region Shortcut Handler

export const executeShortcut = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  ctrl: boolean,
  alt: boolean,
  shift: boolean,
  cmd: boolean,
  key: string
): Promise<void> => {
  const metaKey = cmd || ctrl;

  if (shift && !alt && !metaKey) {
    if (key === 'Left' || key === 'Right') {
      await executeSelectionMove(ctx, options, key === 'Right', shift);
    }
  } else if (alt && shift && !metaKey) {
    if (key === 'Left' || key === 'Right') {
      await executeWordSelection(ctx, options, key === 'Right');
    }
  } else if (alt && !shift && !metaKey) {
    if (key === 'Left' || key === 'Right') {
      await executeWordMove(ctx, options, key === 'Right');
    }
  } else if (metaKey && !alt && !shift) {
    if (key === 'Left' || key === 'Right') {
      await executeLineNavigation(ctx, options, key === 'Right');
    } else if (key === 'Backspace') {
      await executeWordDelete(ctx, options);
    }
  }
};


//#region Selection Movement

const executeSelectionMove = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  right: boolean,
  shift: boolean
): Promise<void> => {
  const strippedLine = stripAnsi(ctx.currentLine);

  if (!shift || (ctx.selectionStart === undefined && ctx.selectionEnd === undefined)) {
    ctx.selectionStart = ctx.cursorX;
    ctx.selectionEnd = ctx.cursorX;
  }

  if (right) {
    if (ctx.cursorX < strippedLine.length) ctx.cursorX++;
  } else {
    if (ctx.cursorX > 0) ctx.cursorX--;
  }

  if (shift) {
    ctx.selectionEnd = ctx.cursorX;
  } else {
    clearSelection(ctx);
  }

  await sleep(50);
  captureFrame(ctx, options, true, true);
};


//#region Word Movement

const executeWordMove = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  right: boolean
): Promise<void> => {
  clearSelection(ctx);
  const newPosition = findWordBoundary(right ? 'right' : 'left', ctx.cursorX, ctx.currentLine);
  ctx.cursorX = newPosition;

  await sleep(50);
  captureFrame(ctx, options, true, true);
};


//#region Word Selection

const executeWordSelection = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  right: boolean
): Promise<void> => {
  if (ctx.selectionStart === undefined) {
    ctx.selectionStart = ctx.cursorX;
    ctx.selectionEnd = ctx.cursorX;
  }

  const newPosition = findWordBoundary(right ? 'right' : 'left', ctx.cursorX, ctx.currentLine);
  ctx.cursorX = newPosition;
  ctx.selectionEnd = newPosition;

  await sleep(50);
  captureFrame(ctx, options, true, true);
};


//#region Line Navigation

const executeLineNavigation = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  toEnd: boolean
): Promise<void> => {
  clearSelection(ctx);
  ctx.cursorX = toEnd ? ctx.currentLine.length : 0;

  await sleep(50);
  captureFrame(ctx, options, true, true);
};


//#region Word Delete

const executeWordDelete = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions
): Promise<void> => {
  const wordStart = findWordBoundary('left', ctx.cursorX, ctx.currentLine);
  const deleteCount = ctx.cursorX - wordStart;

  if (deleteCount <= 0) return;

  const before = ctx.currentLine.substring(0, wordStart);
  const after = ctx.currentLine.substring(ctx.cursorX);
  ctx.currentLine = before + after;
  ctx.cursorX = wordStart;

  await sleep(50);
  captureFrame(ctx, options, true, true);
};


//#region Word Boundary

export const findWordBoundary = (
  direction: 'left' | 'right',
  position: number,
  text: string
): number => {
  const stripped = stripAnsi(text);

  if (direction === 'left') {
    if (position === 0) return 0;
    let pos = position - 1;

    while (pos > 0 && /\s/.test(stripped[pos])) pos--;

    if (/\w/.test(stripped[pos])) {
      while (pos > 0 && /\w/.test(stripped[pos - 1])) pos--;
    } else if (/\S/.test(stripped[pos])) {
      while (pos > 0 && /[^\w\s]/.test(stripped[pos - 1])) pos--;
    }

    return pos;
  } else {
    if (position >= stripped.length) return stripped.length;
    let pos = position;

    while (pos < stripped.length && /\s/.test(stripped[pos])) pos++;

    if (pos < stripped.length && /\w/.test(stripped[pos])) {
      while (pos < stripped.length && /\w/.test(stripped[pos])) pos++;
    } else if (pos < stripped.length && /\S/.test(stripped[pos])) {
      while (pos < stripped.length && /[^\w\s]/.test(stripped[pos])) pos++;
    }

    return pos;
  }
};

