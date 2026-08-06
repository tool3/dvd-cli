//#region Imports

import { createRequire } from 'node:module';
import type { ResvgRenderOptions } from '@resvg/resvg-js';


//#region Overview

/**
 * Rasterize the static per-frame SVGs the lib's `planVideo()` produces.
 *
 * Node has no built-in way to turn vectors into pixels: there's no canvas,
 * no text rasterizer, and ffmpeg ships no SVG decoder unless it happened to
 * be built against librsvg (most builds, including Homebrew's, are not).
 * Glyphs have to come from somewhere, so video export needs a rasterizer.
 *
 * It is therefore an *optional peer dependency*, loaded lazily right here.
 * `dvd` installs with exactly the same dependency set it always had; only
 * people who actually want video pay for it, and they get told precisely
 * what to run. resvg specifically because it's a prebuilt binary — no
 * node-gyp, no cairo, no system librsvg — and because it consumes the SVG
 * the lib already emits rather than needing a second renderer.
 */

const INSTALL_HINT =
  'Video output needs a rasterizer. Install it once with:\n' +
  '  npm install -g @resvg/resvg-js\n' +
  '(or add it to your project if you installed dvd locally).\n' +
  'SVG output does not require it.';

// `require` rather than a static import so the module is only resolved when
// someone actually encodes a video. A static import would make the whole
// CLI fail to load when the optional peer isn't installed.
const requireOptional = createRequire(__filename);

type ResvgModule = {
  Resvg: new (svg: string, options?: ResvgRenderOptions | null) => {
    render(): { pixels: Buffer; width: number; height: number };
  };
};

const loadResvg = (): ResvgModule => {
  try {
    return requireOptional('@resvg/resvg-js') as ResvgModule;
  } catch {
    throw new Error(INSTALL_HINT);
  }
};


//#region Font Resolution

/**
 * The emitted SVG asks for `ui-monospace, SFMono-Regular, monospace`.
 * `ui-monospace` is a CSS system keyword that no font database resolves,
 * and `SFMono-Regular` is a PostScript name that isn't installed as a
 * normal family, so in practice everything lands on the generic
 * `monospace` — which resvg only maps to something real if we tell it
 * what that is. Left unset, text silently renders in a proportional
 * fallback and the whole grid alignment falls apart.
 */
const platformMonospace = (): string => {
  switch (process.platform) {
    case 'darwin':
      return 'Menlo';
    case 'win32':
      return 'Consolas';
    default:
      return 'DejaVu Sans Mono';
  }
};

export interface RasterizerOptions {
  /** Exact output width in pixels — must match the SVG's own width. */
  width: number;
  /** Exact output height in pixels. */
  height: number;
  /** Extra font files to load (e.g. the exact face the SVG names). */
  fontFiles?: string[];
  /** Family to resolve generic `monospace` to. Defaults per platform. */
  monospaceFamily?: string;
}

export type Rasterizer = (svg: string) => Buffer;


//#region Rasterizer

/**
 * Build a reusable rasterizer that returns raw RGBA pixels.
 *
 * RGBA rather than PNG on purpose: these frames go straight into ffmpeg's
 * `rawvideo` demuxer, so encoding a PNG here just to have ffmpeg decode it
 * again would be pure overhead on every single frame.
 */
export const createRasterizer = (options: RasterizerOptions): Rasterizer => {
  const { Resvg } = loadResvg();
  const monospaceFamily = options.monospaceFamily ?? platformMonospace();

  const resvgOptions: ResvgRenderOptions = {
    // The SVG is already authored at the exact pixel size we want, so
    // pinning width keeps the buffer dimensions predictable regardless of
    // any rounding resvg might otherwise apply.
    fitTo: { mode: 'width', value: options.width },
    font: {
      loadSystemFonts: true,
      fontFiles: options.fontFiles,
      monospaceFamily,
      defaultFontFamily: monospaceFamily,
    },
    // resvg warns on every unresolved family; with one frame per 33ms that
    // would bury the progress output.
    logLevel: 'off',
  };

  return (svg: string): Buffer => {
    const rendered = new Resvg(svg, resvgOptions).render();
    if (rendered.width !== options.width || rendered.height !== options.height) {
      throw new Error(
        `Rasterized frame is ${rendered.width}x${rendered.height}, expected ` +
          `${options.width}x${options.height}. Raw video frames must all be ` +
          `the same size.`,
      );
    }
    return rendered.pixels;
  };
};
