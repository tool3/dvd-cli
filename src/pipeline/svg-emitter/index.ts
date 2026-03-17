//#region Imports

import type { SpanRow, CursorPosition, EmitterOptions } from '../../types';
import { coalesceBackgrounds, mergeVerticalBackgrounds, type RenderConfig } from '../coalescer';
import { fmt, escapeXml } from './utils';
import { generateStylesheet } from './stylesheet';
import { generateChrome, generateFooter } from './chrome';
import { renderCursor, renderSelection } from './cursor';
import { renderTextLayer } from './text-renderer';
import { emitAnimated as emitAnimatedImpl, type FrameData, type AnimatedSVGOptions } from './animated';


//#region Re-exports

export { styleToClasses, generateStylesheet, getColorClass, getColorFromClass } from './stylesheet';
export type { FrameData, AnimatedSVGOptions } from './animated';


//#region Types

export interface EmitResult {
  svg: string;
  width: number;
  height: number;
}


//#region Main Emitter

export const emit = (
  rows: SpanRow[],
  cursor: CursorPosition | null,
  cursorVisible: boolean,
  options: EmitterOptions
): EmitResult => {
  const { theme, template, width, height, fontSize, title, watermark } = options;
  const lineHeight = options.lineHeight ?? fontSize * 1.4;
  const charWidth = options.charWidth ?? fontSize * 0.6;
  const padding = options.padding ?? 16;
  const borderRadius = options.borderRadius ?? 8;
  const borderWidth = options.borderWidth ?? 0;
  const borderColor = options.borderColor ?? theme.foreground;
  const headerHeight = options.headerHeight ?? (template === 'minimal' ? 0 : 40);
  const footerHeight = options.footerHeight ?? 0;
  const watermarkContent = typeof watermark === 'string' ? watermark : watermark?.content;
  const isWatermarkMarkup = typeof watermark === 'object'
    ? (watermark.type === 'markup' || watermarkContent?.trimStart().startsWith('<'))
    : watermarkContent?.trimStart().startsWith('<');
  const watermarkHeight = watermarkContent ? lineHeight : 0;
  const contentStartY = headerHeight + padding;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push('<style>');
  parts.push(generateStylesheet(theme, options));
  parts.push('</style>');

  if (borderRadius > 0) {
    parts.push('<defs>');
    parts.push(
      `<clipPath id="rounded-corners">` +
        `<rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}"/>` +
        `</clipPath>`
    );
    parts.push('</defs>');
    parts.push(`<g clip-path="url(#rounded-corners)">`);
  }

  parts.push(
    `<rect class="window-bg" x="0" y="0" width="${width}" height="${height}" ` +
      `fill="${theme.background}" rx="${borderRadius}" ry="${borderRadius}"/>`
  );

  if (borderWidth > 0) {
    parts.push(
      `<rect x="${borderWidth / 2}" y="${borderWidth / 2}" ` +
        `width="${width - borderWidth}" height="${height - borderWidth}" ` +
        `fill="none" stroke="${borderColor}" stroke-width="${borderWidth}" ` +
        `rx="${borderRadius}" ry="${borderRadius}"/>`
    );
  }

  const chrome = generateChrome({
    template,
    width,
    height,
    headerHeight,
    padding,
    borderRadius,
    title,
    theme,
    headerBackground: options.headerBackground,
    headerBorder: options.headerBorder,
    headerBorderColor: options.headerBorderColor,
    headerBorderWidth: options.headerBorderWidth,
  });
  if (chrome) parts.push(`<g class="chrome">${chrome}</g>`);

  if (footerHeight > 0 || options.footerBackground) {
    const footer = generateFooter({
      width,
      height,
      footerHeight: footerHeight || 40,
      borderRadius,
      theme,
      footerBackground: options.footerBackground,
      footerBorder: options.footerBorder,
      footerBorderColor: options.footerBorderColor,
      footerBorderWidth: options.footerBorderWidth,
    });
    if (footer) parts.push(`<g class="footer">${footer}</g>`);
  }

  const renderConfig: RenderConfig = {
    charWidth,
    lineHeight,
    padding,
    headerHeight: contentStartY,
  };
  const bgRects = coalesceBackgrounds(rows, renderConfig);
  const mergedBgRects = mergeVerticalBackgrounds(bgRects);

  if (mergedBgRects.length > 0) {
    parts.push('<g class="bg-layer">');
    mergedBgRects.forEach((rect) => {
      parts.push(
        `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.width)}" height="${fmt(rect.height)}" fill="${rect.color}"/>`
      );
    });
    parts.push('</g>');
  }

  parts.push(
    renderTextLayer(rows, {
      charWidth,
      lineHeight,
      padding,
      contentStartY,
      fontSize,
      theme,
    })
  );

  if (options.selection) {
    parts.push(
      renderSelection({
        ...options.selection,
        charWidth,
        lineHeight,
        padding,
        contentStartY,
        selectionColor: theme.selection ?? '#44475a',
        fontSize,
        hasCustomLineHeight: options.hasCustomLineHeight,
      })
    );
  }

  if (cursor && cursorVisible) {
    const hasCustomLineHeight = options.hasCustomLineHeight ?? false;
    // Find character under cursor for block cursor inversion
    let charUnderCursor: string | undefined;
    const cursorRow = rows[cursor.row];
    if (cursorRow) {
      for (const span of cursorRow) {
        const spanEnd = span.col + span.text.length;
        if (cursor.col >= span.col && cursor.col < spanEnd) {
          charUnderCursor = span.text[cursor.col - span.col];
          break;
        }
      }
    }
    parts.push(
      renderCursor({
        cursor,
        charWidth,
        lineHeight,
        padding,
        contentStartY,
        fontSize,
        hasCustomLineHeight,
        cursorColor: options.cursorColor ?? theme.cursor ?? theme.foreground,
        cursorStyle: options.cursorStyle ?? 'block',
        activeCursor: options.activeCursor ?? false,
        charUnderCursor,
        backgroundColor: theme.background,
        fontFamily: options.fontFamily,
      })
    );
  }

  if (watermarkContent) {
    const watermarkY = height - padding - watermarkHeight / 2;
    const watermarkX = width - padding;
    const wmFontSize = Math.round(fontSize * 0.75);
    const defaultFonts = "'SF Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace";
    const fontFamily = options.fontFamily ? `'${options.fontFamily}', monospace` : defaultFonts;

    if (options.footerBackground) {
      parts.push(
        `<rect x="0" y="${height - watermarkHeight - padding}" width="${width}" ` +
          `height="${watermarkHeight + padding}" fill="${options.footerBackground}"/>`
      );
    }

    if (isWatermarkMarkup) {
      // Scale markup watermarks relative to a reference width (320px is shellfie's typical width)
      const referenceWidth = 320;
      const scale = Math.min(1, width / referenceWidth);
      const scaleTransform = scale < 1 ? ` scale(${scale.toFixed(3)})` : '';
      parts.push(
        `<g transform="translate(${watermarkX}, ${watermarkY})${scaleTransform}" font-family="${fontFamily}" font-size="${wmFontSize}" fill="${theme.foreground}">${watermarkContent}</g>`
      );
    } else {
      parts.push(
        `<text class="text dim" x="${watermarkX}" y="${watermarkY}" ` +
          `text-anchor="end" fill="${theme.foreground}">${escapeXml(watermarkContent)}</text>`
      );
    }
  }

  if (borderRadius > 0) parts.push('</g>');
  parts.push('</svg>');

  return { svg: parts.join('\n'), width, height };
};


//#region Animated Emitter

export const emitAnimated = (
  frames: FrameData[],
  options: AnimatedSVGOptions
): EmitResult => {
  return emitAnimatedImpl(frames, options, emit);
};

