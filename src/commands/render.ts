//#region Imports

import { readFileSync, writeFileSync } from 'node:fs';
import { parseCD } from '../parser/cd-parser';
import { CDExecutor } from '../executor/cd-executor';
import {
  createAnimatedSVG,
  createFilmstripSVG,
  getAnimationMetadata,
} from '../animator/svg-animator';
import { optimizeSvg } from '../animator/svg-optimizer';
import { createSpinner } from '../utils/spinner';
import type { AnimationOptions } from '../animator/svg-animator';
import type { CDExecutorOptions } from '../executor/types';


//#region Types

interface RenderArgs {
  file: string;
  output?: string;
  verbose?: boolean;
  loop?: boolean;
  'pause-at-end'?: number;
  'loop-pause'?: number;
  'fade-duration'?: number;
  'rewind-speed'?: number;
  fps?: number;
  'loop-style'?: 'loop' | 'reverse' | 'rewind' | 'fade';
  optimize?: boolean;
  legacy?: boolean;
  'custom-glyphs'?: boolean;
  'playback-speed'?: number;
  // CLI overrides for executor options
  width?: number;
  height?: number;
  title?: string;
  theme?: string;
  'font-size'?: number;
  'line-height'?: number;
  template?: string;
  padding?: number;
  'border-radius'?: number;
  'border-color'?: string;
  'border-width'?: number;
  'font-family'?: string;
  watermark?: string;
  'cursor-style'?: string;
  'cursor-color'?: string;
  'cursor-blink'?: boolean;
  'header-background'?: string;
  'header-height'?: number;
  'header-border'?: boolean;
  'header-border-color'?: string;
  'header-border-width'?: number;
  'footer-background'?: string;
  'footer-height'?: number;
  'footer-border'?: boolean;
  'footer-border-color'?: string;
  'footer-border-width'?: number;
  'letter-spacing'?: number;
  background?: string;
  'background-padding'?: number;
  'background-radius'?: number;
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

/**
 * Build executor options from CLI args.
 * Script settings are applied by CDExecutor.execute() via applySetting,
 * then CLI overrides are applied via applyCliOverrides.
 * This function extracts CLI args that should override script settings.
 */
const buildExecutorOptions = (args: RenderArgs): Partial<CDExecutorOptions> => {
  const options: Partial<CDExecutorOptions> = {};

  // Only include CLI args that were explicitly provided
  if (args.width !== undefined) options.width = args.width;
  if (args.height !== undefined) options.height = args.height;
  if (args['font-size'] !== undefined) options.fontSize = args['font-size'];
  if (args['line-height'] !== undefined) options.lineHeight = args['line-height'];
  if (args.title !== undefined) options.title = args.title;
  if (args.template !== undefined) options.template = args.template as 'macos' | 'windows' | 'minimal';
  if (args.theme !== undefined) options.theme = args.theme;
  if (args.padding !== undefined) options.padding = args.padding;
  if (args['border-radius'] !== undefined) options.borderRadius = args['border-radius'];
  if (args['border-color'] !== undefined) options.borderColor = args['border-color'];
  if (args['border-width'] !== undefined) options.borderWidth = args['border-width'];
  if (args['font-family'] !== undefined) options.fontFamily = args['font-family'];
  if (args.watermark !== undefined) options.watermark = args.watermark;
  if (args['cursor-style'] !== undefined) options.cursorStyle = args['cursor-style'];
  if (args['cursor-color'] !== undefined) options.cursorColor = args['cursor-color'];
  if (args['cursor-blink'] !== undefined) options.cursorBlink = args['cursor-blink'];
  if (args['header-background'] !== undefined) options.headerBackground = args['header-background'];
  if (args['header-height'] !== undefined) options.headerHeight = args['header-height'];
  if (args['header-border'] !== undefined) options.headerBorder = args['header-border'];
  if (args['header-border-color'] !== undefined) options.headerBorderColor = args['header-border-color'];
  if (args['header-border-width'] !== undefined) options.headerBorderWidth = args['header-border-width'];
  if (args['footer-background'] !== undefined) options.footerBackground = args['footer-background'];
  if (args['footer-height'] !== undefined) options.footerHeight = args['footer-height'];
  if (args['footer-border'] !== undefined) options.footerBorder = args['footer-border'];
  if (args['footer-border-color'] !== undefined) options.footerBorderColor = args['footer-border-color'];
  if (args['footer-border-width'] !== undefined) options.footerBorderWidth = args['footer-border-width'];
  if (args['letter-spacing'] !== undefined) options.letterSpacing = args['letter-spacing'];
  if (args.background !== undefined) options.background = args.background;
  if (args['background-padding'] !== undefined) options.backgroundPadding = args['background-padding'];
  if (args['background-radius'] !== undefined) options.backgroundRadius = args['background-radius'];
  if (args['playback-speed'] !== undefined) options.playbackSpeed = args['playback-speed'];

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
  const spinner = createSpinner(`\x1b[37mExecuting\x1b[0m ${fileName}`);

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

    let outputPath = args.output || script.output || args.file.replace(/\.cd$/, '.svg');
    // Ensure .svg extension
    if (!outputPath.endsWith('.svg')) {
      outputPath += '.svg';
    }

    if (script.requirements.length > 0 && args.verbose) {
      console.log(`Requirements specified: ${script.requirements.join(', ')}`);
    }

    const executorOptions = buildExecutorOptions(args);

    const executor = new CDExecutor({
      ...executorOptions,
      onProgress: (current: number, total: number, description?: string) => {
        const colorCode = description ? getCommandColor(description) : '';
        const descText = description ? ` \x1b[1m${colorCode}${description}\x1b[0m` : '';
        if (args.verbose) {
          console.log(`\x1b[37mExecuting\x1b[0m \x1b[2mcommand ${current}/${total}\x1b[0m${descText}`);
        } else {
          spinner.update(`\x1b[37mExecuting\x1b[0m \x1b[2m${fileName} (${current}/${total})\x1b[0m${descText}`);
        }
      },
    });

    const frames = await executor.execute(script);

    if (args.verbose) {
      console.log(`Captured ${frames.length} frames`);
    } else {
      spinner.update('Generating animated SVG');
    }

    // Use CLI options if provided, otherwise use script's settings
    const loopStyle = args['loop-style'] || executor.getLoopStyle();
    const loopPause = args['loop-pause'] ?? executor.getLoopPause();
    const fadeDuration = args['fade-duration'] ?? executor.getFadeDuration();
    const rewindSpeed = args['rewind-speed'] ?? executor.getRewindSpeed();

    const animationOptions: AnimationOptions = {
      fps: args.fps,
      loop: args.loop !== false,
      pauseAtEnd: args['pause-at-end'] ?? 1000,
      loopStyle,
      loopPause,
      fadeDuration,
      rewindSpeed,
    };

    let svg: string;

    if (args.legacy) {
      // Use legacy animated rendering (pre-filmstrip method)
      svg = await createAnimatedSVG(frames, animationOptions);
    } else {
      // Default: filmstrip rendering for smaller file sizes with truecolor
      const ctx = executor.getContext();
      const frameData = executor.getFrameData();
      svg = createFilmstripSVG({
        frameData,
        theme: ctx.theme,
        width: ctx.width,
        height: ctx.height,
        fontSize: ctx.fontSize,
        template: ctx.template,
        title: ctx.title,
        watermark: typeof ctx.watermark === 'string' ? ctx.watermark : ctx.watermark?.content,
        lineHeight: ctx.fontSize * ctx.lineHeight,
        charWidth: ctx.fontSize * ctx.charWidthRatio,
        padding: ctx.padding,
        borderRadius: ctx.borderRadius,
        headerHeight: ctx.headerHeight,
        footerHeight: ctx.footerHeight,
        cursorStyle: ctx.cursorStyle,
        cursorColor: ctx.cursorColor,
        cursorBlink: ctx.cursorBlink,
        fontFamily: ctx.fontFamily,
        background: ctx.background,
        backgroundPadding: ctx.backgroundPadding,
        backgroundRadius: ctx.backgroundRadius,
        headerBackground: ctx.headerBackground,
        footerBackground: ctx.footerBackground,
        customGlyphs: args['custom-glyphs'],
      }, animationOptions);
    }

    if (args.optimize !== false) {
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
    } else if (args.verbose) {
      console.log('Skipping optimization (--no-optimize)');
    }

    const metadata = getAnimationMetadata(frames);

    writeFileSync(outputPath, svg, 'utf-8');

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

    const durationStr = (metadata.duration / 1000).toFixed(2) + 's';

    if (args.verbose) {
      console.log(`\n${green}✓${reset} ${white}Created${reset} ${lightBlue}${outputPath}${reset}`);
      console.log(`  ${dim}├─${reset} ${lightPink}${metadata.frameCount}${reset}${dim} frames${reset}`);
      console.log(`  ${dim}├─${reset} ${lightOrange}${durationStr}${reset}${dim} duration${reset}`);
      console.log(`  ${dim}└─${reset} ${limeGreen}${sizeKB}KB${reset}${dim} optimized${reset}`);
    } else {
      spinner.successMultiline([
        `${green}✓${reset} ${white}Created${reset} ${lightBlue}${outputPath}${reset}`,
        `  ${dim}├─${reset} ${lightPink}${metadata.frameCount}${reset}${dim} frames${reset}`,
        `  ${dim}├─${reset} ${lightOrange}${durationStr}${reset}${dim} duration${reset}`,
        `  ${dim}└─${reset} ${limeGreen}${sizeKB}KB${reset}${dim} optimized${reset}`,
      ]);
    }

    await executor.cleanup();
  } catch (err) {
    if (!args.verbose) {
      spinner.fail('Failed to render CD');
    }
    throw err;
  }
};

