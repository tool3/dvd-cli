//#region Imports

import type { SpanRow, Theme, EmitterOptions, Gradient } from '../../types';
import type { WatermarkConfig } from 'shellfie';
import { fmt, escapeXml, extractWatermarkDefs, getEffectiveLineHeight, getTextOffsetY, getCursorYOffset } from './utils';
import type { EmitResult } from './index';
import type { FrameData } from './animated';
import { containsCustomGlyphs, isCustomGlyph, renderCustomGlyph, type GlyphContext } from '../customGlyphs';
import { getCharWidth } from '../../utils/wcwidth';


//#region Types

export interface FilmstripOptions extends EmitterOptions {
  fps?: number;
  loop?: boolean;
  pauseAtEnd?: number;
  loopPause?: number;
  loopStyle?: 'loop' | 'reverse' | 'rewind' | 'fade';
  fadeDuration?: number;
  rewindSpeed?: number;
  customGlyphs?: boolean;
  showCursor?: boolean;
}


//#region Gradient Helpers

const isGradient = (value: unknown): value is Gradient => {
  return typeof value === 'object' && value !== null && (value as Gradient).type === 'gradient';
};

const getGradientCoords = (direction: 'horizontal' | 'vertical' | 'diagonal'): { x1: string; y1: string; x2: string; y2: string } => {
  switch (direction) {
    case 'horizontal':
      return { x1: '0%', y1: '0%', x2: '100%', y2: '0%' };
    case 'diagonal':
      return { x1: '0%', y1: '0%', x2: '100%', y2: '100%' };
    case 'vertical':
    default:
      return { x1: '0%', y1: '0%', x2: '0%', y2: '100%' };
  }
};

const generateGradientDef = (gradient: Gradient, id: string): string => {
  const direction = gradient.direction ?? 'vertical';
  const { x1, y1, x2, y2 } = getGradientCoords(direction);
  const colors = gradient.reverse ? [...gradient.colors].reverse() : gradient.colors;
  const stops = colors.map((color, i) => {
    const offset = colors.length === 1 ? 50 : (i / (colors.length - 1)) * 100;
    return `<stop offset="${offset}%" stop-color="${color}"/>`;
  }).join('');
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
};


//#region Frame Analysis

interface UniqueFrame {
  frame: FrameData;
  frameIndex: number;
  timestamp: number;
}

const hashStyleFlags = (style: { bold: boolean; italic: boolean; underline: boolean; dim: boolean; strikethrough: boolean }): string => {
  let flags = '';
  if (style.bold) flags += 'b';
  if (style.italic) flags += 'i';
  if (style.underline) flags += 'u';
  if (style.dim) flags += 'd';
  if (style.strikethrough) flags += 's';
  return flags;
};

const getTextStyleClasses = (style: { bold: boolean; italic: boolean; underline: boolean; dim: boolean; strikethrough: boolean }): string[] => {
  const classes: string[] = [];
  if (style.bold) classes.push('bold');
  if (style.italic) classes.push('italic');
  if (style.underline) classes.push('uline');
  if (style.dim) classes.push('dim');
  if (style.strikethrough) classes.push('strike');
  return classes;
};

const hashFrameContent = (frame: FrameData): string => {
  const cursorStr = frame.cursor ? `${frame.cursor.row},${frame.cursor.col},${frame.cursorVisible},${frame.activeCursor}` : 'null';
  const rowsStr = frame.rows.map(row =>
    row.map(span => `${span.col}:${span.text}:${span.style.fg || ''}:${span.style.bg || ''}:${hashStyleFlags(span.style)}`).join('|')
  ).join('\n');
  return `${cursorStr}::${rowsStr}`;
};

const analyzeFrames = (frames: FrameData[]): UniqueFrame[] => {
  if (frames.length === 0) return [];

  const result: UniqueFrame[] = [];
  let lastContentHash = '';

  for (let i = 0; i < frames.length; i++) {
    const hash = hashFrameContent(frames[i]);
    if (hash !== lastContentHash) {
      result.push({
        frame: frames[i],
        frameIndex: result.length,
        timestamp: frames[i].timestamp,
      });
      lastContentHash = hash;
    }
  }

  return result;
};


//#region Row Rendering

// Render a row's content as inline SVG elements (no <symbol>/<use> indirection).
// All colors are inline fill= attributes for zero CSS overhead on frame switches.
const renderRow = (
  row: SpanRow,
  rowIndex: number,
  config: {
    charWidth: number;
    lineHeight: number;
    padding: number;
    contentStartY: number;
    fontSize: number;
    theme: Theme;
    customGlyphs: boolean;
  }
): string | null => {
  const hasContent = row.some(span => {
    if (span.text.trim().length > 0) return true;
    if (span.style.bg) return true;
    return false;
  });
  if (!hasContent) return null;

  const { charWidth, lineHeight, padding, contentStartY, fontSize, theme, customGlyphs } = config;
  const cellY = contentStartY + rowIndex * lineHeight;
  const cursorYOffset = getCursorYOffset(lineHeight, fontSize);
  const cursorY = cellY + cursorYOffset;
  const textOffsetY = getTextOffsetY(lineHeight, fontSize);
  const textY = cursorY + textOffsetY;

  const glyphLineWidth = Math.max(1, fontSize * 0.08);
  const glyphHeavyLineWidth = glyphLineWidth * 2;

  const parts: string[] = [];

  // Background rects
  row.forEach((span) => {
    if (!span.style.bg) return;
    const bgX = fmt(padding + span.col * charWidth);
    const bgWidth = fmt(span.width * charWidth);
    parts.push(
      `<rect x="${bgX}" y="${fmt(cellY)}" width="${bgWidth}" height="${fmt(lineHeight)}" fill="${span.style.bg}"/>`
    );
  });

  // Text
  row.forEach((span) => {
    const rawText = span.text;
    if (!rawText) return;

    let color = theme.foreground;
    if (span.style.fg) {
      color = span.style.fg;
    }

    const styleClasses = getTextStyleClasses(span.style);
    const classAttr = styleClasses.length > 0 ? ` class="${styleClasses.join(' ')}"` : '';

    if (customGlyphs && containsCustomGlyphs(rawText)) {
      let colOffset = 0;
      [...rawText].forEach((char) => {
        const codePoint = char.codePointAt(0);
        const absoluteCol = span.col + colOffset;
        const charX = padding + absoluteCol * charWidth;
        const charDisplayWidth = getCharWidth(char);

        if (codePoint !== undefined && isCustomGlyph(codePoint)) {
          const glyphCtx: GlyphContext = {
            cellWidth: charWidth,
            cellHeight: lineHeight,
            x: charX,
            y: cellY,
            color,
            backgroundColor: theme.background,
            lineWidth: glyphLineWidth,
            heavyLineWidth: glyphHeavyLineWidth,
            colorClass: '',
          };
          const result = renderCustomGlyph(char, glyphCtx);
          if (result.handled) {
            parts.push(result.svg);
            colOffset += charDisplayWidth;
            return;
          }
        }
        parts.push(
          `<text x="${fmt(charX)}" y="${fmt(textY)}" fill="${color}"${classAttr}>${escapeXml(char)}</text>`
        );
        colOffset += charDisplayWidth;
      });
    } else {
      const x = fmt(padding + span.col * charWidth);
      const safeText = escapeXml(rawText);
      parts.push(`<text x="${x}" y="${fmt(textY)}" fill="${color}"${classAttr}>${safeText}</text>`);
    }
  });

  return parts.join('');
};


//#region Filmstrip Emitter

export const emitFilmstrip = (
  frames: FrameData[],
  options: FilmstripOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _staticEmit: unknown
): EmitResult => {
  if (frames.length === 0) {
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', width: 0, height: 0 };
  }

  // Analyze frames to find unique visual states
  const uniqueFrames = analyzeFrames(frames);

  const { theme, template, width, height, fontSize } = options;
  const lineHeight = options.lineHeight ?? fontSize * 1.4;
  const charWidth = options.charWidth ?? fontSize * 0.6;
  const padding = options.padding ?? 16;
  const borderRadius = options.borderRadius ?? 8;
  const headerHeight = options.headerHeight ?? (template === 'minimal' ? 0 : 40);
  const contentStartY = headerHeight + padding;
  const loop = options.loop ?? true;
  const pauseAtEnd = options.pauseAtEnd ?? 0;
  const loopPause = options.loopPause ?? 0;
  const loopStyle = options.loopStyle ?? 'loop';
  const fadeDuration = options.fadeDuration ?? 1500;
  const rewindSpeed = options.rewindSpeed ?? 5;

  // Background padding
  const bgPadding = options.backgroundPadding ?? 0;
  const bgRadius = options.backgroundRadius ?? 12;
  const totalWidth = width + bgPadding * 2;
  const totalHeight = height + bgPadding * 2;
  const hasBackground = !!(options.background && bgPadding > 0);

  const lastFrame = frames[frames.length - 1];
  const forwardDuration = lastFrame.timestamp + pauseAtEnd;

  // Calculate total duration based on loop style
  let totalDuration: number;
  if (loopStyle === 'reverse') {
    totalDuration = forwardDuration + lastFrame.timestamp + loopPause;
  } else if (loopStyle === 'rewind') {
    totalDuration = forwardDuration + (lastFrame.timestamp / rewindSpeed) + loopPause;
  } else if (loopStyle === 'fade') {
    totalDuration = forwardDuration + fadeDuration + loopPause;
  } else {
    totalDuration = forwardDuration + loopPause;
  }

  const customGlyphs = options.customGlyphs ?? true;
  const showCursor = options.showCursor ?? true;

  const rowConfig = {
    charWidth,
    lineHeight,
    padding,
    contentStartY,
    fontSize,
    theme,
    customGlyphs,
  };

  // Extract watermark content and defs
  const rawWatermarkContent = typeof options.watermark === 'string' ? options.watermark : (options.watermark as WatermarkConfig)?.content;
  const isWatermarkMarkup = typeof options.watermark === 'object'
    ? ((options.watermark as WatermarkConfig).type === 'markup' || rawWatermarkContent?.trimStart().startsWith('<'))
    : rawWatermarkContent?.trimStart().startsWith('<');

  let watermarkDefs = '';
  let watermarkContent = rawWatermarkContent;
  if (isWatermarkMarkup && rawWatermarkContent) {
    const extracted = extractWatermarkDefs(rawWatermarkContent);
    watermarkDefs = extracted.defs;
    watermarkContent = extracted.content;
  }

  // Build SVG
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`);

  // Defs: gradients + watermark defs only (no symbols)
  const hasDefs = (hasBackground && isGradient(options.background)) || watermarkDefs || (borderRadius > 0);
  if (hasDefs) {
    parts.push('<defs>');
    if (hasBackground && isGradient(options.background)) {
      parts.push(generateGradientDef(options.background, 'bg-gradient'));
    }
    if (watermarkDefs) {
      parts.push(watermarkDefs);
    }
    parts.push('</defs>');
  }

  // Style — minimal: font + text decorations + cursor blink. No color classes.
  parts.push('<style>');

  if (options.embedFont && options.fontData) {
    parts.push(`@font-face{font-family:'DVDMono';src:url(data:font/woff2;base64,${options.fontData}) format('woff2');font-weight:400;font-style:normal;font-display:block}`);
  }

  const defaultFonts = "'SF Mono',Monaco,Consolas,Menlo,monospace";
  const fontFamily = options.embedFont && options.fontData
    ? "'DVDMono',monospace"
    : options.fontFamily ? `'${options.fontFamily}',${defaultFonts}` : defaultFonts;
  const letterSpacingStyle = options.letterSpacing ? `letter-spacing:${options.letterSpacing}px;` : '';
  parts.push(`text{font-family:${fontFamily};font-size:${fontSize}px;dominant-baseline:text-before-edge;white-space:pre;${letterSpacingStyle}}`);

  parts.push('.bold{font-weight:700}.italic{font-style:italic}.uline{text-decoration:underline}.strike{text-decoration:line-through}.dim{opacity:0.5}');

  const cursorBlink = options.cursorBlink !== false;
  if (cursorBlink) {
    parts.push(`@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}.cursor{animation:blink 1s step-end infinite;mix-blend-mode:difference}.cursor-active{opacity:1;mix-blend-mode:difference}`);
  } else {
    parts.push(`.cursor,.cursor-active{mix-blend-mode:difference}`);
  }
  parts.push('</style>');

  // Outer background
  if (hasBackground) {
    const bgFill = isGradient(options.background) ? 'url(#bg-gradient)' : options.background;
    parts.push(`<rect width="${totalWidth}" height="${totalHeight}" rx="${bgRadius}" fill="${bgFill}"/>`);
  }

  // Terminal window group
  parts.push(`<g transform="translate(${bgPadding},${bgPadding})">`);

  // Terminal background
  parts.push(`<rect width="${width}" height="${height}" rx="${borderRadius}" fill="${theme.background}"/>`);

  // Window chrome (header)
  if (template !== 'minimal' && headerHeight > 0) {
    const headerBg = options.headerBackground || theme.background;
    parts.push(`<rect width="${width}" height="${headerHeight}" rx="${borderRadius}" fill="${headerBg}"/>`);
    parts.push(`<rect y="${headerHeight - borderRadius}" width="${width}" height="${borderRadius}" fill="${headerBg}"/>`);

    if (template === 'macos') {
      const buttonY = headerHeight / 2;
      const buttonR = 6;
      const buttonSpacing = 20;
      const buttonStartX = 16;
      parts.push(`<circle cx="${buttonStartX}" cy="${buttonY}" r="${buttonR}" fill="#ff5f56"/>`);
      parts.push(`<circle cx="${buttonStartX + buttonSpacing}" cy="${buttonY}" r="${buttonR}" fill="#ffbd2e"/>`);
      parts.push(`<circle cx="${buttonStartX + buttonSpacing * 2}" cy="${buttonY}" r="${buttonR}" fill="#27c93f"/>`);
    }

    if (options.title) {
      parts.push(`<text x="${width / 2}" y="${headerHeight / 2}" text-anchor="middle" dominant-baseline="middle" fill="${theme.foreground}" font-size="${fontSize}">${escapeXml(options.title)}</text>`);
    }

    if (options.headerBorder === true) {
      const borderColor = options.headerBorderColor || 'rgba(255,255,255,0.1)';
      const borderW = options.headerBorderWidth || 1;
      parts.push(`<line x1="0" y1="${headerHeight}" x2="${width}" y2="${headerHeight}" stroke="${borderColor}" stroke-width="${borderW}"/>`);
    }
  }

  // Content clip
  const contentHeight = height - headerHeight;
  parts.push(`<clipPath id="content-clip"><rect x="0" y="${headerHeight}" width="${width}" height="${contentHeight}"/></clipPath>`);
  parts.push(`<g clip-path="url(#content-clip)">`);

  // SMIL visibility animation: each frame is a <g> at position (0,0), only one
  // visible at a time via <animate attributeName="visibility" calcMode="discrete">.
  // Hidden groups are skipped entirely by the renderer — no paint, no composite.
  // All content is inline (no <symbol>/<use> indirection) for zero DOM lookup overhead.
  // This matches master's proven smooth 60/120fps mobile performance.
  const animDurationS = (totalDuration / 1000).toFixed(3);
  const smilRepeat = loop ? 'indefinite' : '1';

  // Pre-compute SMIL visibility schedules
  const smilAnimations = generateSMILAnimations(uniqueFrames, {
    loopStyle,
    forwardDuration,
    totalDuration,
    fadeDuration,
    rewindSpeed,
    loopPause,
  });

  // Render each frame as inline content in a visibility-toggled <g>
  uniqueFrames.forEach(({ frame, frameIndex }) => {
    const isFirst = frameIndex === 0;
    const initialVis = isFirst ? 'visible' : 'hidden';

    parts.push(`<g visibility="${initialVis}">`);

    // Inline row content — no symbol/use, flat DOM
    frame.rows.forEach((row) => {
      if (row.length === 0) return;
      const rowIdx = row[0].row;
      const rendered = renderRow(row, rowIdx, rowConfig);
      if (rendered) parts.push(rendered);
    });

    // Selection
    if (frame.selection) {
      const { start, end, row } = frame.selection;
      const selStart = Math.min(start, end);
      const selEnd = Math.max(start, end);
      const selectionX = padding + selStart * charWidth;
      const selectionY = contentStartY + row * lineHeight;
      const selectionWidth = (selEnd - selStart) * charWidth;
      const selectionColor = theme.selection ?? '#44475a';
      parts.push(
        `<rect x="${fmt(selectionX)}" y="${fmt(selectionY)}" width="${fmt(selectionWidth)}" height="${fmt(lineHeight)}" fill="${selectionColor}" opacity="0.5"/>`
      );
    }

    // Cursor
    if (showCursor && frame.cursor && frame.cursorVisible) {
      const cursorX = padding + frame.cursor.col * charWidth;
      const effectiveCursorHeight = getEffectiveLineHeight(lineHeight, fontSize);
      const cursorYOffset = getCursorYOffset(lineHeight, fontSize);
      const cursorY = contentStartY + frame.cursor.row * lineHeight + cursorYOffset;
      const cursorColor = options.cursorColor ?? theme.cursor ?? theme.foreground;
      const cursorStyleType = options.cursorStyle ?? 'block';
      const cursorClassName = frame.activeCursor ? 'cursor-active' : 'cursor';
      const cursorClass = ` class="${cursorClassName}"`;

      if (cursorStyleType === 'block') {
        parts.push(`<rect${cursorClass} x="${fmt(cursorX)}" y="${fmt(cursorY)}" width="${fmt(charWidth)}" height="${fmt(effectiveCursorHeight)}" fill="${cursorColor}"/>`);
      } else if (cursorStyleType === 'bar') {
        parts.push(`<rect${cursorClass} x="${fmt(cursorX)}" y="${fmt(cursorY)}" width="2" height="${fmt(effectiveCursorHeight)}" fill="${cursorColor}"/>`);
      } else {
        const underlineY = cursorY + effectiveCursorHeight - 2;
        parts.push(`<rect${cursorClass} x="${fmt(cursorX)}" y="${fmt(underlineY)}" width="${fmt(charWidth)}" height="2" fill="${cursorColor}"/>`);
      }
    }

    // SMIL visibility animation
    const smil = smilAnimations[frameIndex];
    if (smil) {
      parts.push(`<animate attributeName="visibility" values="${smil.values}" keyTimes="${smil.keyTimes}" dur="${animDurationS}s" repeatCount="${smilRepeat}" calcMode="discrete" fill="freeze"/>`);
    }

    parts.push('</g>');
  });

  parts.push('</g>'); // content clip group

  // Fade overlay — outside content clip, matches terminal border radius
  if (loopStyle === 'fade') {
    const fadeStartNorm = forwardDuration / totalDuration;
    const fadeEndNorm = (forwardDuration + fadeDuration) / totalDuration;
    const fadeKeyTimes = `0;${fmtKeyTime(fadeStartNorm)};${fmtKeyTime(fadeEndNorm)};1`;
    const fadeValues = '0;0;1;1';
    const rxAttr = borderRadius > 0 ? ` rx="${borderRadius}"` : '';
    parts.push(`<rect width="${width}" height="${height}" fill="${theme.background}"${rxAttr} opacity="0"><animate attributeName="opacity" values="${fadeValues}" keyTimes="${fadeKeyTimes}" dur="${animDurationS}s" repeatCount="${smilRepeat}" fill="freeze"/></rect>`);
  }

  // Watermark
  if (watermarkContent) {
    const watermarkHeight = lineHeight;
    const watermarkY = height - padding - watermarkHeight / 2;
    const watermarkX = width - padding;
    const wmFontSize = Math.round(fontSize * 0.75);

    if (isWatermarkMarkup) {
      parts.push(
        `<g transform="translate(${watermarkX}, ${watermarkY})" font-family="${fontFamily}" font-size="${wmFontSize}" fill="${theme.foreground}">${watermarkContent}</g>`
      );
    } else {
      parts.push(
        `<text class="dim" x="${watermarkX}" y="${watermarkY}" ` +
          `text-anchor="end" dominant-baseline="middle" fill="${theme.foreground}" font-size="${wmFontSize}">${escapeXml(watermarkContent)}</text>`
      );
    }
  }

  parts.push('</g>'); // terminal window group
  parts.push('</svg>');

  return { svg: parts.join(''), width: totalWidth, height: totalHeight };
};


//#region SMIL Visibility Animation

interface KeyframeOptions {
  loopStyle: 'loop' | 'reverse' | 'rewind' | 'fade';
  forwardDuration: number;
  totalDuration: number;
  fadeDuration: number;
  rewindSpeed: number;
  loopPause: number;
}

interface SMILAnimation {
  values: string;
  keyTimes: string;
}

const fmtKeyTime = (t: number): string => {
  if (t <= 0) return '0';
  if (t >= 1) return '1';
  return parseFloat(t.toFixed(6)).toString();
};

// Generate per-frame SMIL visibility animations.
// Each frame gets its own <animate attributeName="visibility"> with discrete switching.
// Hidden <g> groups are skipped entirely by the renderer — the browser doesn't paint
// or composite them, making this the fastest SVG animation method on mobile.
const generateSMILAnimations = (
  uniqueFrames: UniqueFrame[],
  options: KeyframeOptions
): SMILAnimation[] => {
  if (uniqueFrames.length === 0) return [];

  const { loopStyle, forwardDuration, totalDuration } = options;
  const result: SMILAnimation[] = [];

  if (loopStyle === 'reverse' || loopStyle === 'rewind') {
    const lastTimestamp = uniqueFrames[uniqueFrames.length - 1].timestamp;
    const speedMultiplier = loopStyle === 'rewind' ? options.rewindSpeed : 1;

    for (let i = 0; i < uniqueFrames.length; i++) {
      const times: number[] = [];
      const values: string[] = [];

      const forwardStart = uniqueFrames[i].timestamp / totalDuration;
      const forwardEnd = i < uniqueFrames.length - 1
        ? uniqueFrames[i + 1].timestamp / totalDuration
        : forwardDuration / totalDuration;

      const reverseFrameStart = i < uniqueFrames.length - 1
        ? (lastTimestamp - uniqueFrames[i + 1].timestamp) / speedMultiplier
        : 0;
      const reverseFrameEnd = (lastTimestamp - uniqueFrames[i].timestamp) / speedMultiplier;
      const reverseStart = (forwardDuration + reverseFrameStart) / totalDuration;
      const reverseEnd = (forwardDuration + reverseFrameEnd) / totalDuration;

      if (i === 0) {
        times.push(0); values.push('visible');
        if (uniqueFrames.length > 1) { times.push(forwardEnd); values.push('hidden'); }
        times.push(reverseStart); values.push('visible');
        times.push(1); values.push('visible');
      } else if (i === uniqueFrames.length - 1) {
        times.push(0); values.push('hidden');
        times.push(forwardStart); values.push('visible');
        times.push(reverseEnd); values.push('hidden');
        times.push(1); values.push('hidden');
      } else {
        times.push(0); values.push('hidden');
        times.push(forwardStart); values.push('visible');
        times.push(forwardEnd); values.push('hidden');
        times.push(reverseStart); values.push('visible');
        times.push(reverseEnd); values.push('hidden');
        times.push(1); values.push('hidden');
      }

      result.push({
        values: values.join(';'),
        keyTimes: times.map(fmtKeyTime).join(';'),
      });
    }
  } else if (loopStyle === 'fade') {
    for (let i = 0; i < uniqueFrames.length; i++) {
      const times: number[] = [];
      const values: string[] = [];
      const start = uniqueFrames[i].timestamp / totalDuration;
      const end = i < uniqueFrames.length - 1
        ? uniqueFrames[i + 1].timestamp / totalDuration
        : forwardDuration / totalDuration;

      if (i === 0) {
        times.push(0); values.push('visible');
        if (uniqueFrames.length > 1) { times.push(end); values.push('hidden'); }
        times.push(1); values.push('hidden');
      } else if (i === uniqueFrames.length - 1) {
        times.push(0); values.push('hidden');
        times.push(start); values.push('visible');
        times.push(1); values.push('visible');
      } else {
        times.push(0); values.push('hidden');
        times.push(start); values.push('visible');
        times.push(end); values.push('hidden');
        times.push(1); values.push('hidden');
      }

      result.push({
        values: values.join(';'),
        keyTimes: times.map(fmtKeyTime).join(';'),
      });
    }
  } else {
    // Simple loop
    for (let i = 0; i < uniqueFrames.length; i++) {
      const times: number[] = [];
      const values: string[] = [];
      const start = uniqueFrames[i].timestamp / totalDuration;
      const end = i < uniqueFrames.length - 1
        ? uniqueFrames[i + 1].timestamp / totalDuration
        : 1;

      if (i === 0) {
        times.push(0); values.push('visible');
        if (uniqueFrames.length > 1) { times.push(end); values.push('hidden'); }
        times.push(1); values.push('hidden');
      } else if (i === uniqueFrames.length - 1) {
        times.push(0); values.push('hidden');
        times.push(start); values.push('visible');
        times.push(1); values.push('visible');
      } else {
        times.push(0); values.push('hidden');
        times.push(start); values.push('visible');
        times.push(end); values.push('hidden');
        times.push(1); values.push('hidden');
      }

      result.push({
        values: values.join(';'),
        keyTimes: times.map(fmtKeyTime).join(';'),
      });
    }
  }

  return result;
};
