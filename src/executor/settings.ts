//#region Imports

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ExecutorContext } from './types';
import { parseEscapes } from './types';
import { themes as pipelineThemes } from '../pipeline';
import { themes as shellfieThemes } from 'shellfie';


//#region Setting Application

export const applySetting = (ctx: ExecutorContext, key: string, value: string): void => {
  const handlers: Record<string, () => void> = {
    Width: () => {
      ctx.width = parseInt(value, 10);
      ctx.autoWidth = false;
    },
    Height: () => {
      ctx.height = parseInt(value, 10);
      ctx.autoHeight = false;
    },
    FontSize: () => {
      ctx.fontSize = parseInt(value, 10);
    },
    LineHeight: () => {
      ctx.lineHeight = parseFloat(value);
      ctx.hasCustomLineHeight = true;
    },
    TypingSpeed: () => {
      ctx.typingSpeed = parseInt(value, 10);
    },
    Title: () => {
      ctx.title = value;
    },
    Template: () => {
      ctx.template = value as 'macos' | 'windows' | 'minimal';
    },
    Theme: () => {
      resolveTheme(ctx, value);
    },
    PromptPrefix: () => {
      ctx.promptPrefix = parseEscapes(value);
    },
    Watermark: () => {
      ctx.watermark = parseEscapes(value);
    },
    CursorBlink: () => {
      ctx.cursorBlink = value.toLowerCase() !== 'false';
    },
    Scroll: () => {
      ctx.scroll = value.toLowerCase() === 'true';
      if (ctx.scroll) ctx.autoHeight = false;
    },
    HeaderBackground: () => {
      ctx.headerBackground = value;
    },
    FooterBackground: () => {
      ctx.footerBackground = value;
    },
    BorderColor: () => {
      ctx.borderColor = value;
    },
    BorderWidth: () => {
      ctx.borderWidth = parseInt(value, 10);
    },
    BorderRadius: () => {
      ctx.borderRadius = parseInt(value, 10);
    },
    Padding: () => {
      ctx.padding = parseInt(value, 10);
    },
    HeaderHeight: () => {
      ctx.headerHeight = parseInt(value, 10);
    },
    HeaderBorder: () => {
      ctx.headerBorder = value.toLowerCase() === 'true';
    },
    HeaderBorderColor: () => {
      ctx.headerBorderColor = value;
    },
    HeaderBorderWidth: () => {
      ctx.headerBorderWidth = parseInt(value, 10);
    },
    FooterHeight: () => {
      ctx.footerHeight = parseInt(value, 10);
    },
    FooterBorder: () => {
      ctx.footerBorder = value.toLowerCase() === 'true';
    },
    FooterBorderColor: () => {
      ctx.footerBorderColor = value;
    },
    FooterBorderWidth: () => {
      ctx.footerBorderWidth = parseInt(value, 10);
    },
    CursorStyle: () => {
      const style = value.toLowerCase();
      if (style === 'block' || style === 'bar' || style === 'underline') {
        ctx.cursorStyle = style;
      }
    },
    CursorColor: () => {
      ctx.cursorColor = value;
    },
    FontFamily: () => {
      ctx.fontFamily = value;
    },
    EmbedFont: () => {
      embedFontFromPath(ctx, value);
    },
    Shell: () => {
      ctx.shell = value;
    },
    CharWidthRatio: () => {
      ctx.charWidthRatio = parseFloat(value);
    },
    AnimationSpeed: () => {
      ctx.animationSpeed = parseInt(value, 10);
    },
  };

  const handler = handlers[key];
  if (handler) handler();
};


//#region Theme Resolution

export const resolveTheme = (ctx: ExecutorContext, themeName: string): void => {
  const pipelineTheme = pipelineThemes[themeName as keyof typeof pipelineThemes];
  if (pipelineTheme) {
    ctx.theme = pipelineTheme;
    return;
  }

  let name = themeName as keyof typeof shellfieThemes;
  if (!shellfieThemes[name]) {
    const camelCase = themeName.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase()
    ) as keyof typeof shellfieThemes;
    if (shellfieThemes[camelCase]) {
      name = camelCase;
    }
  }

  if (shellfieThemes[name]) {
    const st = shellfieThemes[name];
    ctx.theme = {
      name: themeName,
      background: st.background,
      foreground: st.foreground,
      cursor: st.cursor,
      selection: st.selection,
      black: st.black,
      red: st.red,
      green: st.green,
      yellow: st.yellow,
      blue: st.blue,
      magenta: st.magenta,
      cyan: st.cyan,
      white: st.white,
      brightBlack: st.brightBlack,
      brightRed: st.brightRed,
      brightGreen: st.brightGreen,
      brightYellow: st.brightYellow,
      brightBlue: st.brightBlue,
      brightMagenta: st.brightMagenta,
      brightCyan: st.brightCyan,
      brightWhite: st.brightWhite,
    };
  }
};


//#region Font Embedding

export const embedFontFromPath = (ctx: ExecutorContext, fontPath: string): void => {
  try {
    const resolvedPath = resolve(fontPath);

    if (!existsSync(resolvedPath)) {
      console.warn(`Font file not found: ${resolvedPath}`);
      return;
    }

    const fontBuffer = readFileSync(resolvedPath);
    ctx.fontData = fontBuffer.toString('base64');
    ctx.embedFont = true;
  } catch (err) {
    console.warn(`Failed to embed font: ${err}`);
  }
};

