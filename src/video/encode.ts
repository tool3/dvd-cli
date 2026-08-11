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

/**
 * Compose the filter chain. `pad` comes first so everything downstream —
 * including the GIF palette pass — sees the final even-sized canvas.
 * Padding rather than scaling keeps the text pixel-exact; the pad is at
 * most one pixel and replicates nothing, so it only ever appears as a
 * sliver of the encoder's background at the right/bottom edge.
 */
const buildFilter = (
  format: VideoFormat,
  pad: { width: number; height: number } | null,
): string[] => {
  const stages: string[] = [];
  if (pad) stages.push(`pad=${pad.width}:${pad.height}:0:0`);
  if (format === 'gif') {
    // A global 256-colour palette wrecks anti-aliased text, so generate
    // one from the actual frames. `stats_mode=diff` weights the pixels
    // that change, which is what the eye tracks in a terminal animation.
    stages.push(
      'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
    );
  }
  return stages.length > 0 ? ['-vf', stages.join(',')] : [];
};

const encoderArgs = (format: VideoFormat, crf: number): string[] => {
  switch (format) {
    case 'mp4':
      return [
        '-c:v', 'libx264',
        // yuv420p is what browsers, QuickTime and every social platform
        // will actually decode. It's also why the plan rounds dimensions
        // to even numbers.
        '-pix_fmt', 'yuv420p',
        // Terminal output is flat colour and hard edges, so it compresses
        // extremely well — a slower preset costs little and buys real
        // detail at the high tier.
        '-preset', crf <= 15 ? 'slow' : 'medium',
        '-crf', String(crf),
        '-movflags', '+faststart',
      ];
    case 'webm':
      return [
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuv420p',
        // VP9's CRF scale runs higher than x264's for equivalent quality.
        '-crf', String(Math.min(63, crf + 12)),
        '-b:v', '0',
        '-row-mt', '1',
      ];
    case 'gif':
      // Palette handling lives in `buildFilter` alongside the pad stage.
      return ['-loop', '0'];
  }
};


//#region Encode

export interface EncodeOptions {
  plan: VideoPlan;
  /** Destination file path. Its extension must map to a `VideoFormat`. */
  output: string;
  format: VideoFormat;
  rasterize: Rasterizer;
  /** Constant-rate factor. Defaults to the plan's quality tier. */
  crf?: number;
  /** ffmpeg executable. Defaults to `ffmpeg` on PATH. */
  ffmpegPath?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface EncodeResult {
  /** Pixel dimensions actually written, measured from the frames. */
  width: number;
  height: number;
}

export const encodeVideo = async (
  options: EncodeOptions,
): Promise<EncodeResult> => {
  const { plan, output, format, rasterize, onProgress } = options;
  const ffmpegPath = options.ffmpegPath ?? process.env.FFMPEG_PATH ?? 'ffmpeg';

  // Rasterize the first frame before spawning ffmpeg: rawvideo has no
  // headers, so the exact pixel dimensions have to be declared up front,
  // and the only authority on them is the rasterizer itself.
  const firstFrames = plan.frames();
  const first = firstFrames.next();
  if (first.done) throw new Error('No frames to encode');
  const firstRaster = rasterize(first.value.svg);
  const { width: rasterWidth, height: rasterHeight } = firstRaster;

  // Pad target is derived from the pixels we actually produced, not from
  // the plan. The rasterizer is the only thing that knows the true frame
  // size, and deriving it here means a stale or mismatched plan can never
  // make ffmpeg crop the picture.
  const evenUp = (n: number) => (n % 2 === 0 ? n : n + 1);
  const padWidth = evenUp(rasterWidth);
  const padHeight = evenUp(rasterHeight);
  const needsPad = padWidth !== rasterWidth || padHeight !== rasterHeight;
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${rasterWidth}x${rasterHeight}`,
    '-r', String(plan.fps),
    '-i', 'pipe:0',
    ...buildFilter(format, needsPad ? { width: padWidth, height: padHeight } : null),
    ...encoderArgs(format, options.crf ?? plan.encoding?.crf ?? 18),
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
    let pixels: Buffer = firstRaster.pixels;
    let frame = first.value;
    for (;;) {
      if (done) break;
      // `repeatsPrevious` frames are identical to the one before, so the
      // raster is reused. Most frames repeat — typing is 50ms/char against
      // a 33ms output grid — which is where most of the time is saved.
      if (frame.index > 0 && !frame.repeatsPrevious) {
        const raster = rasterize(frame.svg);
        if (raster.width !== rasterWidth || raster.height !== rasterHeight) {
          // rawvideo has no per-frame size, so a mismatch here wouldn't
          // error — ffmpeg would read the next frame at the wrong byte
          // offset and the rest of the video would be garbage.
          throw new Error(
            `Frame ${frame.index} rasterized to ${raster.width}x${raster.height}, ` +
              `but the stream was opened at ${rasterWidth}x${rasterHeight}. ` +
              'Every frame must be the same size.',
          );
        }
        pixels = raster.pixels;
      }
      if (!ffmpeg.stdin.write(pixels)) {
        await Promise.race([drain(), settled]);
      }
      onProgress?.(frame.index + 1, plan.frameCount);

      const next = firstFrames.next();
      if (next.done) break;
      frame = next.value;
    }
  } finally {
    if (!done) ffmpeg.stdin.end();
  }

  await settled;
  if (failure) throw failure;

  return { width: padWidth, height: padHeight };
};
