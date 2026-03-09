/**
 * Pipe Command
 * Read animated terminal output from stdin and generate animated SVG
 *
 * Usage:
 *   some-command | dvd -o output.svg
 *   dvd - -o output.svg < input.txt
 */

import { writeFileSync } from 'node:fs';
import { createAnimatedSVG, getAnimationMetadata } from '../animator/svg-animator';
import { optimizeSvg } from '../animator/svg-optimizer';
import { createSpinner } from '../utils/spinner';
import { createGridState, processInput } from '../pipeline/vterminal';
import { coalesce } from '../pipeline/coalescer';
import { emit } from '../pipeline/svg-emitter';
import { themes } from '../pipeline';
import type { TerminalFrame } from '../executor/cd-executor';
import type { AnimationOptions } from '../animator/svg-animator';

interface PipeArgs {
  output?: string;
  verbose?: boolean;
  loop?: boolean;
  'pause-at-end'?: number;
  title?: string;
  theme?: string;
  width?: number;
  height?: number;
  fontSize?: number;
  lineHeight?: number;
  template?: string;
  padding?: number;
  borderRadius?: number;
}

interface StdinResult {
  data: string;
  totalDuration: number;
}

/**
 * Read all data from stdin with timing info
 */
async function readStdin(): Promise<StdinResult> {
  return new Promise((resolve, reject) => {
    let data = '';
    const startTime = Date.now();

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });

    // Set a timeout to avoid hanging forever
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
}

/**
 * Detect animation type from content
 */
function detectAnimationType(content: string): 'terminal-reset' | 'cursor-up' | 'cursor-restore' | 'none' {
  if (content.includes('\x1bc')) {
    return 'terminal-reset';
  }
  // Cursor up sequence: \x1b[NA where N is number of lines
  if (/\x1b\[\d+A/.test(content)) {
    return 'cursor-up';
  }
  if (content.includes('\x1b8') || content.includes('\x1b[?25l')) {
    return 'cursor-restore';
  }
  return 'none';
}

/**
 * Split content into frames based on animation markers
 */
function splitIntoFrames(content: string, animationType: 'terminal-reset' | 'cursor-up' | 'cursor-restore' | 'none'): string[] {
  if (animationType === 'terminal-reset') {
    // Split on terminal reset (\x1bc)
    return content.split('\x1bc').filter(frame => frame.trim());
  }

  if (animationType === 'cursor-up') {
    // Split on cursor up sequences (\x1b[NA where N is lines)
    // Each cursor-up marks the start of a new frame overwriting the previous
    const frames: string[] = [];
    const parts = content.split(/\x1b\[\d+A/);

    for (const part of parts) {
      if (part.trim()) {
        frames.push(part);
      }
    }
    return frames;
  }

  if (animationType === 'cursor-restore') {
    // Split on cursor restore (\x1b8)
    return content.split('\x1b8').filter(frame => frame.trim());
  }

  // No animation markers - treat as single frame
  return [content];
}

/**
 * Render a frame to SVG
 */
function renderFrame(
  content: string,
  options: {
    width: number;
    height: number;
    fontSize: number;
    lineHeight: number;
    padding: number;
    borderRadius: number;
    theme: typeof themes.dark;
    title?: string;
    template: 'macos' | 'windows' | 'minimal';
  }
): string {
  const charWidth = options.fontSize * 0.6;
  const lineHeightPx = options.fontSize * options.lineHeight;
  const headerHeight = 40;
  const gridWidth = Math.floor((options.width - options.padding * 2) / charWidth);
  const gridHeight = Math.floor((options.height - headerHeight - options.padding * 2) / lineHeightPx);

  // Process content through VTerminal
  let grid = createGridState(gridWidth, gridHeight);
  grid = processInput(grid, content);

  // Coalesce to spans
  const rows = coalesce(grid, options.theme);

  // Emit SVG
  const { svg } = emit(rows, null, false, {
    theme: options.theme,
    template: options.template,
    width: options.width,
    height: options.height,
    fontSize: options.fontSize,
    title: options.title,
    lineHeight: lineHeightPx,
    charWidth: charWidth,
    padding: options.padding,
    borderRadius: options.borderRadius,
  });

  return svg;
}

/**
 * Pipe command handler
 */
export async function pipeCommand(args: PipeArgs): Promise<void> {
  const spinner = createSpinner('Reading from stdin');

  if (!args.verbose) {
    spinner.start();
  }

  try {
    // Read all input from stdin
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

    // Detect animation type
    const animationType = detectAnimationType(input);

    if (args.verbose) {
      console.log(`Animation type: ${animationType}`);
    }

    // Split into frames
    const frameContents = splitIntoFrames(input, animationType);

    if (args.verbose) {
      console.log(`Split into ${frameContents.length} frames`);
    }

    if (frameContents.length === 0) {
      throw new Error('No frames detected in input');
    }

    // Configuration
    const fontSize = args.fontSize || 14;
    const lineHeight = args.lineHeight || 1.4;
    const padding = args.padding || 16;
    const borderRadius = args.borderRadius || 8;
    const theme = args.theme ? (themes as unknown as Record<string, typeof themes.dark>)[args.theme] || themes.dark : themes.dark;
    const title = args.title || 'Terminal Animation';
    const template = (args.template || 'macos') as 'macos' | 'windows' | 'minimal';

    // Auto-detect dimensions from content if not specified
    let width = args.width;
    let height = args.height;

    if (!width || !height) {
      // Analyze first frame to detect content dimensions
      const sampleFrame = frameContents[0];
      // Strip ANSI codes for accurate measurement
      const plainText = sampleFrame.replace(/\x1b\[[0-9;]*m/g, '');
      const lines = plainText.split('\n').filter(l => l.length > 0);
      const maxLineLength = Math.max(...lines.map(l => l.length), 40);
      const lineCount = Math.max(lines.length, 10);

      const charWidth = fontSize * 0.6;
      const lineHeightPx = fontSize * lineHeight;
      const headerHeight = 40;

      if (!width) {
        width = Math.ceil(maxLineLength * charWidth + padding * 2);
      }
      if (!height) {
        height = Math.ceil(lineCount * lineHeightPx + headerHeight + padding * 2);
      }

      if (args.verbose) {
        console.log(`Auto-detected dimensions: ${width}x${height} (${maxLineLength} cols x ${lineCount} rows)`);
      }
    }

    // Calculate frame timing from actual stream duration
    // If we received data over time, use the real duration to calculate frame timing
    // This gives us the actual animation speed from the piped command
    let frameDuration: number;
    if (totalDuration > 100 && frameContents.length > 1) {
      // Use real timing - data arrived over time
      frameDuration = totalDuration / (frameContents.length - 1);
      if (args.verbose) {
        const detectedFps = 1000 / frameDuration;
        console.log(`Detected ${detectedFps.toFixed(1)} fps from stream timing`);
      }
    } else {
      // Data arrived instantly (e.g., from a file) - use default 30fps
      frameDuration = 1000 / 30;
    }

    if (!args.verbose) {
      spinner.update(`Rendering ${frameContents.length} frames`);
    }

    // Render each frame to SVG
    const frames: TerminalFrame[] = frameContents.map((content, i) => {
      const svg = renderFrame(content, { width, height, fontSize, lineHeight, padding, borderRadius, theme, title, template });
      return {
        timestamp: i * frameDuration,
        svg,
        state: {
          content,
          cursorX: 0,
          cursorY: 0,
          width,
          height,
          fontSize,
          showCursor: false,
          activeCursor: false,
        },
      };
    });

    if (args.verbose) {
      console.log(`Rendered ${frames.length} frames`);
    }

    // Generate animated SVG
    if (!args.verbose) {
      spinner.update('Generating animated SVG');
    }

    const animationOptions: AnimationOptions = {
      loop: args.loop !== false,
      pauseAtEnd: args['pause-at-end'] || 1000,
    };

    let svg = await createAnimatedSVG(frames, animationOptions);

    // Optimize
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

    // Determine output path
    const outputPath = args.output || 'output.svg';

    // Write output
    writeFileSync(outputPath, svg, 'utf-8');

    const metadata = getAnimationMetadata(frames);
    const sizeKB = (Buffer.byteLength(svg, 'utf-8') / 1024).toFixed(2);

    if (args.verbose) {
      console.log(`\nCreated ${outputPath}`);
      console.log(`Animation: ${metadata.frameCount} frames @ ${metadata.fps} fps`);
      console.log(`Duration: ${(metadata.duration / 1000).toFixed(2)}s`);
      console.log(`File size: ${sizeKB}KB`);
    } else {
      spinner.success(
        `Created ${outputPath} (${metadata.frameCount} frames, ${(metadata.duration / 1000).toFixed(2)}s, ${sizeKB}KB)`
      );
    }

    // Explicitly exit after successful completion
    process.exit(0);
  } catch (err) {
    if (!args.verbose) {
      spinner.fail('Failed to process stdin');
    }
    throw err;
  }
}
