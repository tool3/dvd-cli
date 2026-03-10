//#region Imports

import type { ExecutorContext, CDExecutorOptions } from '../types';
import { sleep, stripAnsi } from '../types';
import { captureFrame } from '../frame-capture';


//#region Selection Helpers

export const hasSelection = (ctx: ExecutorContext): boolean =>
  ctx.selectionStart !== undefined &&
  ctx.selectionEnd !== undefined &&
  ctx.selectionStart !== ctx.selectionEnd;

export const clearSelection = (ctx: ExecutorContext): void => {
  ctx.selectionStart = undefined;
  ctx.selectionEnd = undefined;
};

export const deleteSelection = (ctx: ExecutorContext): boolean => {
  if (!hasSelection(ctx)) return false;

  const start = Math.min(ctx.selectionStart!, ctx.selectionEnd!);
  const end = Math.max(ctx.selectionStart!, ctx.selectionEnd!);

  const before = ctx.currentLine.substring(0, start);
  const after = ctx.currentLine.substring(end);

  ctx.currentLine = before + after;
  ctx.cursorX = start;
  clearSelection(ctx);

  return true;
};


//#region Type Handler

export const executeType = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  text: string,
  speed?: number
): Promise<void> => {
  const delay = speed || ctx.typingSpeed;

  if (hasSelection(ctx)) {
    deleteSelection(ctx);
    captureFrame(ctx, options, true, true);
    await sleep(delay);
  }

  for (const char of text) {
    if (char === '\n') {
      const prefix = ctx.isMultiLineContinuation ? '' : ctx.promptPrefix;
      ctx.lines[ctx.cursorY] = prefix + ctx.currentLine;
      ctx.cursorY++;
      ctx.cursorX = 0;
      ctx.currentLine = '';
      ctx.isMultiLineContinuation = true;

      if (!ctx.lines[ctx.cursorY]) {
        ctx.lines[ctx.cursorY] = '';
      }

      await sleep(delay);
      const captureStart = Date.now();
      captureFrame(ctx, options, true, true);
      ctx.captureOverhead += Date.now() - captureStart;
      continue;
    }

    const before = ctx.currentLine.substring(0, ctx.cursorX);
    const after = ctx.currentLine.substring(ctx.cursorX);
    ctx.currentLine = before + char + after;
    ctx.cursorX++;

    await sleep(delay);
    const captureStart = Date.now();
    captureFrame(ctx, options, true, true);
    ctx.captureOverhead += Date.now() - captureStart;
  }

  captureFrame(ctx, options, true, false);
};


//#region Backspace Handler

export const executeBackspace = async (
  ctx: ExecutorContext,
  options: CDExecutorOptions,
  count: number = 1
): Promise<void> => {
  const delay = ctx.typingSpeed;

  if (hasSelection(ctx)) {
    deleteSelection(ctx);
    await sleep(delay);
    captureFrame(ctx, options, true, true);
    return;
  }

  for (let i = 0; i < count; i++) {
    if (ctx.currentLine.length > 0 && ctx.cursorX > 0) {
      const before = ctx.currentLine.substring(0, ctx.cursorX - 1);
      const after = ctx.currentLine.substring(ctx.cursorX);
      ctx.currentLine = before + after;
      ctx.cursorX--;

      await sleep(delay);
      captureFrame(ctx, options, true, true);
    }
  }
};

