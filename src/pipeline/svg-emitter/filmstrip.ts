//#region Imports

import type { SpanRow, Theme, EmitterOptions, Gradient } from '../../types';
import { fmt, escapeXml } from './utils';
import type { EmitResult } from './index';
import type { FrameData } from './animated';


//#region Types

export interface FilmstripOptions extends EmitterOptions {
  fps?: number;
  loop?: boolean;
  pauseAtEnd?: number;
  loopPause?: number;
  loopStyle?: 'loop' | 'reverse' | 'rewind' | 'fade';
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

const hashFrameContent = (frame: FrameData): string => {
  const cursorStr = frame.cursor ? `${frame.cursor.row},${frame.cursor.col},${frame.cursorVisible}` : 'null';
  const rowsStr = frame.rows.map(row =>
    row.map(span => `${span.col}:${span.text}:${span.style.fg || ''}:${span.style.bg || ''}`).join('|')
  ).join('\n');
  return `${cursorStr}::${rowsStr}`;
};


//#region Row Symbol Generation

// Generate a hash for a row's visual content
const hashRowContent = (row: SpanRow): string => {
  return row.map(span =>
    `${span.col}:${span.text}:${span.style.fg || ''}:${span.style.bg || ''}`
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
    theme: Theme;
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
  const { charWidth, lineHeight, padding, contentStartY, theme } = config;
  // Text Y position - with dominant-baseline:text-before-edge, Y is the top of the text box
  const y = fmt(contentStartY + rowIndex * lineHeight);

  const textParts: string[] = [];
  row.forEach((span) => {
    // Don't trim text - preserve all characters including spaces for ASCII art
    // Only skip completely empty spans
    const rawText = span.text;
    if (!rawText) return;

    // Determine color
    let color = theme.foreground;
    if (span.style.fg) {
      color = span.style.fg;
    }
    const colorClass = getOrCreateColorClass(registry, color);

    // Position based on column
    const x = fmt(padding + span.col * charWidth);
    const safeText = escapeXml(rawText);
    textParts.push(`<text x="${x}" y="${y}" class="${colorClass}">${safeText}</text>`);
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
  const borderRadius = options.borderRadius ?? (template === 'minimal' ? 0 : 8);
  const headerHeight = options.headerHeight ?? (template === 'minimal' ? 0 : 40);
  const contentStartY = headerHeight + padding;
  const loop = options.loop ?? true;
  const pauseAtEnd = options.pauseAtEnd ?? 0;
  const loopPause = options.loopPause ?? 0;

  // Background padding
  const bgPadding = options.backgroundPadding ?? 0;
  const bgRadius = options.backgroundRadius ?? 12;
  const totalWidth = width + bgPadding * 2;
  const totalHeight = height + bgPadding * 2;
  const hasBackground = !!(options.background && bgPadding > 0);

  const lastFrame = frames[frames.length - 1];
  const totalDuration = lastFrame.timestamp + pauseAtEnd + loopPause;

  // Create symbol registry
  const registry = createRegistry();

  // Register all unique row symbols across all frames
  const frameRowSymbols: Map<number, Map<number, number>> = new Map(); // frameIndex -> rowIndex -> symbolId

  const symbolConfig = {
    charWidth,
    lineHeight,
    padding,
    contentStartY,
    fontSize,
    theme,
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

  // Build SVG
  const parts: string[] = [];

  // Outer SVG - use pixel dimensions, viewBox matches visible area
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`);

  // Defs section first (gradients, symbols)
  parts.push('<defs>');

  if (hasBackground && isGradient(options.background)) {
    parts.push(generateGradientDef(options.background, 'bg-gradient'));
  }

  // Output all symbol definitions
  registry.symbolDefs.forEach(def => parts.push(def));

  parts.push('</defs>');

  // Style section
  parts.push('<style>');
  parts.push(generateKeyframes(uniqueFrames, totalDuration, width));
  parts.push(generateColorStyles(registry, theme, hasBackground, options.background));

  // Font styling
  const defaultFonts = "'SF Mono',Monaco,Consolas,Menlo,monospace";
  const fontFamily = options.fontFamily ? `'${options.fontFamily}',${defaultFonts}` : defaultFonts;
  parts.push(`text{font-family:${fontFamily};font-size:${fontSize}px;dominant-baseline:text-before-edge;white-space:pre}`);
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

    // Header border
    if (options.headerBorder !== false) {
      const borderColor = options.headerBorderColor || 'rgba(255,255,255,0.1)';
      const borderW = options.headerBorderWidth || 1;
      parts.push(`<line x1="0" y1="${headerHeight}" x2="${width}" y2="${headerHeight}" stroke="${borderColor}" stroke-width="${borderW}"/>`);
    }
  }

  // Content area - clip to avoid overflow
  parts.push(`<clipPath id="content-clip"><rect x="0" y="${headerHeight}" width="${width}" height="${height - headerHeight}"/></clipPath>`);
  parts.push(`<g clip-path="url(#content-clip)">`);

  // Animated filmstrip group - animates via translateX
  const animDuration = (totalDuration / 1000).toFixed(3);
  parts.push(`<g style="animation:f ${animDuration}s steps(1,end) ${loop ? 'infinite' : '1'}">`);

  // Generate frame content
  uniqueFrames.forEach(({ frame, frameIndex }) => {
    const frameX = frameIndex * width;
    const rowSymbolMap = frameRowSymbols.get(frameIndex) || new Map();

    // Frame group positioned at frameX
    parts.push(`<g transform="translate(${frameX},0)">`);

    // Row symbols
    rowSymbolMap.forEach((symbolId) => {
      parts.push(`<use xlink:href="#${symbolId}"/>`);
    });

    // Cursor
    if (frame.cursor && frame.cursorVisible) {
      const cursorX = padding + frame.cursor.col * charWidth;
      const cursorY = contentStartY + frame.cursor.row * lineHeight;
      const cursorColor = options.cursorColor || theme.cursor || theme.foreground;
      const cursorStyle = options.cursorStyle || 'block';

      if (cursorStyle === 'block') {
        parts.push(`<rect x="${fmt(cursorX)}" y="${fmt(cursorY)}" width="${fmt(charWidth)}" height="${fmt(lineHeight)}" fill="${cursorColor}"/>`);
      } else if (cursorStyle === 'bar') {
        parts.push(`<rect x="${fmt(cursorX)}" y="${fmt(cursorY)}" width="2" height="${fmt(lineHeight)}" fill="${cursorColor}"/>`);
      } else {
        // underline
        const underlineY = cursorY + lineHeight - 2;
        parts.push(`<rect x="${fmt(cursorX)}" y="${fmt(underlineY)}" width="${fmt(charWidth)}" height="2" fill="${cursorColor}"/>`);
      }
    }

    parts.push('</g>');
  });

  parts.push('</g>'); // animated group
  parts.push('</g>'); // content clip group
  parts.push('</g>'); // terminal window group
  parts.push('</svg>');

  return { svg: parts.join(''), width: totalWidth, height: totalHeight };
};


//#region Keyframes Generation

const generateKeyframes = (
  uniqueFrames: UniqueFrame[],
  totalDuration: number,
  frameWidth: number
): string => {
  if (uniqueFrames.length === 0) return '';

  const keyframes: string[] = [];

  uniqueFrames.forEach(({ frameIndex, timestamp }) => {
    const percent = (timestamp / totalDuration) * 100;
    const translateX = -(frameIndex * frameWidth);
    keyframes.push(`${percent.toFixed(1)}%{transform:translateX(${translateX}px)}`);
  });

  return `@keyframes f{${keyframes.join('')}}`;
};


//#region Color Styles Generation

const generateColorStyles = (
  registry: SymbolRegistry,
  theme: Theme,
  hasBackground: boolean,
  background?: string | Gradient
): string => {
  const styles: string[] = [];

  // Background class 'a' (unused now but kept for compatibility)
  if (hasBackground && isGradient(background)) {
    styles.push(`.a{fill:url(#bg-gradient)}`);
  } else if (hasBackground && background) {
    styles.push(`.a{fill:${background}}`);
  } else {
    styles.push(`.a{fill:${theme.background}}`);
  }

  // All color classes
  registry.colorClasses.forEach((className, color) => {
    styles.push(`.${className}{fill:${color}}`);
  });

  return styles.join('');
};
