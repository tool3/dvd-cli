#!/usr/bin/env node
/**
 * DVD CLI - Cinema Display for Terminal Recordings
 * Create animated SVG terminal recordings from .cd scripts
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { renderCommand } from './commands/render';
import { newCommand } from './commands/new';
import { themesCommand } from './commands/themes';
import { validateCommand } from './commands/validate';

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
    .option('pause-at-end', {
      alias: 'p',
      type: 'number',
      describe: 'Pause duration at end (ms)',
      default: 1000,
    })
    .option('fps', {
      alias: 'f',
      type: 'number',
      describe: 'Frames per second',
    })
    .option('delta', {
      alias: 'd',
      type: 'boolean',
      describe: 'Use delta encoding (experimental, NOT compatible with GitHub)',
      default: false,
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
    .example('$0 demo.cd', 'Render demo.cd to demo.svg')
    .example('$0 script.cd -o output.svg', 'Render with custom output')
    .example('$0 new my-demo --template showcase', 'Create new script from template')
    .example('$0 themes', 'List available themes')
    .example('$0 validate script.cd', 'Validate a script')
    .demandCommand(0)
    .help()
    .alias('help', 'h')
    .version()
    .alias('version', 'V')
    .wrap(Math.min(100, process.stdout.columns || 80))
    .showHelpOnFail(true);

const run = async (): Promise<void> => {
  const parser = createParser();
  const argv = await parser.parse();

  // Check if a subcommand was run (new, themes, validate)
  const subcommands = ['new', 'themes', 'validate'];
  const ranSubcommand = subcommands.some((cmd) => argv._.includes(cmd));

  if (ranSubcommand) {
    return;
  }

  // Get the file argument (first positional argument)
  const file = argv._[0] as string | undefined;

  // Show help if no file was provided
  if (!file) {
    parser.showHelp();
    process.exit(0);
  }

  // Render the file
  try {
    await renderCommand({
      file,
      output: argv.output,
      verbose: argv.verbose,
      loop: argv.loop,
      'pause-at-end': argv['pause-at-end'],
      fps: argv.fps,
      delta: argv.delta,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
};

run();
