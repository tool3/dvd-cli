//#region Imports

import { writeFileSync } from 'node:fs';
import { createAnimatedSVG, createFilmstripSVG } from '../animator/svg-animator';
import { optimizeSvg } from '../animator/svg-optimizer';
import { createSpinner } from '../utils/spinner';
import { createGridState, processInput } from '../pipeline/vterminal';
import { coalesce } from '../pipeline/coalescer';
import { emit as emitFrame } from '../pipeline/svg-emitter';
import { themes as pipelineThemes } from '../pipeline';
import { parseGradient, themes as shellfieThemes } from 'shellfie';
import type { FrameData } from '../pipeline/svg-emitter';
import type { AnimationOptions } from '../animator/svg-animator';
import type { TerminalFrame } from '../executor/types';
import type { Gradient } from '../types';

type Theme = typeof pipelineThemes.dark;

const resolveTheme = (themeName: string): Theme => {
  // Check pipeline themes first
  if (themeName in pipelineThemes) {
    return (pipelineThemes as unknown as Record<string, Theme>)[themeName];
  }
  // Fall back to shellfie themes
  if (themeName in shellfieThemes) {
    return (shellfieThemes as unknown as Record<string, Theme>)[themeName];
  }
  // Default to dark theme
  return pipelineThemes.dark;
};


//#region Types

interface PipeArgs {
  output?: string;
  verbose?: boolean;
  loop?: boolean;
  'pause-at-end'?: number;
  'loop-pause'?: number;
  'fade-duration'?: number;
  'rewind-speed'?: number;
  'loop-style'?: 'loop' | 'reverse' | 'rewind' | 'fade';
  title?: string;
  theme?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  lineHeight?: number;
  template?: string;
  padding?: number;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  fontFamily?: string;
  watermark?: string;
  cursorStyle?: string;
  cursorColor?: string;
  cursorBlink?: boolean;
  headerBackground?: string;
  headerHeight?: number;
  headerBorder?: boolean;
  headerBorderColor?: string;
  headerBorderWidth?: number;
  footerBackground?: string;
  footerHeight?: number;
  footerBorder?: boolean;
  footerBorderColor?: string;
  footerBorderWidth?: number;
  letterSpacing?: number;
  background?: string;
  backgroundPadding?: number;
  backgroundRadius?: number;
  playbackSpeed?: number;
  customGlyphs?: boolean;
}

interface StdinResult {
  data: string;
  totalDuration: number;
}

interface RenderFrameOptions {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  padding: number;
  borderRadius: number;
  theme: typeof pipelineThemes.dark;
  title?: string;
  template: 'macos' | 'windows' | 'minimal';
  borderColor?: string;
  borderWidth?: number;
  fontFamily?: string;
  watermark?: string;
  cursorStyle?: 'block' | 'bar' | 'underline';
  cursorColor?: string;
  cursorBlink?: boolean;
  headerBackground?: string;
  headerHeight?: number;
  headerBorder?: boolean;
  headerBorderColor?: string;
  headerBorderWidth?: number;
  footerBackground?: string;
  footerHeight?: number;
  footerBorder?: boolean;
  footerBorderColor?: string;
  footerBorderWidth?: number;
  letterSpacing?: number;
  background?: string | Gradient;
  backgroundPadding?: number;
  backgroundRadius?: number;
}


//#region Stdin Reader

const readStdin = async (): Promise<StdinResult> => {
  return new Promise((resolve, reject) => {
    let data = '';
    const startTime = Date.now();

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });

    const timeoutId = setTimeout(() => {
      if (data.length === 0) {
        reject(new Error('No input received from stdin (timeout after 30s)'));
      }
    }, 30000);

    process.stdin.on('end', () => {
      clearTimeout(timeoutId);
      const totalDuration = Date.now() - startTime;
      resolve({ data, totalDuration });
    });

    process.stdin.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
};


//#region Animation Detection

const detectAnimationType = (content: string): 'terminal-reset' | 'cursor-up' | 'cursor-restore' | 'clear-line' | 'none' => {
  if (content.includes('\x1bc')) {
    return 'terminal-reset';
  }
  if (/\x1b\[\d+A/.test(content)) {
    return 'cursor-up';
  }
  if (content.includes('\x1b8') || content.includes('\x1b[?25l')) {
    return 'cursor-restore';
  }
  // Clear line + cursor to column 0 (used by spinners)
  if (content.includes('\x1b[2K\x1b[0G') || content.includes('\x1b[2K')) {
    return 'clear-line';
  }
  return 'none';
};

const splitIntoFrames = (content: string, animationType: 'terminal-reset' | 'cursor-up' | 'cursor-restore' | 'clear-line' | 'none'): string[] => {
  if (animationType === 'terminal-reset') {
    return content.split('\x1bc').filter(frame => frame.trim());
  }

  if (animationType === 'cursor-up') {
    // For cursor-up animations, content is drawn, then cursor moves up to redraw
    // Each section between cursor-up sequences is a frame that overlays the previous
    // We DON'T accumulate - each frame is independent content that gets drawn at cursor position
    const frames: string[] = [];

    // Split on cursor-up sequences
    const parts = content.split(/\x1b\[\d+A/);

    for (const part of parts) {
      if (part.trim()) {
        // Strip leading newline - it's an artifact of the previous frame's trailing newline
        // and cursor-up repositioning. Without stripping, content starts at row 1 instead of row 0,
        // wasting a row and misaligning the output vs what the terminal displays.
        const cleaned = part.startsWith('\n') ? part.slice(1) : part;
        frames.push(cleaned);
      }
    }

    return frames.length > 0 ? frames : [content];
  }

  if (animationType === 'cursor-restore') {
    return content.split('\x1b8').filter(frame => frame.trim());
  }

  if (animationType === 'clear-line') {
    // Split on clear-line sequences, filter empty frames
    return content.split(/\x1b\[2K\x1b\[0G|\x1b\[2K/).filter(frame => frame.trim());
  }

  return [content];
};


//#region Frame Data Generation

const generateFrameData = (
  content: string,
  timestamp: number,
  options: RenderFrameOptions
): FrameData => {
  const charWidth = options.fontSize * 0.6;
  const lineHeightPx = options.fontSize * options.lineHeight;
  const headerHeight = options.headerHeight ?? 40;
  // Reserve space for watermark so terminal content doesn't overlap
  const watermarkHeight = options.watermark ? lineHeightPx : 0;
  const gridWidth = Math.floor((options.width - options.padding * 2) / charWidth);
  const gridHeight = Math.floor((options.height - headerHeight - options.padding * 2 - watermarkHeight) / lineHeightPx);

  let grid = createGridState(gridWidth, gridHeight);
  grid = processInput(grid, content);

  const rows = coalesce(grid, options.theme);

  return {
    rows,
    cursor: { row: grid.cursor.row, col: grid.cursor.col },
    cursorVisible: false,
    timestamp,
    activeCursor: false,
  };
};


//#region Pipe Command

export const pipeCommand = async (args: PipeArgs): Promise<void> => {
  const spinner = createSpinner('Reading from stdin');

  if (!args.verbose) {
    spinner.start();
  }

  try {
    if (args.verbose) {
      console.log('Reading from stdin...');
    }

    const { data: input, totalDuration } = await readStdin();

    if (!input.trim()) {
      throw new Error('No input received from stdin');
    }

    if (args.verbose) {
      console.log(`Received ${input.length} bytes in ${totalDuration}ms`);
    }

    const animationType = detectAnimationType(input);

    if (args.verbose) {
      console.log(`Animation type: ${animationType}`);
    }

    const frameContents = splitIntoFrames(input, animationType);

    if (args.verbose) {
      console.log(`Split into ${frameContents.length} frames`);
    }

    if (frameContents.length === 0) {
      throw new Error('No frames detected in input');
    }

    const fontSize = args.fontSize || 14;
    const lineHeight = args.lineHeight || 1.4;
    const padding = args.padding || 16;
    const borderRadius = args.borderRadius || 8;
    const theme = args.theme ? resolveTheme(args.theme) : pipelineThemes.dark;
    const title = args.title;
    const template = (args.template || 'macos') as 'macos' | 'windows' | 'minimal';
    const cursorStyle = (args.cursorStyle || 'block') as 'block' | 'bar' | 'underline';

    const renderOptions: Omit<RenderFrameOptions, 'width' | 'height'> = {
      fontSize,
      lineHeight,
      padding,
      borderRadius,
      theme,
      title,
      template,
      borderColor: args.borderColor,
      borderWidth: args.borderWidth,
      fontFamily: args.fontFamily,
      watermark: args.watermark,
      cursorStyle,
      cursorColor: args.cursorColor,
      cursorBlink: args.cursorBlink,
      headerBackground: args.headerBackground,
      headerHeight: args.headerHeight,
      headerBorder: args.headerBorder,
      headerBorderColor: args.headerBorderColor,
      headerBorderWidth: args.headerBorderWidth,
      footerBackground: args.footerBackground,
      footerHeight: args.footerHeight,
      footerBorder: args.footerBorder,
      footerBorderColor: args.footerBorderColor,
      footerBorderWidth: args.footerBorderWidth,
      letterSpacing: args.letterSpacing,
      background: args.background ? parseGradient(args.background) : undefined,
      backgroundPadding: args.backgroundPadding,
      backgroundRadius: args.backgroundRadius,
    };

    let width = args.width;
    let height = args.height;

    // Calculate dimensions early (needed for both auto-detection and frame generation)
    const charWidth = fontSize * 0.6;
    const letterSpacingPx = args.letterSpacing ?? 0;
    const effectiveCharWidth = charWidth + letterSpacingPx;
    const lineHeightPx = fontSize * lineHeight;
    const headerHeight = 40;
    const watermarkHeight = args.watermark ? lineHeightPx : 0;

    if (!width || !height) {
      // For stdin, we need to determine dimensions by processing through terminal emulator
      // Strategy: Start with estimated size, process content, find actual bounds
      let maxLineLength = 40; // Min width
      let maxLineCount = 10;  // Min height

      // For cursor-up animations, frames overlay each other, so check the first frame
      // (which represents one complete draw cycle before the cursor moves up)
      // For other animation types, check all frames to find max dimensions
      const framesToCheck = animationType === 'cursor-up' && frameContents.length > 1
        ? [frameContents[0]]
        : frameContents;

      if (args.verbose && animationType === 'cursor-up' && frameContents.length > 1) {
        console.log(`Cursor-up animation: checking only last frame (${frameContents.length} total frames)`);
      }

      for (const frame of framesToCheck) {
        // First pass: estimate grid size from plain text analysis
        const plainText = frame.replace(/\x1b\[[0-9;]*m/g, '');
        const lines = plainText.split('\n');

        // Use plain text line lengths as a floor for width detection.
        // This preserves trailing spaces that are part of chart layouts
        // (e.g., spacing between bar groups in vertical charts).
        const nonEmptyLines = lines.filter(l => l.length > 0);
        const plainTextMaxLength = nonEmptyLines.length > 0 ? Math.max(...nonEmptyLines.map(l => l.length)) : 0;
        const plainTextLineCount = nonEmptyLines.length;

        // Estimate columns: use longest line length, capped at reasonable max
        const estimatedCols = Math.min(Math.max(plainTextMaxLength, 80), 500);
        // Estimate rows: use line count, capped at reasonable max
        const estimatedRows = Math.min(Math.max(lines.length, 24), 200);

        if (args.verbose) {
          console.log(`Estimated grid size: ${estimatedCols}x${estimatedRows} (from ${lines.length} lines, max length ${plainTextMaxLength})`);
        }

        // Process through appropriately-sized grid
        const grid = createGridState(estimatedCols, estimatedRows);
        const processed = processInput(grid, frame);

        // Scan grid to find actual content bounds (non-space chars or non-default bg)
        let maxRow = 0;
        let maxCol = 0;

        for (let row = 0; row < processed.cells.length; row++) {
          let rowHasContent = false;
          let rowContentSample = '';
          for (let col = 0; col < processed.cells[row].length; col++) {
            const cell = processed.cells[row][col];
            // Check if cell has content (non-space char) or non-default background
            const hasNonDefaultBg = cell.bg && cell.bg.mode !== 'default';
            if (cell.char !== ' ' || hasNonDefaultBg) {
              maxRow = Math.max(maxRow, row);
              maxCol = Math.max(maxCol, col);
              rowHasContent = true;
              if (rowContentSample.length < 20) rowContentSample += cell.char;
            }
          }
          if (args.verbose && rowHasContent && row >= 8) {
            console.log(`  Row ${row}: hasContent=true sample="${rowContentSample}"`);
          }
          // Early exit: if we hit 10 consecutive empty rows after finding content, stop
          if (!rowHasContent && maxRow > 0 && row > maxRow + 10) {
            break;
          }
        }

        // Use the larger of grid-scan bounds and plain text bounds.
        // Grid scan catches content with non-default backgrounds (colored spaces).
        // Plain text length catches trailing spaces that are part of chart layout.
        maxLineCount = Math.max(maxLineCount, maxRow + 1, plainTextLineCount);
        maxLineLength = Math.max(maxLineLength, maxCol + 1, plainTextMaxLength);

        if (args.verbose) {
          console.log(`Found content bounds: ${maxCol + 1} cols x ${maxRow + 1} rows (plain text: ${plainTextMaxLength} cols x ${plainTextLineCount} rows)`);
        }
      }

      if (!width) {
        width = Math.ceil(maxLineLength * effectiveCharWidth + padding * 2);
      }
      if (!height) {
        // Calculate height needed for content with buffer to ensure last row isn't clipped
        // Add 2 extra line heights to account for Math.floor() in grid calculation and ensure last row fully visible
        // This works for both cursor-up and terminal-reset animations
        height = Math.ceil((maxLineCount + 2) * lineHeightPx + headerHeight + padding * 2 + watermarkHeight);
      }

      if (args.verbose) {
        console.log(`Auto-detected dimensions: ${width}x${height} (${maxLineLength} cols x ${maxLineCount} rows)`);
      }
    }

    let frameDuration: number;
    if (totalDuration > 100 && frameContents.length > 1) {
      frameDuration = totalDuration / (frameContents.length - 1);
      if (args.verbose) {
        const detectedFps = 1000 / frameDuration;
        console.log(`Detected ${detectedFps.toFixed(1)} fps from stream timing`);
      }
    } else {
      frameDuration = 1000 / 30;
    }

    if (!args.verbose) {
      spinner.update(`Rendering ${frameContents.length} frames`);
    }

    // Apply playback speed to frame timestamps
    const speed = args.playbackSpeed ?? 1;

    // Pre-create grid dimensions to avoid recalculating for each frame
    const gridWidth = Math.floor((width - padding * 2) / charWidth);
    const gridHeight = Math.floor((height - headerHeight - padding * 2 - watermarkHeight) / lineHeightPx);

    if (args.verbose) {
      console.log(`Rendering grid: ${gridWidth}x${gridHeight} (can hold rows 0-${gridHeight - 1})`);
    }

    const frameData: FrameData[] = frameContents.map((content, i) => {
      let timestamp = i * frameDuration;
      if (speed !== 1 && speed > 0) {
        timestamp = Math.round(timestamp / speed);
      }

      // Create grid and process content
      let grid = createGridState(gridWidth, gridHeight);
      grid = processInput(grid, content);
      const rows = coalesce(grid, theme);

      return {
        rows,
        cursor: { row: grid.cursor.row, col: grid.cursor.col },
        cursorVisible: false,
        timestamp,
        activeCursor: false,
      };
    });

    if (args.verbose) {
      console.log(`Rendered ${frameData.length} frames`);
    }

    if (!args.verbose) {
      spinner.update('Generating animated SVG');
    }

    const animationOptions: AnimationOptions = {
      loop: args.loop !== false,
      pauseAtEnd: args['pause-at-end'] || 1000,
      loopStyle: args['loop-style'] || 'loop',
      loopPause: args['loop-pause'] ?? 0,
      fadeDuration: args['fade-duration'] ?? 1500,
      rewindSpeed: args['rewind-speed'] ?? 5,
    };

    // Render each frame as a standalone SVG using the same emit() function master uses.
    // This produces inline content with inline colors — zero CSS resolution overhead,
    // zero <use> shadow DOM resolution. Proven smooth 60fps on mobile Safari.
    const emitterOptions = {
      theme,
      template,
      width,
      height,
      fontSize,
      title,
      watermark: args.watermark,
      lineHeight: lineHeightPx,
      charWidth,
      padding,
      borderRadius,
      headerHeight,
      footerHeight: args.footerHeight ?? 0,
      cursorStyle,
      cursorColor: args.cursorColor,
      cursorBlink: args.cursorBlink,
      fontFamily: args.fontFamily,
      background: args.background ? parseGradient(args.background) : undefined,
      backgroundPadding: args.backgroundPadding,
      backgroundRadius: args.backgroundRadius,
      headerBackground: args.headerBackground,
      headerBorder: args.headerBorder,
      headerBorderColor: args.headerBorderColor,
      headerBorderWidth: args.headerBorderWidth,
      footerBackground: args.footerBackground,
      footerBorder: args.footerBorder,
      footerBorderColor: args.footerBorderColor,
      footerBorderWidth: args.footerBorderWidth,
      letterSpacing: args.letterSpacing,
      customGlyphs: args.customGlyphs,
    };

    const terminalFrames: TerminalFrame[] = frameData.map((fd) => ({
      svg: emitFrame(fd.rows, fd.cursor, fd.cursorVisible, emitterOptions).svg,
      timestamp: fd.timestamp,
      state: { content: '', cursorX: fd.cursor?.col ?? 0, cursorY: fd.cursor?.row ?? 0, width, height, fontSize, showCursor: fd.cursorVisible, activeCursor: fd.activeCursor ?? false },
    }));

    let svg = await createAnimatedSVG(terminalFrames, animationOptions);

    if (!args.verbose) {
      spinner.update('Optimizing SVG');
    }

    const originalSize = Buffer.byteLength(svg, 'utf-8');
    svg = optimizeSvg(svg);
    const optimizedSize = Buffer.byteLength(svg, 'utf-8');

    if (args.verbose) {
      const savings = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
      console.log(`Optimized: ${(originalSize / 1024).toFixed(0)}KB → ${(optimizedSize / 1024).toFixed(0)}KB (${savings}% reduction)`);
    }

    let outputPath = args.output || 'output.svg';
    // Ensure .svg extension
    if (!outputPath.endsWith('.svg')) {
      outputPath += '.svg';
    }

    writeFileSync(outputPath, svg, 'utf-8');

    // Calculate metadata from frameData
    const frameCount = frameData.length;
    const duration = frameData.length > 0 ? frameData[frameData.length - 1].timestamp : 0;
    const sizeKB = (Buffer.byteLength(svg, 'utf-8') / 1024).toFixed(2);

    // ANSI color codes
    const green = '\x1b[32m';
    const white = '\x1b[37m';
    const lightBlue = '\x1b[94m';
    const lightPink = '\x1b[95m';
    const lightOrange = '\x1b[38;5;215m';
    const limeGreen = '\x1b[92m';
    const dim = '\x1b[2m';
    const reset = '\x1b[0m';

    const durationStr = (duration / 1000).toFixed(2) + 's';

    if (args.verbose) {
      console.log(`\n${green}✓${reset} ${white}Created${reset} ${lightBlue}${outputPath}${reset}`);
      console.log(`  ${dim}├─${reset} ${lightPink}${frameCount}${reset}${dim} frames${reset}`);
      console.log(`  ${dim}├─${reset} ${lightOrange}${durationStr}${reset}${dim} duration${reset}`);
      console.log(`  ${dim}└─${reset} ${limeGreen}${sizeKB}KB${reset}${dim} optimized${reset}`);
    } else {
      spinner.successMultiline([
        `${green}✓${reset} ${white}Created${reset} ${lightBlue}${outputPath}${reset}`,
        `  ${dim}├─${reset} ${lightPink}${frameCount}${reset}${dim} frames${reset}`,
        `  ${dim}├─${reset} ${lightOrange}${durationStr}${reset}${dim} duration${reset}`,
        `  ${dim}└─${reset} ${limeGreen}${sizeKB}KB${reset}${dim} optimized${reset}`,
      ]);
    }

    process.exit(0);
  } catch (err) {
    if (!args.verbose) {
      spinner.fail('Failed to process stdin');
    }
    throw err;
  }
};

