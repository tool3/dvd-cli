//#region Imports

import { chmodSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as pty from 'node-pty';


//#region Types

export interface RecArgs {
  file?: string;
  command?: string;
  title?: string;
  overwrite?: boolean;
}

export type CastEvent = [number, 'o' | 'i', string];

export interface CastHeader {
  version: 2;
  width: number;
  height: number;
  timestamp: number;
  title?: string;
  env: {
    SHELL: string;
    TERM: string;
  };
}


//#region Helpers

export const resolveShell = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string => {
  if (platform === 'win32') {
    return env.COMSPEC || 'cmd.exe';
  }
  return env.SHELL || '/bin/bash';
};

export const resolveOutputPath = (provided: string | undefined): string => {
  if (!provided) return 'recording.cast';
  return provided.endsWith('.cast') ? provided : `${provided}.cast`;
};

const getTerminalSize = (): { cols: number; rows: number } => ({
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
});

/**
 * node-pty ships a `spawn-helper` binary that must be executable for
 * posix_spawnp to fork a PTY. Some install paths (npm with --ignore-scripts,
 * older bun versions, tarball mangling) strip the exec bit, causing a cryptic
 * "posix_spawnp failed" on first use. Restore it ourselves rather than rely on
 * postinstall hooks running.
 */
export const ensurePtyHelperExecutable = (): void => {
  if (process.platform === 'win32') return;

  let helperPath: string;
  try {
    const pkgPath = require.resolve('node-pty/package.json');
    helperPath = resolve(
      dirname(pkgPath),
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper'
    );
  } catch {
    return;
  }

  let stats;
  try {
    stats = statSync(helperPath);
  } catch {
    return;
  }

  if ((stats.mode & 0o111) !== 0) return;

  try {
    chmodSync(helperPath, 0o755);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).message;
    throw new Error(
      `node-pty's spawn-helper at ${helperPath} is not executable and could not be chmod'd (${code}). ` +
      `Try reinstalling node-pty: rm -rf node_modules/node-pty && npm install`
    );
  }
};

/**
 * Serialize a cast recording into asciinema v2 NDJSON format.
 * Header on line 1, one event per line after. Trailing newline.
 */
export const serializeCast = (header: CastHeader, events: CastEvent[]): string => {
  const lines: string[] = [JSON.stringify(header)];
  for (const event of events) {
    lines.push(JSON.stringify(event));
  }
  return lines.join('\n') + '\n';
};

export const buildCastHeader = (opts: {
  cols: number;
  rows: number;
  startTimeMs: number;
  shell: string;
  title?: string;
}): CastHeader => {
  const header: CastHeader = {
    version: 2,
    width: opts.cols,
    height: opts.rows,
    timestamp: Math.floor(opts.startTimeMs / 1000),
    env: {
      SHELL: opts.shell,
      TERM: 'xterm-256color',
    },
  };
  if (opts.title) header.title = opts.title;
  return header;
};


//#region Rec Command

export const recCommand = async (args: RecArgs): Promise<void> => {
  const interactive = !args.command;
  if (interactive && !process.stdin.isTTY) {
    throw new Error('dvd rec requires an interactive TTY. Run it directly in a terminal, or pass --command for a one-shot recording.');
  }

  ensurePtyHelperExecutable();

  const outputPath = resolveOutputPath(args.file);
  const shell = resolveShell();
  const { cols, rows } = getTerminalSize();

  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  const green = '\x1b[32m';
  const lightBlue = '\x1b[94m';
  const white = '\x1b[37m';

  process.stdout.write(
    `${green}●${reset} ${white}Recording${reset} ${dim}to${reset} ${lightBlue}${outputPath}${reset}  ${dim}exit shell or press Ctrl+D to stop${reset}\n`
  );

  const shellArgs = args.command ? ['-c', args.command] : [];

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      DVD_REC: '1',
    },
  });

  const startTime = Date.now();
  const events: CastEvent[] = [];

  const now = (): number => (Date.now() - startTime) / 1000;

  const onPtyData = ptyProcess.onData((data: string) => {
    events.push([now(), 'o', data]);
    process.stdout.write(data);
  });

  const stdinListener = (data: Buffer): void => {
    ptyProcess.write(data.toString('utf-8'));
  };

  const onResize = (): void => {
    const size = getTerminalSize();
    try {
      ptyProcess.resize(size.cols, size.rows);
    } catch {
      // PTY may already be gone
    }
  };

  if (interactive) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', stdinListener);
    process.stdout.on('resize', onResize);
  }

  await new Promise<void>((resolve) => {
    ptyProcess.onExit(() => {
      onPtyData.dispose();
      if (interactive) {
        process.stdin.off('data', stdinListener);
        process.stdout.off('resize', onResize);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.pause();
      }
      resolve();
    });
  });

  const header = buildCastHeader({
    cols,
    rows,
    startTimeMs: startTime,
    shell,
    title: args.title,
  });

  const serialized = serializeCast(header, events);
  writeFileSync(outputPath, serialized, 'utf-8');

  const duration = events.length > 0 ? events[events.length - 1][0] : 0;
  const sizeKB = (Buffer.byteLength(serialized, 'utf-8') / 1024).toFixed(2);

  const lightPink = '\x1b[95m';
  const lightOrange = '\x1b[38;5;215m';
  const limeGreen = '\x1b[92m';

  process.stdout.write(
    `\n${green}✓${reset} ${white}Saved${reset} ${lightBlue}${outputPath}${reset}\n` +
    `  ${dim}├─${reset} ${lightPink}${events.length}${reset}${dim} events${reset}\n` +
    `  ${dim}├─${reset} ${lightOrange}${duration.toFixed(2)}s${reset}${dim} duration${reset}\n` +
    `  ${dim}└─${reset} ${limeGreen}${sizeKB}KB${reset}${dim} size${reset}\n\n` +
    `${dim}Render with:${reset} dvd render ${outputPath}\n`
  );
};
