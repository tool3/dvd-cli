//#region Imports

import { writeFileSync } from 'node:fs';
import * as pty from 'node-pty';


//#region Types

export interface RecArgs {
  file?: string;
  command?: string;
  title?: string;
  overwrite?: boolean;
}

type CastEvent = [number, 'o' | 'i', string];

interface CastHeader {
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

const resolveShell = (): string => {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/bash';
};

const resolveOutputPath = (provided: string | undefined): string => {
  if (!provided) return 'recording.cast';
  return provided.endsWith('.cast') ? provided : `${provided}.cast`;
};

const getTerminalSize = (): { cols: number; rows: number } => ({
  cols: process.stdout.columns || 80,
  rows: process.stdout.rows || 24,
});


//#region Rec Command

export const recCommand = async (args: RecArgs): Promise<void> => {
  const interactive = !args.command;
  if (interactive && !process.stdin.isTTY) {
    throw new Error('dvd rec requires an interactive TTY. Run it directly in a terminal, or pass --command for a one-shot recording.');
  }

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

  const header: CastHeader = {
    version: 2,
    width: cols,
    height: rows,
    timestamp: Math.floor(startTime / 1000),
    env: {
      SHELL: shell,
      TERM: 'xterm-256color',
    },
  };
  if (args.title) header.title = args.title;

  const lines: string[] = [JSON.stringify(header)];
  for (const event of events) {
    lines.push(JSON.stringify(event));
  }
  writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');

  const duration = events.length > 0 ? events[events.length - 1][0] : 0;
  const sizeKB = (Buffer.byteLength(lines.join('\n'), 'utf-8') / 1024).toFixed(2);

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
