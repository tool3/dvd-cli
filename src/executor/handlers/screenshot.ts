//#region Imports

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExecutorContext } from '../types';
import { shellfie, type shellfieOptions, type Theme as ShellfieTheme } from 'shellfie';


//#region Screenshot Handler

export const executeScreenshot = async (
  ctx: ExecutorContext,
  path?: string
): Promise<void> => {
  const screenshotPath = resolveScreenshotPath(ctx, path);
  const content = buildTerminalContent(ctx);
  const shellfieTheme = convertToShellfieTheme(ctx);
  const options = buildShellfieOptions(ctx, shellfieTheme);

  const svg = shellfie(content, options);
  writeFileSync(resolve(screenshotPath), svg, 'utf-8');
};


//#region Path Resolution

const resolveScreenshotPath = (ctx: ExecutorContext, path?: string): string => {
  if (path) return path;

  const baseName = ctx.outputPath?.replace(/\.svg$/, '') || 'screenshot';
  const screenshotPath = `${baseName}_screenshot_${ctx.screenshotCounter}.svg`;
  ctx.screenshotCounter++;

  return screenshotPath;
};


//#region Content Builder

const buildTerminalContent = (ctx: ExecutorContext): string => {
  const buffer = [...ctx.lines];
  const displayLine = ctx.isExecutingCommand
    ? ctx.currentLine
    : ctx.promptPrefix + ctx.currentLine;
  buffer[ctx.cursorY] = displayLine;

  return buffer.filter((line) => line !== undefined).join('\n');
};


//#region Theme Conversion

const convertToShellfieTheme = (ctx: ExecutorContext): ShellfieTheme => ({
  name: ctx.theme.name,
  background: ctx.theme.background,
  foreground: ctx.theme.foreground,
  cursor: ctx.theme.cursor ?? ctx.theme.foreground,
  selection: ctx.theme.selection ?? '#44475a',
  black: ctx.theme.black,
  red: ctx.theme.red,
  green: ctx.theme.green,
  yellow: ctx.theme.yellow,
  blue: ctx.theme.blue,
  magenta: ctx.theme.magenta,
  cyan: ctx.theme.cyan,
  white: ctx.theme.white,
  brightBlack: ctx.theme.brightBlack,
  brightRed: ctx.theme.brightRed,
  brightGreen: ctx.theme.brightGreen,
  brightYellow: ctx.theme.brightYellow,
  brightBlue: ctx.theme.brightBlue,
  brightMagenta: ctx.theme.brightMagenta,
  brightCyan: ctx.theme.brightCyan,
  brightWhite: ctx.theme.brightWhite,
});


//#region Options Builder

const buildShellfieOptions = (
  ctx: ExecutorContext,
  theme: ShellfieTheme
): shellfieOptions => {
  const options: shellfieOptions = {
    template: ctx.template as 'macos' | 'windows' | 'minimal',
    title: ctx.title,
    theme,
    fontSize: ctx.fontSize,
    watermark: ctx.watermark,
    embedFont: true,
  };

  if (!ctx.autoWidth) {
    options.width = ctx.width;
  }
  if (!ctx.autoHeight) {
    options.height = ctx.height;
  }

  if (ctx.headerBackground) {
    options.header = { backgroundColor: ctx.headerBackground };
  }

  return options;
};

