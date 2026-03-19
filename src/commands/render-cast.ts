//#region Imports

import { readFileSync, writeFileSync } from 'node:fs';
import { parseCastFile, generateFramesFromRecording } from '../recorder';
import { createFilmstripSVG } from '../animator/svg-animator';
import { optimizeSvg } from '../animator/svg-optimizer';
import { createSpinner } from '../utils/spinner';
import { themes } from '../pipeline';
import type { AnimationOptions } from '../animator/svg-animator';
import type { Theme } from '../types';


//#region Types

export interface RenderCastArgs {
  file: string;
  output?: string;
  verbose?: boolean;
  loop?: boolean;
  'pause-at-end'?: number;
  'loop-pause'?: number;
  'fade-duration'?: number;
  'rewind-speed'?: number;
  'loop-style'?: 'loop' | 'reverse' | 'rewind' | 'fade';
  optimize?: boolean;
  'custom-glyphs'?: boolean;
  // Styling options
  theme?: string;
  template?: 'macos' | 'windows' | 'minimal';
  'font-size'?: number;
  'line-height'?: number;
  padding?: number;
  'border-radius'?: number;
  'border-color'?: string;
  'border-width'?: number;
  'font-family'?: string;
  title?: string;
  watermark?: string;
  'cursor-style'?: 'block' | 'bar' | 'underline';
  'cursor-color'?: string;
  'cursor-blink'?: boolean;
  'header-background'?: string;
  'header-height'?: number;
  'footer-background'?: string;
  'footer-height'?: number;
  background?: string;
  'background-padding'?: number;
  'background-radius'?: number;
  // Dimension overrides
  width?: number;
  height?: number;
}


//#region Cast File Loader

const loadCastFile = (filePath: string) => {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseCastFile(content);
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Cast file not found: ${filePath}`);
    }
    throw err;
  }
};


//#region Theme Resolution

const resolveTheme = (themeName: string): Theme => {
  const theme = themes[themeName as keyof typeof themes];
  if (!theme) {
    const available = Object.keys(themes).join(', ');
    throw new Error(`Unknown theme: "${themeName}". Available themes: ${available}`);
  }
  return theme as Theme;
};


//#region Render Cast Command

export const renderCastCommand = async (args: RenderCastArgs): Promise<void> => {
  const fileName = args.file.split('/').pop() || args.file;
  const spinner = createSpinner(`\x1b[37mRendering\x1b[0m ${fileName}`);

  if (!args.verbose) {
    spinner.start();
  }

  try {
    // Load and parse the cast file
    if (args.verbose) {
      console.log(`Loading cast file: ${args.file}`);
    }
    const recording = loadCastFile(args.file);

    if (args.verbose) {
      console.log(`Parsed ${recording.events.length} events`);
      console.log(`Terminal size: ${recording.header.width}x${recording.header.height}`);
      if (recording.header.duration) {
        console.log(`Duration: ${recording.header.duration.toFixed(2)}s`);
      }
    }

    // Resolve theme
    const themeName = args.theme || 'dark';
    const theme = resolveTheme(themeName);

    if (args.verbose) {
      console.log(`Using theme: ${themeName}`);
    } else {
      spinner.update(`\x1b[37mRendering\x1b[0m \x1b[2m${fileName}\x1b[0m \x1b[36mGenerating frames\x1b[0m`);
    }

    // Generate frames from recording
    const frameData = generateFramesFromRecording(recording, theme);

    if (args.verbose) {
      console.log(`Generated ${frameData.length} frames`);
    }

    // Calculate dimensions
    const fontSize = args['font-size'] ?? 14;
    const lineHeight = args['line-height'] ?? 1.4;
    const padding = args.padding ?? 16;
    const charWidthRatio = 0.6;
    const template = args.template || 'macos';
    const headerHeight = args['header-height'] ?? (template === 'minimal' ? 0 : 40);
    const footerHeight = args['footer-height'] ?? 0;

    // Use cast dimensions or override
    const termWidth = args.width ?? recording.header.width;
    const termHeight = args.height ?? recording.header.height;

    const charWidth = fontSize * charWidthRatio;
    const lineHeightPx = fontSize * lineHeight;
    const contentWidth = termWidth * charWidth;
    const contentHeight = termHeight * lineHeightPx;
    const totalWidth = contentWidth + padding * 2;
    const totalHeight = contentHeight + headerHeight + footerHeight + padding * 2;

    // Build animation options
    const loopStyle = args['loop-style'] || 'loop';
    const animationOptions: AnimationOptions = {
      loop: args.loop !== false,
      pauseAtEnd: args['pause-at-end'] ?? 1000,
      loopStyle,
      loopPause: args['loop-pause'] ?? 0,
      fadeDuration: args['fade-duration'] ?? 1500,
      rewindSpeed: args['rewind-speed'] ?? 5,
    };

    if (!args.verbose) {
      spinner.update(`\x1b[37mRendering\x1b[0m \x1b[2m${fileName}\x1b[0m \x1b[35mGenerating SVG\x1b[0m`);
    }

    // Generate SVG using filmstrip renderer
    let svg = createFilmstripSVG({
      frameData,
      theme,
      width: totalWidth,
      height: totalHeight,
      fontSize,
      template,
      title: args.title || recording.header.title,
      watermark: args.watermark,
      lineHeight: lineHeightPx,
      charWidth,
      padding,
      borderRadius: args['border-radius'] ?? 8,
      headerHeight,
      footerHeight,
      cursorStyle: args['cursor-style'] || 'block',
      cursorColor: args['cursor-color'],
      cursorBlink: args['cursor-blink'] !== false,
      fontFamily: args['font-family'],
      background: args.background,
      backgroundPadding: args['background-padding'],
      backgroundRadius: args['background-radius'],
      headerBackground: args['header-background'],
      footerBackground: args['footer-background'],
      customGlyphs: args['custom-glyphs'],
    }, animationOptions);

    // Optimize
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
    }

    // Determine output path
    let outputPath = args.output || args.file.replace(/\.cast$/, '.svg');
    // Ensure .svg extension
    if (!outputPath.endsWith('.svg')) {
      outputPath += '.svg';
    }

    // Write output
    writeFileSync(outputPath, svg, 'utf-8');

    // Calculate duration from frames
    const duration = frameData.length > 0
      ? frameData[frameData.length - 1].timestamp / 1000
      : 0;

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

    const durationStr = duration.toFixed(2) + 's';

    if (args.verbose) {
      console.log(`\n${green}✓${reset} ${white}Created${reset} ${lightBlue}${outputPath}${reset}`);
      console.log(`  ${dim}├─${reset} ${lightPink}${frameData.length}${reset}${dim} frames${reset}`);
      console.log(`  ${dim}├─${reset} ${lightOrange}${durationStr}${reset}${dim} duration${reset}`);
      console.log(`  ${dim}└─${reset} ${limeGreen}${sizeKB}KB${reset}${dim} optimized${reset}`);
    } else {
      spinner.successMultiline([
        `${green}✓${reset} ${white}Created${reset} ${lightBlue}${outputPath}${reset}`,
        `  ${dim}├─${reset} ${lightPink}${frameData.length}${reset}${dim} frames${reset}`,
        `  ${dim}├─${reset} ${lightOrange}${durationStr}${reset}${dim} duration${reset}`,
        `  ${dim}└─${reset} ${limeGreen}${sizeKB}KB${reset}${dim} optimized${reset}`,
      ]);
    }
  } catch (err) {
    if (!args.verbose) {
      spinner.fail('Failed to render cast file');
    }
    throw err;
  }
};
