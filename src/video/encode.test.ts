import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VideoFrame, VideoPlan } from 'dvdrw';
import { createRasterizer } from './rasterize';
import { encodeVideo, formatFromPath } from './encode';

const dir = mkdtempSync(join(tmpdir(), 'dvd-cli-video-'));

const WIDTH = 120;
const HEIGHT = 60;

/**
 * A hand-rolled plan. `VideoPlan` is a plain interface, so the encoder can be
 * tested without running a full render — which keeps this fast and keeps the
 * timing arithmetic's own tests where they belong (in the lib).
 */
const fakePlan = (timeline: number[], fps = 10): VideoPlan => {
  const swatch = (i: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#111"/>` +
    `<rect x="4" y="4" width="${4 + i * 10}" height="20" fill="#7ac"/></svg>`;

  const render = (index: number) => swatch(timeline[index]);

  return {
    width: WIDTH,
    height: HEIGHT,
    fps,
    frameCount: timeline.length,
    durationMs: (timeline.length / fps) * 1000,
    timeline,
    render,
    *frames(): Generator<VideoFrame> {
      let lastSvg = '';
      for (let i = 0; i < timeline.length; i++) {
        const repeatsPrevious = i > 0 && timeline[i] === timeline[i - 1];
        if (!repeatsPrevious) lastSvg = render(i);
        yield {
          index: i,
          timestampMs: (i / fps) * 1000,
          sourceIndex: timeline[i],
          repeatsPrevious,
          svg: lastSvg,
        };
      }
    },
  };
};

const probe = (file: string): Record<string, string> => {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,nb_frames,pix_fmt',
    '-of', 'default=noprint_wrappers=1',
    file,
  ]).toString();
  return Object.fromEntries(
    out.trim().split('\n').map((line) => line.split('=') as [string, string]),
  );
};

describe('formatFromPath', () => {
  it('maps video extensions', () => {
    expect(formatFromPath('a.mp4')).toBe('mp4');
    expect(formatFromPath('a.MP4')).toBe('mp4');
    expect(formatFromPath('a.webm')).toBe('webm');
    expect(formatFromPath('a.gif')).toBe('gif');
  });

  it('returns null for anything else, so .svg keeps its old path', () => {
    expect(formatFromPath('a.svg')).toBeNull();
    expect(formatFromPath('a')).toBeNull();
    expect(formatFromPath('a.png')).toBeNull();
  });
});

describe('createRasterizer', () => {
  it('returns RGBA at exactly the requested size', () => {
    const rasterize = createRasterizer({ width: WIDTH, height: HEIGHT });
    const pixels = rasterize(fakePlan([0]).render(0));
    expect(pixels.length).toBe(WIDTH * HEIGHT * 4);
  });

  it('rejects an SVG that would rasterize to the wrong size', () => {
    // Mismatched frame sizes would silently corrupt a rawvideo stream —
    // ffmpeg would happily read the bytes at the wrong offsets.
    const rasterize = createRasterizer({ width: WIDTH, height: HEIGHT });
    const wrong = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT * 2}"></svg>`;
    expect(() => rasterize(wrong)).toThrow(/expected/);
  });
});

describe('encodeVideo', () => {
  const rasterize = createRasterizer({ width: WIDTH, height: HEIGHT });

  it('writes an h264 mp4 with one frame per timeline entry', async () => {
    const plan = fakePlan([0, 1, 2, 3, 4, 5]);
    const out = join(dir, 'basic.mp4');
    await encodeVideo({ plan, output: out, format: 'mp4', rasterize });

    const info = probe(out);
    expect(info.codec_name).toBe('h264');
    expect(info.pix_fmt).toBe('yuv420p');
    expect(Number(info.width)).toBe(WIDTH);
    expect(Number(info.height)).toBe(HEIGHT);
    expect(Number(info.nb_frames)).toBe(plan.frameCount);
  }, 60_000);

  it('emits repeated frames without re-rasterizing them', async () => {
    let rasterCalls = 0;
    const counting = (svg: string) => {
      rasterCalls++;
      return rasterize(svg);
    };
    // 8 output frames, only 3 distinct source frames.
    const plan = fakePlan([0, 0, 0, 1, 1, 1, 2, 2]);
    await encodeVideo({
      plan,
      output: join(dir, 'repeats.mp4'),
      format: 'mp4',
      rasterize: counting,
    });
    expect(rasterCalls).toBe(3);
    expect(Number(probe(join(dir, 'repeats.mp4')).nb_frames)).toBe(8);
  }, 60_000);

  it('reports progress for every frame', async () => {
    const seen: number[] = [];
    const plan = fakePlan([0, 1, 2]);
    await encodeVideo({
      plan,
      output: join(dir, 'progress.mp4'),
      format: 'mp4',
      rasterize,
      onProgress: (done, total) => {
        expect(total).toBe(3);
        seen.push(done);
      },
    });
    expect(seen).toEqual([1, 2, 3]);
  }, 60_000);

  it('writes a gif', async () => {
    const out = join(dir, 'out.gif');
    await encodeVideo({ plan: fakePlan([0, 1, 2, 3]), output: out, format: 'gif', rasterize });
    expect(statSync(out).size).toBeGreaterThan(0);
    expect(probe(out).codec_name).toBe('gif');
  }, 60_000);

  it('writes a vp9 webm', async () => {
    const out = join(dir, 'out.webm');
    await encodeVideo({ plan: fakePlan([0, 1, 2, 3]), output: out, format: 'webm', rasterize });
    expect(probe(out).codec_name).toBe('vp9');
  }, 60_000);

  it('fails fast with a helpful message when ffmpeg is missing', async () => {
    // Regression guard: spawn reports ENOENT asynchronously, so the writer
    // loop used to block on a `drain` event that could never fire and the
    // CLI hung instead of printing this error.
    await expect(
      encodeVideo({
        plan: fakePlan([0, 1, 2]),
        output: join(dir, 'missing.mp4'),
        format: 'mp4',
        rasterize,
        ffmpegPath: '/nonexistent/ffmpeg',
      }),
    ).rejects.toThrow(/ffmpeg not found/);
  }, 20_000);

  it('surfaces ffmpeg stderr when encoding fails', async () => {
    await expect(
      encodeVideo({
        plan: fakePlan([0, 1]),
        // An unwritable path makes ffmpeg exit non-zero.
        output: '/nonexistent-dir/out.mp4',
        format: 'mp4',
        rasterize,
      }),
    ).rejects.toThrow(/ffmpeg exited/);
  }, 20_000);
});
