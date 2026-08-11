//#region Imports

import { planVideo } from 'dvdrw';
import type { EmitterOptions, FrameData, VideoQuality } from 'dvdrw';
import { createRasterizer } from './rasterize';
import { encodeVideo, formatFromPath, VIDEO_EXTENSIONS, type VideoFormat } from './encode';


//#region Exports

export { formatFromPath, VIDEO_EXTENSIONS };
export type { VideoFormat };


//#region Write Video

export interface WriteVideoOptions {
  frameData: FrameData[];
  /** Resolved emitter options from the render (`DVDResult.emitter`). */
  emitter: EmitterOptions;
  output: string;
  format: VideoFormat;
  /** Output frame rate. Defaults to the lib's 30. */
  fps?: number;
  /** Times the animation plays end to end. Default 1. */
  loops?: number;
  /** Hold the last frame this long (ms) so the result stays readable. */
  pauseAtEnd?: number;
  /** Quality tier: `low`, `medium` (default) or `high` (2x supersampled). */
  quality?: VideoQuality;
  /** Font file to load so the video matches a specific face exactly. */
  fontFile?: string;
  monospaceFamily?: string;
  ffmpegPath?: string;
  onProgress?: (done: number, total: number) => void;
}

export interface WriteVideoResult {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationMs: number;
}

/**
 * Render an animation to a video file: plan the frame sequence in the lib,
 * rasterize each frame with resvg, stream them through ffmpeg.
 */
export const writeVideo = async (
  options: WriteVideoOptions,
): Promise<WriteVideoResult> => {
  const plan = planVideo(options.frameData, {
    emitter: options.emitter,
    fps: options.fps,
    loops: options.loops,
    pauseAtEnd: options.pauseAtEnd,
    quality: options.quality,
  });

  const rasterize = createRasterizer({
    fontFiles: options.fontFile ? [options.fontFile] : undefined,
    monospaceFamily: options.monospaceFamily,
  });

  const encoded = await encodeVideo({
    plan,
    output: options.output,
    format: options.format,
    rasterize,
    ffmpegPath: options.ffmpegPath,
    onProgress: options.onProgress,
  });

  return {
    // Report what was written, not what was planned — the encoder measures
    // the real frames, so this stays accurate even if the plan's own
    // dimensions came from an older lib.
    width: encoded.width,
    height: encoded.height,
    fps: plan.fps,
    frameCount: plan.frameCount,
    durationMs: plan.durationMs,
  };
};
