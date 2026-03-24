#!/usr/bin/env node

//#region Imports

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { themes } from 'shellfie';
import { renderCommand } from './commands/render';
import { renderCastCommand } from './commands/render-cast';
import { pipeCommand } from './commands/pipe';
import { newCommand } from './commands/new';
import { themesCommand } from './commands/themes';
import { validateCommand } from './commands/validate';

// Generate theme choices from shellfie themes
const themeChoices = Object.keys(themes) as string[];


//#region CLI Override Detection

/**
 * Get the set of option names that were explicitly provided by the user.
 * This allows .cd file settings to take precedence over CLI defaults,
 * while still allowing explicit CLI overrides.
 */
const getExplicitlyProvidedArgs = (): Set<string> => {
  const args = process.argv.slice(2);
  const explicit = new Set<string>();

  for (const arg of args) {
    // Handle --option=value and --option value formats
    if (arg.startsWith('--')) {
      const optName = arg.slice(2).split('=')[0];
      explicit.add(optName);
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Handle -T value format (single char alias)
      explicit.add(arg.slice(1));
    }
  }

  return explicit;
};

/**
 * Returns value only if it was explicitly provided by user, otherwise undefined.
 * This allows .cd file settings to be used when CLI arg is just the default.
 */
const ifExplicit = <T>(
  explicit: Set<string>,
  value: T,
  ...names: string[]
): T | undefined => {
  for (const name of names) {
    if (explicit.has(name)) {
      return value;
    }
  }
  return undefined;
};


//#region CLI Parser

const createParser = () =>
  yargs(hideBin(process.argv))
    .scriptName('dvd')
    .usage('$0 [options] <file>')
    .usage('')
    .usage('Create animated SVG terminal recordings from .cd scripts')
    .positional('file', {
      type: 'string',
      describe: '.cd script file to render',
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      describe: 'Output SVG file path',
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      describe: 'Verbose output',
      default: false,
    })
    .option('loop', {
      alias: 'l',
      type: 'boolean',
      describe: 'Loop animation',
      default: true,
    })
    .option('optimize', {
      alias: 'O',
      type: 'boolean',
      describe: 'Optimize SVG output (use --no-optimize for pretty-printed output)',
      default: true,
    })
    .option('legacy', {
      alias: 'x',
      type: 'boolean',
      describe: 'Use legacy animated rendering instead of filmstrip',
      default: false,
      hidden: true,
    })
    .option('smil', {
      type: 'boolean',
      describe: 'Use SMIL-based animation (frame-per-SVG-group with <animate> visibility switching)',
      default: false,
    })
    .option('custom-glyphs', {
      alias: 'G',
      type: 'boolean',
      describe: 'Render block elements (▀▄█) as geometric shapes for seamless display',
      default: true,
    })
    .option('loop-style', {
      alias: 'L',
      type: 'string',
      choices: ['loop', 'reverse', 'rewind', 'fade'],
      describe: 'Animation loop style (default: loop, or from .cd file)',
    })
    .option('rewind-speed', {
      alias: 'r',
      type: 'number',
      describe: 'Speed multiplier for rewind loop style (default: 5)',
    })
    .option('pause-at-end', {
      alias: 'p',
      type: 'number',
      describe: 'Pause duration at end (ms) (default: 1000)',
    })
    .option('loop-pause', {
      alias: 'P',
      type: 'number',
      describe: 'Pause duration before loop restarts (ms) (default: 0)',
    })
    .option('fade-duration', {
      alias: 'F',
      type: 'number',
      describe: 'Fade duration for fade loop style (ms) (default: 1500)',
    })
    .option('fps', {
      alias: 'f',
      type: 'number',
      describe: 'Frames per second',
    })
    .option('width', {
      alias: 'W',
      type: 'number',
      describe: 'Output width in pixels (auto-detected if not specified)',
    })
    .option('height', {
      alias: 'H',
      type: 'number',
      describe: 'Output height in pixels (auto-detected if not specified)',
    })
    .option('title', {
      type: 'string',
      alias: 't',
      describe: 'Window title text',
    })
    .option('theme', {
      alias: 'T',
      type: 'string',
      choices: themeChoices,
      describe: 'Color theme',
      default: 'dark',
    })
    .option('font-size', {
      alias: 's',
      type: 'number',
      describe: 'Font size in pixels (default: 14)',
    })
    .option('line-height', {
      alias: 'Y',
      type: 'number',
      describe: 'Line height multiplier (default: 1.4)',
    })
    .option('template', {
      alias: 'm',
      type: 'string',
      choices: ['macos', 'windows', 'minimal'],
      describe: 'Window template style (default: macos)',
    })
    .option('padding', {
      alias: 'd',
      type: 'number',
      describe: 'Content padding in pixels (default: 16)',
    })
    .option('border-radius', {
      alias: 'R',
      type: 'number',
      describe: 'Window border radius in pixels',
      default: 8,
    })
    .option('border-color', {
      alias: 'C',
      type: 'string',
      describe: 'Border color (hex)',
    })
    .option('border-width', {
      alias: 'B',
      type: 'number',
      describe: 'Border width in pixels',
    })
    .option('font-family', {
      alias: 'y',
      type: 'string',
      describe: 'Custom font family name',
    })
    .option('watermark', {
      alias: 'w',
      type: 'string',
      describe: 'Watermark text',
    })
    .option('cursor-style', {
      alias: 'c',
      type: 'string',
      choices: ['block', 'bar', 'underline'],
      describe: 'Cursor style',
      default: 'block',
    })
    .option('cursor-color', {
      alias: 'k',
      type: 'string',
      describe: 'Cursor color (hex)',
    })
    .option('cursor-blink', {
      alias: 'K',
      type: 'boolean',
      describe: 'Enable cursor blinking',
      default: true,
    })
    .option('header-background', {
      alias: 'b',
      type: 'string',
      describe: 'Header background color (hex)',
    })
    .option('header-height', {
      alias: 'e',
      type: 'number',
      describe: 'Header height in pixels',
    })
    .option('header-border', {
      alias: 'D',
      type: 'boolean',
      describe: 'Show header border',
    })
    .option('header-border-color', {
      alias: 'E',
      type: 'string',
      describe: 'Header border color (hex)',
    })
    .option('header-border-width', {
      type: 'number',
      describe: 'Header border width in pixels',
    })
    .option('footer-background', {
      alias: 'g',
      type: 'string',
      describe: 'Footer background color (hex)',
    })
    .option('footer-height', {
      alias: 'i',
      type: 'number',
      describe: 'Footer height in pixels',
    })
    .option('footer-border', {
      alias: 'I',
      type: 'boolean',
      describe: 'Show footer border',
    })
    .option('footer-border-color', {
      alias: 'J',
      type: 'string',
      describe: 'Footer border color (hex)',
    })
    .option('footer-border-width', {
      alias: 'j',
      type: 'number',
      describe: 'Footer border width in pixels',
    })
    .option('letter-spacing', {
      alias: 'a',
      type: 'number',
      describe: 'Letter spacing in pixels (default: 0)',
    })
    .option('background', {
      alias: 'A',
      type: 'string',
      describe: 'Outer background color or gradient, e.g. "#ff0000" or "gradient(#ff0000, #0000ff)"',
    })
    .option('background-padding', {
      alias: 'n',
      type: 'number',
      describe: 'Padding around terminal window in pixels (default: 0)',
    })
    .option('background-radius', {
      type: 'number',
      describe: 'Border radius for outer background (default: 12)',
    })
    .option('playback-speed', {
      alias: 'S',
      type: 'number',
      describe: 'Animation playback speed multiplier (default: 1)',
    })
    .command(
      'new [name]',
      'Create a new .cd script from template',
      (yargs) =>
        yargs
          .positional('name', {
            type: 'string',
            describe: 'Name for new script',
            default: 'demo',
          })
          .option('template', {
            alias: 't',
            type: 'string',
            choices: ['basic', 'showcase', 'keyboard'],
            describe: 'Template to use',
            default: 'basic',
          }),
      async (args) => {
        try {
          await newCommand(args as any);
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    )
    .command(
      'themes',
      'List available themes',
      {},
      () => {
        try {
          themesCommand();
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    )
    .command(
      'validate <file>',
      'Validate a .cd script',
      (yargs) =>
        yargs.positional('file', {
          type: 'string',
          describe: '.cd script file to validate',
          demandOption: true,
        }),
      async (args) => {
        try {
          await validateCommand(args as any);
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    )
    .command(
      'render <file>',
      'Render an asciinema .cast file to SVG',
      (yargs) =>
        yargs
          .positional('file', {
            type: 'string',
            describe: '.cast file to render',
            demandOption: true,
          })
          .option('output', {
            alias: 'o',
            type: 'string',
            describe: 'Output SVG file path',
          })
          .option('theme', {
            alias: 'T',
            type: 'string',
            choices: themeChoices,
            describe: 'Color theme',
            default: 'dark',
          })
          .option('template', {
            alias: 'm',
            type: 'string',
            choices: ['macos', 'windows', 'minimal'],
            describe: 'Window template style',
            default: 'macos',
          })
          .option('title', {
            alias: 't',
            type: 'string',
            describe: 'Window title text',
          })
          .option('font-size', {
            alias: 's',
            type: 'number',
            describe: 'Font size in pixels (default: 14)',
          })
          .option('line-height', {
            alias: 'Y',
            type: 'number',
            describe: 'Line height multiplier (default: 1.4)',
          })
          .option('padding', {
            alias: 'd',
            type: 'number',
            describe: 'Content padding in pixels (default: 16)',
          })
          .option('border-radius', {
            alias: 'R',
            type: 'number',
            describe: 'Window border radius in pixels (default: 8)',
          })
          .option('custom-glyphs', {
            alias: 'G',
            type: 'boolean',
            describe: 'Render block elements as geometric shapes',
            default: true,
          })
          .option('cursor-blink', {
            type: 'boolean',
            describe: 'Enable cursor blinking animation (default: false for cast files)',
            default: false,
          })
          .option('cursor', {
            type: 'boolean',
            describe: 'Enable cursor rendering (use --no-cursor to disable)',
            default: true,
          })
          .option('loop-style', {
            alias: 'L',
            type: 'string',
            choices: ['loop', 'reverse', 'rewind', 'fade'],
            describe: 'Animation loop style',
            default: 'loop',
          })
          .option('verbose', {
            alias: 'v',
            type: 'boolean',
            describe: 'Verbose output',
            default: false,
          })
          .option('optimize', {
            alias: 'O',
            type: 'boolean',
            describe: 'Optimize SVG output',
            default: true,
          }),
      async (args) => {
        try {
          await renderCastCommand(args as any);
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
    )
    .example('$0 demo.cd', 'Render demo.cd to demo.svg')
    .example('$0 script.cd -o output.svg', 'Render with custom output')
    .example('command | $0 -o output.svg', 'Read from stdin (auto-detected)')
    .example('$0 new my-demo --template showcase', 'Create new script from template')
    .example('$0 themes', 'List available themes')
    .example('$0 validate script.cd', 'Validate a script')
    .example('$0 render recording.cast -T dracula', 'Render asciinema cast with Dracula theme')
    .demandCommand(0)
    .help()
    .alias('help', 'h')
    .version()
    .alias('version', 'V')
    .wrap(Math.min(100, process.stdout.columns || 80))
    .showHelpOnFail(true);


//#region Main Entry

const run = async (): Promise<void> => {
  const parser = createParser();
  const argv = await parser.parse();

  const subcommands = ['new', 'themes', 'validate', 'render'];
  const ranSubcommand = subcommands.some((cmd) => argv._.includes(cmd));

  if (ranSubcommand) {
    return;
  }

  const file = argv._[0] as string | undefined;

  const isPiped = !process.stdin.isTTY;

  if (file === '-' || (isPiped && !file)) {
    try {
      await pipeCommand({
        output: argv.output,
        verbose: argv.verbose,
        loop: argv.loop,
        'pause-at-end': argv['pause-at-end'],
        'loop-pause': argv['loop-pause'],
        'fade-duration': argv['fade-duration'],
        'rewind-speed': argv['rewind-speed'],
        'loop-style': argv['loop-style'] as 'loop' | 'reverse' | 'rewind' | 'fade',
        width: argv.width,
        height: argv.height,
        title: argv.title,
        theme: argv.theme,
        fontSize: argv['font-size'],
        lineHeight: argv['line-height'],
        template: argv.template as string,
        padding: argv.padding,
        borderRadius: argv['border-radius'],
        borderColor: argv['border-color'],
        borderWidth: argv['border-width'],
        fontFamily: argv['font-family'],
        watermark: argv.watermark,
        cursorStyle: argv['cursor-style'],
        cursorColor: argv['cursor-color'],
        cursorBlink: argv['cursor-blink'],
        headerBackground: argv['header-background'],
        headerHeight: argv['header-height'],
        headerBorder: argv['header-border'],
        headerBorderColor: argv['header-border-color'],
        headerBorderWidth: argv['header-border-width'],
        footerBackground: argv['footer-background'],
        footerHeight: argv['footer-height'],
        footerBorder: argv['footer-border'],
        footerBorderColor: argv['footer-border-color'],
        footerBorderWidth: argv['footer-border-width'],
        letterSpacing: argv['letter-spacing'],
        background: argv.background,
        backgroundPadding: argv['background-padding'],
        backgroundRadius: argv['background-radius'],
        playbackSpeed: argv['playback-speed'],
        customGlyphs: argv['custom-glyphs'],
        smil: argv.legacy || argv.smil,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (!file) {
    parser.showHelp();
    process.exit(0);
  }

  try {
    // Detect which args were explicitly provided by user (not defaults)
    const explicit = getExplicitlyProvidedArgs();

    await renderCommand({
      file,
      output: argv.output,
      verbose: argv.verbose,
      loop: argv.loop,
      'pause-at-end': argv['pause-at-end'],
      'loop-pause': argv['loop-pause'],
      'fade-duration': argv['fade-duration'],
      'rewind-speed': argv['rewind-speed'],
      fps: argv.fps,
      'loop-style': argv['loop-style'] as 'loop' | 'reverse' | 'rewind' | 'fade',
      optimize: argv.optimize,
      legacy: argv.legacy || argv.smil,
      'custom-glyphs': argv['custom-glyphs'],
      'playback-speed': argv['playback-speed'],
      // Pass through styling options only if explicitly provided by user
      // This allows .cd file settings to take precedence over CLI defaults
      width: ifExplicit(explicit, argv.width, 'width', 'W'),
      height: ifExplicit(explicit, argv.height, 'height', 'H'),
      title: ifExplicit(explicit, argv.title, 'title', 't'),
      theme: ifExplicit(explicit, argv.theme, 'theme', 'T'),
      'font-size': ifExplicit(explicit, argv['font-size'], 'font-size', 's'),
      'line-height': ifExplicit(explicit, argv['line-height'], 'line-height', 'Y'),
      template: ifExplicit(explicit, argv.template as string, 'template', 'm'),
      padding: ifExplicit(explicit, argv.padding, 'padding', 'd'),
      'border-radius': ifExplicit(explicit, argv['border-radius'], 'border-radius', 'R'),
      'border-color': ifExplicit(explicit, argv['border-color'], 'border-color', 'C'),
      'border-width': ifExplicit(explicit, argv['border-width'], 'border-width', 'B'),
      'font-family': ifExplicit(explicit, argv['font-family'], 'font-family', 'y'),
      watermark: ifExplicit(explicit, argv.watermark, 'watermark', 'w'),
      'cursor-style': ifExplicit(explicit, argv['cursor-style'], 'cursor-style', 'c'),
      'cursor-color': ifExplicit(explicit, argv['cursor-color'], 'cursor-color', 'k'),
      'cursor-blink': ifExplicit(explicit, argv['cursor-blink'], 'cursor-blink', 'K'),
      'header-background': ifExplicit(explicit, argv['header-background'], 'header-background', 'b'),
      'header-height': ifExplicit(explicit, argv['header-height'], 'header-height', 'e'),
      'header-border': ifExplicit(explicit, argv['header-border'], 'header-border', 'D'),
      'header-border-color': ifExplicit(explicit, argv['header-border-color'], 'header-border-color', 'E'),
      'header-border-width': ifExplicit(explicit, argv['header-border-width'], 'header-border-width'),
      'footer-background': ifExplicit(explicit, argv['footer-background'], 'footer-background', 'g'),
      'footer-height': ifExplicit(explicit, argv['footer-height'], 'footer-height', 'i'),
      'footer-border': ifExplicit(explicit, argv['footer-border'], 'footer-border', 'I'),
      'footer-border-color': ifExplicit(explicit, argv['footer-border-color'], 'footer-border-color', 'J'),
      'footer-border-width': ifExplicit(explicit, argv['footer-border-width'], 'footer-border-width', 'j'),
      'letter-spacing': ifExplicit(explicit, argv['letter-spacing'], 'letter-spacing', 'a'),
      background: ifExplicit(explicit, argv.background, 'background', 'A'),
      'background-padding': ifExplicit(explicit, argv['background-padding'], 'background-padding', 'n'),
      'background-radius': ifExplicit(explicit, argv['background-radius'], 'background-radius'),
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
};

run();

