//#region Imports

import { spawn } from 'node:child_process';
import { extname } from 'node:path';
import type { VideoPlan } from 'dvdrw';
import type { Rasterizer } from './rasterize';


//#region Overview

/**
 * Pipe rasterized frames into ffmpeg.
 *
 * Frames go over stdin as `rawvideo`/`rgba` rather than as a numbered PNG
 * sequence: no temp directory to create and clean up, no PNG encode on our
 * side plus decode on ffmpeg's, and the encoder starts working while we're
 * still rendering.
 *
 * ffmpeg has to be on PATH. That's the normal contract for a CLI that
 * produces video (vhs works the same way) and beats bundling a ~70MB
 * binary into an npm package.
 */


//#region Formats

export type VideoFormat = 'mp4' | 'webm' | 'gif';

const EXTENSIONS: Record<string, VideoFormat> = {
  '.mp4': 'mp4',
  '.m4v': 'mp4',
  '.mov': 'mp4',
  '.webm': 'webm',
  '.gif': 'gif',
};

/** Video format implied by an output path, or null for stills/SVG. */
export const formatFromPath = (path: string): VideoFormat | null =>
  EXTENSIONS[extname(path).toLowerCase()] ?? null;

/** Every extension that routes through the video encoder. */
export const VIDEO_EXTENSIONS = Object.keys(EXTENSIONS);

const encoderArgs = (format: VideoFormat): string[] => {
  switch (format) {
    case 'mp4':
      return [
        '-c:v', 'libx264',
        // yuv420p is what browsers, QuickTime and every social platform
        // will actually decode. It's also why the plan rounds dimensions
        // to even numbers.
        '-pix_fmt', 'yuv420p',
        '-preset', 'medium',
        // Terminal output is flat colour and hard edges, so it compresses
        // extremely well; 18 is visually lossless here.
        '-crf', '18',
        '-movflags', '+faststart',
      ];
    case 'webm':
      return [
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuv420p',
        '-crf', '30',
        '-b:v', '0',
        '-row-mt', '1',
      ];
    case 'gif':
      // A global 256-colour palette wrecks anti-aliased text, so generate
      // a palette from the actual frames. `stats_mode=diff` weights the
      // pixels that change, which is what the eye tracks in a terminal
      // animation.
      return [
        '-vf',
        'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
        '-loop', '0',
      ];
  }
};


//#region Encode

export interface EncodeOptions {
  plan: VideoPlan;
  /** Destination file path. Its extension must map to a `VideoFormat`. */
  output: string;
  format: VideoFormat;
  rasterize: Rasterizer;
  /** ffmpeg executable. Defaults to `ffmpeg` on PATH. */
  ffmpegPath?: string;
  onProgress?: (done: number, total: number) => void;
}

export const encodeVideo = async (options: EncodeOptions): Promise<void> => {
  const { plan, output, format, rasterize, onProgress } = options;
  const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${plan.width}x${plan.height}`,
    '-r', String(plan.fps),
    '-i', 'pipe:0',
    ...encoderArgs(format),
    output,
  ];

  const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });

  let stderr = '';
  ffmpeg.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // If ffmpeg dies mid-stream the pipe breaks and every subsequent write
  // raises EPIPE. Swallow those — the exit code and stderr below are the
  // real diagnosis, and an unhandled 'error' on stdin would crash the CLI
  // before we get to report it.
  ffmpeg.stdin.on('error', () => {});

  const finished = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `ffmpeg not found (tried "${ffmpegPath}"). Install it — ` +
              '`brew install ffmpeg`, `apt install ffmpeg`, or ' +
              '`winget install ffmpeg` — or set FFMPEG_PATH.',
          ),
        );
        return;
      }
      reject(err);
    });
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim();
      reject(
        new Error(
          `ffmpeg exited with code ${code}${detail ? `:\n${detail}` : ''}`,
        ),
      );
    });
  });

  // Track completion separately from `finished` so the writer loop can
  // observe it without ever seeing an unhandled rejection: `settled` always
  // resolves, and the real error is re-thrown once writing has stopped.
  //
  // This matters most when ffmpeg never starts at all. spawn reports ENOENT
  // asynchronously, so the first write still "succeeds" into a dead pipe,
  // returns false for backpressure, and the drain event it's waiting on can
  // never arrive — the CLI would hang forever instead of printing the
  // perfectly good "ffmpeg not found" message we prepared above.
  let done = false;
  let failure: Error | null = null;
  const settled = finished.then(
    () => {
      done = true;
    },
    (err: Error) => {
      done = true;
      failure = err;
    },
  );

  const drain = (): Promise<void> =>
    new Promise((resolve) => ffmpeg.stdin.once('drain', () => resolve()));

  try {
    let pixels: Buffer | null = null;
    for (const frame of plan.frames()) {
      if (done) break;
      // `repeatsPrevious` frames are identical to the one before, so the
      // raster is reused. Most frames repeat — typing is 50ms/char against
      // a 33ms output grid — which is where most of the time is saved.
      if (!frame.repeatsPrevious || pixels === null) {
        pixels = rasterize(frame.svg);
      }
      if (!ffmpeg.stdin.write(pixels)) {
        await Promise.race([drain(), settled]);
      }
      onProgress?.(frame.index + 1, plan.frameCount);
    }
  } finally {
    if (!done) ffmpeg.stdin.end();
  }

  await settled;
  if (failure) throw failure;
};
