//#region Imports

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';


//#region Types

export interface CommandResult {
  output: Buffer;
  exitCode: number;
  duration: number;
}

export interface ShellOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  width?: number;
  height?: number;
}

export interface OutputChunk {
  data: Buffer;
  timestamp: number;
}


//#region Persistent Shell

export class PersistentShell extends EventEmitter {
  private proc: ChildProcess | null = null;
  private commandId = 0;
  private pendingCommand: {
    id: number;
    chunks: Buffer[];
    resolve: (result: CommandResult) => void;
    reject: (error: Error) => void;
    startTime: number;
  } | null = null;
  private outputBuffer: Buffer = Buffer.alloc(0);
  private isDestroyed = false;

  private shell: string;
  private cwd: string;
  private env: Record<string, string>;
  private width: number;
  private height: number;

  constructor(options: ShellOptions = {}) {
    super();
    this.shell = options.shell ?? process.env.SHELL ?? '/bin/bash';
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? {};
    this.width = options.width ?? 80;
    this.height = options.height ?? 24;
  }

  async start(): Promise<void> {
    if (this.proc) {
      throw new Error('Shell already started');
    }

    const env = {
      ...process.env,
      ...this.env,
      TERM: 'xterm-256color',
      COLUMNS: String(this.width),
      LINES: String(this.height),
      FORCE_COLOR: '1',
      CLICOLOR_FORCE: '1',
    };

    const isLinux = process.platform === 'linux';
    const isMac = process.platform === 'darwin';

    if (isLinux || isMac) {
      const scriptArgs = isLinux
        ? ['-qec', this.shell, '/dev/null']
        : ['-q', '/dev/null', this.shell];

      this.proc = spawn('script', scriptArgs, {
        cwd: this.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      this.proc = spawn(this.shell, ['-i'], {
        cwd: this.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    this.proc.stdout?.on('data', (data: Buffer) => {
      this.handleOutput(data);
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      this.handleOutput(data);
    });

    this.proc.on('close', (code) => {
      this.emit('close', code);
      this.proc = null;
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });

    await this.waitForPrompt();
  }

  private async waitForPrompt(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  private handleOutput(data: Buffer): void {
    this.emit('data', data);

    if (this.pendingCommand) {
      this.outputBuffer = Buffer.concat([this.outputBuffer, data]);
      this.pendingCommand.chunks.push(data);

      const output = this.outputBuffer.toString();
      const sentinel = `___DVD_SENTINEL_${this.pendingCommand.id}_`;
      const sentinelIndex = output.indexOf(sentinel);

      if (sentinelIndex !== -1) {
        const afterSentinel = output.slice(sentinelIndex + sentinel.length);
        const match = afterSentinel.match(/^(\d+)___/);
        const exitCode = match ? parseInt(match[1], 10) : 0;

        const cleanOutput = output.slice(0, sentinelIndex);
        const outputBuffer = Buffer.from(cleanOutput);

        const duration = Date.now() - this.pendingCommand.startTime;
        const pending = this.pendingCommand;
        this.pendingCommand = null;
        this.outputBuffer = Buffer.alloc(0);

        pending.resolve({
          output: outputBuffer,
          exitCode,
          duration,
        });
      }
    }
  }

  async execute(command: string): Promise<CommandResult> {
    if (!this.proc) {
      throw new Error('Shell not started');
    }

    if (this.isDestroyed) {
      throw new Error('Shell has been destroyed');
    }

    if (this.pendingCommand) {
      throw new Error('Another command is already executing');
    }

    const id = ++this.commandId;
    const sentinel = `___DVD_SENTINEL_${id}_`;

    return new Promise((resolve, reject) => {
      this.pendingCommand = {
        id,
        chunks: [],
        resolve,
        reject,
        startTime: Date.now(),
      };

      this.outputBuffer = Buffer.alloc(0);

      const fullCommand = `${command}; echo "${sentinel}$?___"\n`;
      this.proc!.stdin?.write(fullCommand);
    });
  }

  executeStreaming(
    command: string,
    onData: (chunk: OutputChunk) => void
  ): Promise<CommandResult> {
    if (!this.proc) {
      throw new Error('Shell not started');
    }

    const id = ++this.commandId;
    const sentinel = `___DVD_SENTINEL_${id}_`;
    const startTime = Date.now();
    const chunks: Buffer[] = [];
    let buffer = Buffer.alloc(0);

    return new Promise((resolve, reject) => {
      const dataHandler = (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);
        chunks.push(data);

        const output = buffer.toString();
        const sentinelIndex = output.indexOf(sentinel);

        if (sentinelIndex === -1) {
          onData({ data, timestamp: Date.now() - startTime });
        } else {
          const cleanOutput = output.slice(0, sentinelIndex);
          const afterSentinel = output.slice(sentinelIndex + sentinel.length);
          const match = afterSentinel.match(/^(\d+)___/);
          const exitCode = match ? parseInt(match[1], 10) : 0;

          if (cleanOutput.length > 0) {
            const lastChunkStart = output.lastIndexOf(data.toString());
            if (lastChunkStart < sentinelIndex) {
              const cleanData = Buffer.from(cleanOutput.slice(lastChunkStart));
              if (cleanData.length > 0) {
                onData({ data: cleanData, timestamp: Date.now() - startTime });
              }
            }
          }

          this.proc?.stdout?.off('data', dataHandler);
          this.proc?.stderr?.off('data', dataHandler);

          resolve({
            output: Buffer.from(cleanOutput),
            exitCode,
            duration: Date.now() - startTime,
          });
        }
      };

      this.proc!.stdout?.on('data', dataHandler);
      this.proc!.stderr?.on('data', dataHandler);

      const fullCommand = `${command}; echo "${sentinel}$?___"\n`;
      this.proc!.stdin?.write(fullCommand);
    });
  }

  write(data: string | Buffer): void {
    if (!this.proc) {
      throw new Error('Shell not started');
    }
    this.proc.stdin?.write(data);
  }

  signal(sig: NodeJS.Signals): void {
    if (this.proc) {
      this.proc.kill(sig);
    }
  }

  interrupt(): void {
    this.write('\x03');
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }

    if (this.pendingCommand) {
      this.pendingCommand.reject(new Error('Shell destroyed'));
      this.pendingCommand = null;
    }
  }

  isRunning(): boolean {
    return this.proc !== null && !this.isDestroyed;
  }
}


//#region Simple Shell

export const executeCommand = async (
  command: string,
  options: ShellOptions = {}
): Promise<CommandResult> => {
  const startTime = Date.now();
  const chunks: Buffer[] = [];

  const env = {
    ...process.env,
    ...options.env,
    TERM: 'xterm-256color',
    COLUMNS: String(options.width ?? 80),
    LINES: String(options.height ?? 24),
    FORCE_COLOR: '1',
    CLICOLOR_FORCE: '1',
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      shell: true,
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    proc.on('close', (code) => {
      resolve({
        output: Buffer.concat(chunks),
        exitCode: code ?? 0,
        duration: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
};

export const executeCommandStreaming = (
  command: string,
  onData: (chunk: OutputChunk) => void,
  options: ShellOptions = {}
): Promise<CommandResult> => {
  const startTime = Date.now();
  const chunks: Buffer[] = [];

  const env = {
    ...process.env,
    ...options.env,
    TERM: 'xterm-256color',
    COLUMNS: String(options.width ?? 80),
    LINES: String(options.height ?? 24),
    FORCE_COLOR: '1',
    CLICOLOR_FORCE: '1',
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      shell: true,
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      chunks.push(data);
      onData({ data, timestamp: Date.now() - startTime });
    });

    proc.stderr?.on('data', (data: Buffer) => {
      chunks.push(data);
      onData({ data, timestamp: Date.now() - startTime });
    });

    proc.on('close', (code) => {
      resolve({
        output: Buffer.concat(chunks),
        exitCode: code ?? 0,
        duration: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
};

