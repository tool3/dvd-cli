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
  // When true, render block elements (▀▄█) as geometric shapes for seamless display
  // When false (default), render as text for smaller file size with anti-aliasing
  customGlyphs?: boolean;
  // When true (default), render cursor in animation frames based on frame state
  // When false, never render cursor (matches svg-term behavior)
  showCursor?: boolean;
}

interface SymbolRegistry {
  // Map from row content hash to symbol ID (numeric)
  rowSymbols: Map<string, number>;
  // Map from color to single-letter class name
  colorClasses: Map<string, string>;
  // Symbol definitions
  symbolDefs: string[];
  nextSymbolId: number;
  nextColorId: number;
}


//#region Color Class Generation

// Use single letters for color classes (matching svg-term style)
const COLOR_CLASS_CHARS = 'cdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const getColorClassName = (index: number): string => {
  if (index < COLOR_CLASS_CHARS.length) {
    return COLOR_CLASS_CHARS[index];
  }
  return `c${index}`;
};


//#region Registry Management

const createRegistry = (): SymbolRegistry => ({
  rowSymbols: new Map(),
  colorClasses: new Map(),
  symbolDefs: [],
  nextSymbolId: 1,
  nextColorId: 0,
});

const getOrCreateColorClass = (registry: SymbolRegistry, color: string): string => {
  const existing = registry.colorClasses.get(color);
  if (existing) return existing;

  const name = getColorClassName(registry.nextColorId++);
  registry.colorClasses.set(color, name);
  return name;
};


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
  frameIndex: number;  // Position in the virtual filmstrip
  timestamp: number;
}

// Group frames by content, keeping only unique visual states
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

// Generate a style hash string from style flags
const hashStyleFlags = (style: { bold: boolean; italic: boolean; underline: boolean; dim: boolean; strikethrough: boolean }): string => {
  let flags = '';
  if (style.bold) flags += 'b';
  if (style.italic) flags += 'i';
  if (style.underline) flags += 'u';
  if (style.dim) flags += 'd';
  if (style.strikethrough) flags += 's';
  return flags;
};

// Generate CSS class names for text styles (bold, italic, etc.)
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
  // Include activeCursor in hash to distinguish typing (solid cursor) from idle (blinking cursor) frames
  const cursorStr = frame.cursor ? `${frame.cursor.row},${frame.cursor.col},${frame.cursorVisible},${frame.activeCursor}` : 'null';
  const rowsStr = frame.rows.map(row =>
    row.map(span => `${span.col}:${span.text}:${span.style.fg || ''}:${span.style.bg || ''}:${hashStyleFlags(span.style)}`).join('|')
  ).join('\n');
  return `${cursorStr}::${rowsStr}`;
};


//#region Row Symbol Generation

// Generate a hash for a row's visual content
const hashRowContent = (row: SpanRow): string => {
  return row.map(span =>
    `${span.col}:${span.text}:${span.style.fg || ''}:${span.style.bg || ''}:${hashStyleFlags(span.style)}`
  ).join('|');
};

// Register a row symbol, returns symbol ID
const registerRowSymbol = (
  registry: SymbolRegistry,
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
    letterSpacing: number;
  }
): number | null => {
  // Skip rows that only contain whitespace with no background color
  // Rows with visible text or background color are kept
  const hasContent = row.some(span => {
    // Keep if there's visible text
    if (span.text.trim().length > 0) return true;
    // Keep if there's a background color (visible highlight)
    if (span.style.bg) return true;
    return false;
  });
  if (!hasContent) return null;

  const hash = `row:${rowIndex}:${hashRowContent(row)}`;
  const existing = registry.rowSymbols.get(hash);
  if (existing !== undefined) return existing;

  const id = registry.nextSymbolId++;
  registry.rowSymbols.set(hash, id);

  // Generate symbol content - all text elements for this row
  const { charWidth, lineHeight, padding, contentStartY, fontSize, theme, customGlyphs, letterSpacing } = config;
  // Cell Y position - top of the line cell
  const cellY = contentStartY + rowIndex * lineHeight;
  // Cursor Y position - may extend above/below the cell
  const cursorYOffset = getCursorYOffset(lineHeight, fontSize);
  const cursorY = cellY + cursorYOffset;
  // Text Y position - centered within the cursor
  const textOffsetY = getTextOffsetY(lineHeight, fontSize);
  const textY = cursorY + textOffsetY;

  // Glyph rendering config
  const glyphLineWidth = Math.max(1, fontSize * 0.08);
  const glyphHeavyLineWidth = glyphLineWidth * 2;

  const textParts: string[] = [];

  // First pass: render background rects for spans with bg color
  // Use inline fill= (not CSS classes) for zero CSS resolution overhead on SMIL frame switches
  row.forEach((span) => {
    if (!span.style.bg) return;
    const bgX = fmt(padding + span.col * charWidth);
    const bgWidth = fmt(span.width * charWidth);
    textParts.push(
      `<rect x="${bgX}" y="${fmt(cellY)}" width="${bgWidth}" height="${fmt(lineHeight)}" fill="${span.style.bg}"/>`
    );
  });

  // Second pass: render text
  // All colors are inline fill= attributes (matching master's approach for mobile perf).
  // CSS classes are used ONLY for text styling (bold, italic, etc.) — never for colors.
  row.forEach((span) => {
    const rawText = span.text;
    if (!rawText) return;

    // Determine color — always inline, never a CSS class
    let color = theme.foreground;
    if (span.style.fg) {
      color = span.style.fg;
    }

    // Text style classes (bold, italic, etc.) — these are a tiny fixed set, not per-color
    const styleClasses = getTextStyleClasses(span.style);
    const classAttr = styleClasses.length > 0 ? ` class="${styleClasses.join(' ')}"` : '';

    // Use custom glyph rendering when enabled and text contains special chars
    if (customGlyphs && containsCustomGlyphs(rawText)) {
      // Render character by character for custom glyphs
      let colOffset = 0;
      [...rawText].forEach((char) => {
        const codePoint = char.codePointAt(0);
        const absoluteCol = span.col + colOffset;
        const charX = padding + absoluteCol * charWidth;
        const charDisplayWidth = getCharWidth(char);

        // Render custom glyphs (box-drawing, block elements, etc.)
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
            colorClass: '', // No CSS class — colors are inline
          };
          const result = renderCustomGlyph(char, glyphCtx);
          if (result.handled) {
            textParts.push(result.svg);
            colOffset += charDisplayWidth;
            return;
          }
        }
        // Fall back to text — inline fill, optional style class
        textParts.push(
          `<text x="${fmt(charX)}" y="${fmt(textY)}" fill="${color}"${classAttr}>${escapeXml(char)}</text>`
        );

        colOffset += charDisplayWidth;
      });
    } else {
      // No custom glyphs - render as single text element with inline fill
      const x = fmt(padding + span.col * charWidth);
      const safeText = escapeXml(rawText);
      textParts.push(`<text x="${x}" y="${fmt(textY)}" fill="${color}"${classAttr}>${safeText}</text>`);
    }
  });

  registry.symbolDefs.push(`<symbol id="${id}">${textParts.join('')}</symbol>`);
  return id;
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
  // Default border radius to 8 for a polished look, unless explicitly set to 0
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
    // Forward + reverse at same speed + optional loop pause
    totalDuration = forwardDuration + lastFrame.timestamp + loopPause;
  } else if (loopStyle === 'rewind') {
    // Forward + fast rewind + optional loop pause
    totalDuration = forwardDuration + (lastFrame.timestamp / rewindSpeed) + loopPause;
  } else if (loopStyle === 'fade') {
    // Forward + fade duration + optional loop pause
    totalDuration = forwardDuration + fadeDuration + loopPause;
  } else {
    // Simple loop
    totalDuration = forwardDuration + loopPause;
  }

  // Create symbol registry
  const registry = createRegistry();

  // Register all unique row symbols across all frames
  const frameRowSymbols: Map<number, Map<number, number>> = new Map(); // frameIndex -> rowIndex -> symbolId

  const customGlyphs = options.customGlyphs ?? true;
  const showCursor = options.showCursor ?? true;

  const symbolConfig = {
    charWidth,
    lineHeight,
    padding,
    contentStartY,
    fontSize,
    theme,
    customGlyphs,
    letterSpacing: options.letterSpacing ?? 0,
  };

  uniqueFrames.forEach(({ frame, frameIndex }) => {
    const rowSymbolMap = new Map<number, number>();
    frame.rows.forEach((row) => {
      if (row.length === 0) return;
      const rowIdx = row[0].row;
      const symbolId = registerRowSymbol(registry, row, rowIdx, symbolConfig);
      if (symbolId !== null) {
        rowSymbolMap.set(rowIdx, symbolId);
      }
    });
    frameRowSymbols.set(frameIndex, rowSymbolMap);
  });

  // Extract watermark content and defs early so we can add defs to root
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

  // Outer SVG
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`);

  // Defs: symbols for row dedup + gradients + watermark defs
  // Symbols use inline colors (no CSS classes) so there's zero CSS resolution on frame switches.
  // The <use> refs are lightweight DOM lookups; CSS cascade was the real perf bottleneck.
  parts.push('<defs>');
  if (hasBackground && isGradient(options.background)) {
    parts.push(generateGradientDef(options.background, 'bg-gradient'));
  }
  if (watermarkDefs) {
    parts.push(watermarkDefs);
  }
  registry.symbolDefs.forEach(def => parts.push(def));
  parts.push('</defs>');

  // Style section — only color classes, font, cursor. Frame switching uses SMIL, not CSS.
  // SMIL <animate attributeName="visibility" calcMode="discrete"> is handled natively by the
  // SVG renderer, while CSS @keyframes go through a heavier animation pipeline. On mobile Safari,
  // SMIL animations are dramatically faster because the SVG engine pre-computes the discrete
  // visibility schedule and only paints the active frame.
  parts.push('<style>');
  parts.push(generateColorStyles(registry, theme, hasBackground, options.background));

  // Font embedding
  if (options.embedFont && options.fontData) {
    parts.push(`@font-face{font-family:'DVDMono';src:url(data:font/woff2;base64,${options.fontData}) format('woff2');font-weight:400;font-style:normal;font-display:block}`);
  }

  // Font styling
  const defaultFonts = "'SF Mono',Monaco,Consolas,Menlo,monospace";
  const fontFamily = options.embedFont && options.fontData
    ? "'DVDMono',monospace"
    : options.fontFamily ? `'${options.fontFamily}',${defaultFonts}` : defaultFonts;
  const letterSpacingStyle = options.letterSpacing ? `letter-spacing:${options.letterSpacing}px;` : '';
  // Base text styling — colors are inline fill= attributes, not CSS classes
  parts.push(`text{font-family:${fontFamily};font-size:${fontSize}px;dominant-baseline:text-before-edge;white-space:pre;${letterSpacingStyle}}`);

  // Text style classes (bold, italic, etc.)
  parts.push('.bold{font-weight:700}.italic{font-style:italic}.uline{text-decoration:underline}.strike{text-decoration:line-through}.dim{opacity:0.5}');

  // Cursor blink animation - .cursor blinks, .cursor-active stays solid (during typing)
  // Use mix-blend-mode:difference to invert text color under the cursor
  const cursorBlink = options.cursorBlink !== false;
  if (cursorBlink) {
    parts.push(`@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}.cursor{animation:blink 1s step-end infinite;mix-blend-mode:difference}.cursor-active{opacity:1;mix-blend-mode:difference}`);
  } else {
    parts.push(`.cursor,.cursor-active{mix-blend-mode:difference}`);
  }
  parts.push('</style>');

  // Outer background (if padding)
  if (hasBackground) {
    const bgFill = isGradient(options.background) ? 'url(#bg-gradient)' : options.background;
    parts.push(`<rect width="${totalWidth}" height="${totalHeight}" rx="${bgRadius}" fill="${bgFill}"/>`);
  }

  // Terminal window group - offset by bgPadding
  parts.push(`<g transform="translate(${bgPadding},${bgPadding})">`);

  // Terminal background
  parts.push(`<rect width="${width}" height="${height}" rx="${borderRadius}" fill="${theme.background}"/>`);

  // Window chrome (header)
  if (template !== 'minimal' && headerHeight > 0) {
    // Header background
    const headerBg = options.headerBackground || theme.background;
    parts.push(`<rect width="${width}" height="${headerHeight}" rx="${borderRadius}" fill="${headerBg}"/>`);
    // Bottom part of header (cover rounded corners)
    parts.push(`<rect y="${headerHeight - borderRadius}" width="${width}" height="${borderRadius}" fill="${headerBg}"/>`);

    // Window buttons (macOS style)
    if (template === 'macos') {
      const buttonY = headerHeight / 2;
      const buttonR = 6;
      const buttonSpacing = 20;
      const buttonStartX = 16;
      parts.push(`<circle cx="${buttonStartX}" cy="${buttonY}" r="${buttonR}" fill="#ff5f56"/>`);
      parts.push(`<circle cx="${buttonStartX + buttonSpacing}" cy="${buttonY}" r="${buttonR}" fill="#ffbd2e"/>`);
      parts.push(`<circle cx="${buttonStartX + buttonSpacing * 2}" cy="${buttonY}" r="${buttonR}" fill="#27c93f"/>`);
    }

    // Title
    if (options.title) {
      parts.push(`<text x="${width / 2}" y="${headerHeight / 2}" text-anchor="middle" dominant-baseline="middle" fill="${theme.foreground}" font-size="${fontSize}">${escapeXml(options.title)}</text>`);
    }

    // Header border (only if explicitly enabled)
    if (options.headerBorder === true) {
      const borderColor = options.headerBorderColor || 'rgba(255,255,255,0.1)';
      const borderW = options.headerBorderWidth || 1;
      parts.push(`<line x1="0" y1="${headerHeight}" x2="${width}" y2="${headerHeight}" stroke="${borderColor}" stroke-width="${borderW}"/>`);
    }
  }

  // Content area - clip to show only one frame at a time
  const contentHeight = height - headerHeight;
  parts.push(`<clipPath id="content-clip"><rect x="0" y="${headerHeight}" width="${width}" height="${contentHeight}"/></clipPath>`);
  parts.push(`<g clip-path="url(#content-clip)">`);

  // Vertical filmstrip animation: all frames stacked vertically, a single
  // <animateTransform type="translate"> scrolls the strip. The GPU composites
  // transform changes natively — no layout/paint per frame switch, no visibility
  // toggling on N groups, no CSS resolution. This is the sprite-sheet approach
  // used by high-performance SVG animation tools.
  const animDurationS = (totalDuration / 1000).toFixed(3);
  const smilRepeat = loop ? 'indefinite' : '1';

  // The filmstrip group: all frames stacked, animated via transform
  parts.push('<g>');

  // Generate frame content — each frame offset by frameIndex * contentHeight
  uniqueFrames.forEach(({ frame, frameIndex }) => {
    const rowSymbolMap = frameRowSymbols.get(frameIndex) || new Map();
    const yOffset = frameIndex * contentHeight;

    parts.push(`<g transform="translate(0,${fmt(yOffset)})">`);

    // Row content via symbol references — deduplicates identical rows across frames
    rowSymbolMap.forEach((symbolId) => {
      parts.push(`<use xlink:href="#${symbolId}"/>`);
    });

    // Selection (render before cursor so cursor appears on top)
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

    // Cursor (only render if showCursor option is enabled)
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

    parts.push('</g>');
  });

  // Single animateTransform scrolls through the vertical filmstrip.
  // calcMode="discrete" = instant jumps (no tweening), type="translate" = GPU-composited.
  const transformAnimation = generateTransformAnimation(uniqueFrames, contentHeight, {
    loopStyle,
    forwardDuration,
    totalDuration,
    fadeDuration,
    rewindSpeed,
    loopPause,
  });

  parts.push(`<animateTransform attributeName="transform" type="translate" values="${transformAnimation.values}" keyTimes="${transformAnimation.keyTimes}" dur="${animDurationS}s" repeatCount="${smilRepeat}" calcMode="discrete" fill="freeze"/>`);

  // Fade overlay for fade loop style
  if (loopStyle === 'fade') {
    const fadeStartNorm = forwardDuration / totalDuration;
    const fadeEndNorm = (forwardDuration + fadeDuration) / totalDuration;
    const fadeKeyTimes = `0;${fmtKeyTime(fadeStartNorm)};${fmtKeyTime(fadeEndNorm)};1`;
    const fadeValues = '0;0;1;1';
    const fadeY = headerHeight;
    parts.push(`<rect x="0" y="${fadeY}" width="${width}" height="${contentHeight}" fill="${theme.background}" opacity="0"><animate attributeName="opacity" values="${fadeValues}" keyTimes="${fadeKeyTimes}" dur="${animDurationS}s" repeatCount="${smilRepeat}" fill="freeze"/></rect>`);
  }

  parts.push('</g>'); // filmstrip group
  parts.push('</g>'); // content clip group

  // Watermark (rendered outside clip so it's always visible)
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


//#region Transform Animation Generation

interface KeyframeOptions {
  loopStyle: 'loop' | 'reverse' | 'rewind' | 'fade';
  forwardDuration: number;
  totalDuration: number;
  fadeDuration: number;
  rewindSpeed: number;
  loopPause: number;
}

interface TransformAnimation {
  values: string;    // e.g. "0 0; 0 -360; 0 -720"
  keyTimes: string;  // e.g. "0;0.1;0.2"
}

// Format SMIL keyTime value (0-1 range, minimal precision)
const fmtKeyTime = (t: number): string => {
  if (t <= 0) return '0';
  if (t >= 1) return '1';
  return parseFloat(t.toFixed(6)).toString();
};

// Generate a single <animateTransform> that scrolls the vertical filmstrip.
// Each frame is stacked at y = frameIndex * contentHeight. The transform jumps
// to translate(0, -frameIndex * contentHeight) to show the correct frame.
// Using calcMode="discrete" + type="translate" = GPU-composited instant jumps.
//
// IMPORTANT: SVG spec requires keyTimes to start at 0 and end at 1.
// Browsers will reject the animation entirely if this is violated.
const generateTransformAnimation = (
  uniqueFrames: UniqueFrame[],
  contentHeight: number,
  options: KeyframeOptions
): TransformAnimation => {
  if (uniqueFrames.length === 0) return { values: '0 0', keyTimes: '0;1' };

  const { loopStyle, forwardDuration, totalDuration } = options;

  // Build ordered list of (normalizedTime, frameIndex) pairs
  const keyframes: { time: number; frameIndex: number }[] = [];

  if (loopStyle === 'reverse' || loopStyle === 'rewind') {
    const lastTimestamp = uniqueFrames[uniqueFrames.length - 1].timestamp;
    const speedMultiplier = loopStyle === 'rewind' ? options.rewindSpeed : 1;

    // Forward pass
    for (let i = 0; i < uniqueFrames.length; i++) {
      keyframes.push({
        time: uniqueFrames[i].timestamp / totalDuration,
        frameIndex: i,
      });
    }
    // Reverse pass (skip last frame — it's already showing from forward)
    for (let i = uniqueFrames.length - 2; i >= 0; i--) {
      const reverseOffset = (lastTimestamp - uniqueFrames[i + 1].timestamp) / speedMultiplier;
      keyframes.push({
        time: (forwardDuration + reverseOffset) / totalDuration,
        frameIndex: i,
      });
    }
  } else if (loopStyle === 'fade') {
    // Forward pass — last frame stays visible while fade overlay covers it
    for (let i = 0; i < uniqueFrames.length; i++) {
      keyframes.push({
        time: uniqueFrames[i].timestamp / totalDuration,
        frameIndex: i,
      });
    }
    // After fade completes, jump back to frame 0 (hidden behind the fade overlay)
    const fadeEndNorm = (forwardDuration + (options.fadeDuration ?? 1500)) / totalDuration;
    if (fadeEndNorm < 1) {
      keyframes.push({ time: fadeEndNorm, frameIndex: 0 });
    }
  } else {
    // Simple loop
    for (let i = 0; i < uniqueFrames.length; i++) {
      keyframes.push({
        time: uniqueFrames[i].timestamp / totalDuration,
        frameIndex: i,
      });
    }
  }

  // Ensure first keyTime is 0 (SVG spec requirement)
  if (keyframes.length > 0 && keyframes[0].time > 0) {
    keyframes[0].time = 0;
  }

  // Ensure last keyTime is 1 — add a sentinel holding the last frame's value.
  // For loop styles that return to frame 0, the last keyframe already points there.
  // For simple loop, the last frame holds until the animation restarts.
  const lastKf = keyframes[keyframes.length - 1];
  if (lastKf.time < 1) {
    keyframes.push({ time: 1, frameIndex: lastKf.frameIndex });
  }

  const values = keyframes.map(kf => `0 ${fmt(-kf.frameIndex * contentHeight)}`).join(';');
  const keyTimes = keyframes.map(kf => fmtKeyTime(kf.time)).join(';');

  return { values, keyTimes };
};


//#region Color Styles Generation

const generateColorStyles = (
  _registry: SymbolRegistry,
  _theme: Theme,
  _hasBackground: boolean,
  _background?: string | Gradient
): string => {
  // No CSS color classes — all colors are inline fill/stroke attributes.
  // This eliminates CSS style resolution on SMIL frame switches, which is the
  // key difference between our approach and master's smooth mobile performance.
  // Master: inline fill="rgb(...)" + tiny CSS for font styling = smooth 60fps
  // CSS classes: browser must resolve hundreds of color classes per frame switch = jank
  return '';
};
