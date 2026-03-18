import type { Recording, CastEvent, FrameGenerationOptions, CursorState } from './types';
import type { GridState, Theme, SpanRow } from '../types';
import type { FrameData } from '../pipeline/svg-emitter';
import { createGridState, processInput } from '../pipeline/vterminal';
import { coalesce } from '../pipeline/coalescer';

//#region Frame Generation

/**
 * Replays a recording through vterminal and generates frames for animation.
 * This is the core component that bridges the recording system with the existing
 * SVG rendering pipeline.
 */
export class RecordingPlayer {
  private recording: Recording;
  private theme: Theme;
  private grid: GridState;
  private currentEventIndex: number = 0;
  private currentTime: number = 0;

  constructor(recording: Recording, theme: Theme) {
    this.recording = recording;
    this.theme = theme;
    this.grid = createGridState(recording.header.width, recording.header.height);
  }

  /**
   * Generate all frames from the recording for SVG animation.
   * This replays events through vterminal and captures state at each output event.
   */
  generateFrames(options: FrameGenerationOptions = {}): FrameData[] {
    const {
      minFrameInterval = 16, // ~60fps max
      maxFrameInterval = 2000, // Cap long pauses at 2s
      captureEveryOutput = true,
    } = options;

    // Reset state for fresh replay
    this.reset();

    const frames: FrameData[] = [];
    const events = this.recording.events;
    let lastFrameTime = -minFrameInterval;

    // Capture initial empty frame
    frames.push(this.captureFrame(0));
    lastFrameTime = 0;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const [timestamp, eventType, data] = event;

      // Apply the event to the terminal
      if (eventType === 'o') {
        this.grid = processInput(this.grid, data);
      }
      // 'i' (input) events don't affect grid state in replay

      // Determine if we should capture a frame
      const timeSinceLastFrame = timestamp - lastFrameTime;
      const shouldCapture =
        captureEveryOutput && eventType === 'o' && timeSinceLastFrame >= minFrameInterval / 1000;

      if (shouldCapture) {
        // Cap the timestamp delta to maxFrameInterval
        const cappedTimestamp =
          timeSinceLastFrame > maxFrameInterval / 1000
            ? lastFrameTime + maxFrameInterval / 1000
            : timestamp;

        frames.push(this.captureFrame(cappedTimestamp));
        lastFrameTime = cappedTimestamp;
      }

      this.currentTime = timestamp;
      this.currentEventIndex = i + 1;
    }

    // Ensure we capture the final state
    if (events.length > 0) {
      const finalTimestamp = events[events.length - 1][0];
      if (finalTimestamp > lastFrameTime) {
        frames.push(this.captureFrame(finalTimestamp));
      }
    }

    return frames;
  }

  /**
   * Capture current terminal state as a FrameData object
   */
  private captureFrame(timestamp: number): FrameData {
    const rows = coalesce(this.grid, this.theme);
    const cursor = this.grid.cursor;

    return {
      rows,
      cursor: { row: cursor.row, col: cursor.col },
      cursorVisible: true,
      timestamp: timestamp * 1000, // Convert to milliseconds for animation
      activeCursor: false,
    };
  }

  /**
   * Reset the player to initial state for re-replay
   */
  reset(): void {
    this.grid = createGridState(this.recording.header.width, this.recording.header.height);
    this.currentEventIndex = 0;
    this.currentTime = 0;
  }

  /**
   * Get the recording duration in seconds
   */
  getDuration(): number {
    const events = this.recording.events;
    if (events.length === 0) return 0;
    return events[events.length - 1][0];
  }

  /**
   * Get the total number of events
   */
  getEventCount(): number {
    return this.recording.events.length;
  }

  /**
   * Get recording header info
   */
  getHeader(): Recording['header'] {
    return this.recording.header;
  }
}


//#region Frame Optimization

/**
 * Optimize frames by removing duplicates and merging similar frames.
 * This reduces the total number of frames in the animation.
 */
export const optimizeFrames = (frames: FrameData[]): FrameData[] => {
  if (frames.length <= 1) return frames;

  const optimized: FrameData[] = [frames[0]];

  for (let i = 1; i < frames.length; i++) {
    const current = frames[i];
    const previous = optimized[optimized.length - 1];

    // Check if content changed
    if (!framesEqual(current, previous)) {
      optimized.push(current);
    } else {
      // Content identical - just update timestamp of previous frame
      // This effectively extends the duration of the previous frame
    }
  }

  return optimized;
};

/**
 * Compare two frames for content equality (ignoring timestamp)
 */
const framesEqual = (a: FrameData, b: FrameData): boolean => {
  // Quick checks first
  if (a.cursorVisible !== b.cursorVisible) return false;
  if (a.cursor?.row !== b.cursor?.row || a.cursor?.col !== b.cursor?.col) return false;
  if (a.rows.length !== b.rows.length) return false;

  // Deep comparison of rows
  for (let i = 0; i < a.rows.length; i++) {
    const rowA = a.rows[i];
    const rowB = b.rows[i];
    if (rowA.length !== rowB.length) return false;

    for (let j = 0; j < rowA.length; j++) {
      const spanA = rowA[j];
      const spanB = rowB[j];
      if (
        spanA.text !== spanB.text ||
        spanA.col !== spanB.col ||
        spanA.row !== spanB.row ||
        spanA.style.fg !== spanB.style.fg ||
        spanA.style.bg !== spanB.style.bg ||
        spanA.style.bold !== spanB.style.bold ||
        spanA.style.italic !== spanB.style.italic ||
        spanA.style.underline !== spanB.style.underline ||
        spanA.style.dim !== spanB.style.dim ||
        spanA.style.strikethrough !== spanB.style.strikethrough
      ) {
        return false;
      }
    }
  }

  return true;
};


//#region Factory Functions

/**
 * Create a RecordingPlayer from a Recording object
 */
export const createPlayer = (recording: Recording, theme: Theme): RecordingPlayer => {
  return new RecordingPlayer(recording, theme);
};

/**
 * Generate frames directly from a recording (convenience function)
 */
export const generateFramesFromRecording = (
  recording: Recording,
  theme: Theme,
  options?: FrameGenerationOptions
): FrameData[] => {
  const player = createPlayer(recording, theme);
  const frames = player.generateFrames(options);
  return optimizeFrames(frames);
};
