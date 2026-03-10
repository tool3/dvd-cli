/**
 * Render Command
 * Execute a .cd script and generate animated SVG
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseCD } from '../parser/cd-parser';
import { CDExecutor } from '../executor/cd-executor';
import {
  createAnimatedSVG,
  getAnimationMetadata,
} from '../animator/svg-animator';
import { optimizeSvg } from '../animator/svg-optimizer';
import { createSpinner } from '../utils/spinner';
import type { AnimationOptions } from '../animator/svg-animator';

interface RenderArgs {
  file: string;
  output?: string;
  verbose?: boolean;
  loop?: boolean;
  'pause-at-end'?: number;
  fps?: number;
}

/**
 * Load and parse a .cd file
 */
const loadCDFile = (filePath: string): ReturnType<typeof parseCD> => {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseCD(content);
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`CD file not found: ${filePath}`);
    }
    throw err;
  }
};

/**
 * Build executor options from script settings
 */
const buildExecutorOptions = (
  settings: Map<string, string>
): {
  width?: number;
  height?: number;
  fontSize?: number;
  title?: string;
  template?: 'macos' | 'windows' | 'minimal';
} => {
  const options: {
    width?: number;
    height?: number;
    fontSize?: number;
    title?: string;
    template?: 'macos' | 'windows' | 'minimal';
  } = {};

  // Map CD settings to executor options
  if (settings.has('Width')) {
    options.width = parseInt(settings.get('Width')!, 10);
  }
  if (settings.has('Height')) {
    options.height = parseInt(settings.get('Height')!, 10);
  }
  if (settings.has('FontSize')) {
    options.fontSize = parseInt(settings.get('FontSize')!, 10);
  }
  if (settings.has('Title')) {
    options.title = settings.get('Title');
  }
  if (settings.has('Template')) {
    options.template = settings.get('Template') as 'macos' | 'windows' | 'minimal';
  }

  return options;
};

/**
 * Render command handler
 */
/**
 * Get ANSI color code for a command type
 */
const getCommandColor = (description: string): string => {
  // Extract command name (first word before space or ANSI code)
  const cmdType = description.split(/[\s\x1b]/)[0];
  const colors: Record<string, string> = {
    Type: '\x1b[36m',      // Cyan
    Enter: '\x1b[33m',     // Yellow
    Sleep: '\x1b[35m',     // Magenta
    Backspace: '\x1b[31m', // Red
    Left: '\x1b[34m',      // Blue
    Right: '\x1b[34m',     // Blue
    Up: '\x1b[34m',        // Blue
    Down: '\x1b[34m',      // Blue
    Tab: '\x1b[32m',       // Green
    Space: '\x1b[32m',     // Green
    Screenshot: '\x1b[93m', // Bright Yellow
    Copy: '\x1b[96m',      // Bright Cyan
    Paste: '\x1b[96m',     // Bright Cyan
  };
  return colors[cmdType] || '\x1b[37m'; // Default: White
};

export async function renderCommand(args: RenderArgs): Promise<void> {
  const fileName = args.file.split('/').pop() || args.file;
  const spinner = createSpinner(`Executing ${fileName}`);

  if (!args.verbose) {
    spinner.start();
  }

  try {
    // Load and parse the CD file
    const script = loadCDFile(args.file);

    // Count action commands (excluding comments, settings, etc.)
    const actionCommandCount = script.commands.filter(
      (cmd) => !['Output', 'Require', 'Set', 'Env', 'Comment'].includes(cmd.type)
    ).length;

    if (args.verbose) {
      console.log(`Loaded ${actionCommandCount} commands from ${args.file}`);
    }

    // Determine output path
    const outputPath = args.output || script.output || args.file.replace(/\.cd$/, '.svg');

    // Check requirements
    if (script.requirements.length > 0 && args.verbose) {
      console.log(`Requirements specified: ${script.requirements.join(', ')}`);
    }

    // Build executor options
    const executorOptions = buildExecutorOptions(script.settings);

    const executor = new CDExecutor({
      width: executorOptions.width,
      height: executorOptions.height,
      fontSize: executorOptions.fontSize,
      title: executorOptions.title,
      template: executorOptions.template,
      onProgress: (current: number, total: number, description?: string) => {
        const colorCode = description ? getCommandColor(description) : '';
        const descText = description ? ` \x1b[1m${colorCode}${description}\x1b[0m` : '';
        if (args.verbose) {
          console.log(`\x1b[2mExecuting command ${current}/${total}\x1b[0m${descText}`);
        } else {
          spinner.update(`\x1b[2mExecuting ${fileName} (${current}/${total})\x1b[0m${descText}`);
        }
      },
    });

    const frames = await executor.execute(script);

    if (args.verbose) {
      console.log(`Captured ${frames.length} frames`);
    } else {
      spinner.update('Generating animated SVG');
    }

    // Generate animated SVG
    const animationOptions: AnimationOptions = {
      fps: args.fps,
      loop: args.loop !== false,
      pauseAtEnd: args['pause-at-end'] || 1000,
    };

    let svg = await createAnimatedSVG(frames, animationOptions);

    // Optimize SVG
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

    const metadata = getAnimationMetadata(frames);

    // Write output
    writeFileSync(outputPath, svg, 'utf-8');

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

    await executor.cleanup();
  } catch (err) {
    if (!args.verbose) {
      spinner.fail('Failed to render CD');
    }
    throw err;
  }
}
