//#region Imports

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


//#region Types

interface RenderArgs {
  file: string;
  output?: string;
  verbose?: boolean;
  loop?: boolean;
  'pause-at-end'?: number;
  fps?: number;
}


//#region CD File Loader

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


//#region Executor Options Builder

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


//#region Command Coloring

const getCommandColor = (description: string): string => {
  const cmdType = description.split(/[\s\x1b]/)[0];
  const colors: Record<string, string> = {
    Type: '\x1b[36m',
    Enter: '\x1b[33m',
    Sleep: '\x1b[35m',
    Backspace: '\x1b[31m',
    Left: '\x1b[34m',
    Right: '\x1b[34m',
    Up: '\x1b[34m',
    Down: '\x1b[34m',
    Tab: '\x1b[32m',
    Space: '\x1b[32m',
    Screenshot: '\x1b[93m',
    Copy: '\x1b[96m',
    Paste: '\x1b[96m',
  };
  return colors[cmdType] || '\x1b[37m';
};


//#region Render Command

export const renderCommand = async (args: RenderArgs): Promise<void> => {
  const fileName = args.file.split('/').pop() || args.file;
  const spinner = createSpinner(`Executing ${fileName}`);

  if (!args.verbose) {
    spinner.start();
  }

  try {
    const script = loadCDFile(args.file);

    const actionCommandCount = script.commands.filter(
      (cmd) => !['Output', 'Require', 'Set', 'Env', 'Comment'].includes(cmd.type)
    ).length;

    if (args.verbose) {
      console.log(`Loaded ${actionCommandCount} commands from ${args.file}`);
    }

    const outputPath = args.output || script.output || args.file.replace(/\.cd$/, '.svg');

    if (script.requirements.length > 0 && args.verbose) {
      console.log(`Requirements specified: ${script.requirements.join(', ')}`);
    }

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

    const animationOptions: AnimationOptions = {
      fps: args.fps,
      loop: args.loop !== false,
      pauseAtEnd: args['pause-at-end'] || 1000,
    };

    let svg = await createAnimatedSVG(frames, animationOptions);

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
};

