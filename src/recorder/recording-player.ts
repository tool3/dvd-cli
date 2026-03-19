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

    // Pre-analyze events to detect typing vs command output
    const eventStates = this.analyzeEventStates(events);

    // Capture initial empty frame (at prompt, cursor visible and blinking)
    frames.push(this.captureFrame(0, false, true));
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
      const state = eventStates[i];

      // Skip capturing during bursts UNLESS this is the end of a burst
      // This ensures we capture the final state of burst sequences (like prompt redraws)
      const isEndOfBurst = i >= events.length - 1 ||
        (events[i + 1][0] - timestamp) >= 0.1; // 100ms gap = end of burst

      const shouldCapture =
        captureEveryOutput &&
        eventType === 'o' &&
        timeSinceLastFrame >= minFrameInterval / 1000 &&
        (state.showCursor || isEndOfBurst); // Capture at end of bursts too

      if (shouldCapture) {
        // Cap the timestamp delta to maxFrameInterval
        const cappedTimestamp =
          timeSinceLastFrame > maxFrameInterval / 1000
            ? lastFrameTime + maxFrameInterval / 1000
            : timestamp;

        // Use pre-analyzed event states for cursor behavior
        // At end of burst, show cursor (we're back at prompt)
        const showCursor = state.showCursor || isEndOfBurst;
        const activeCursor = state.isTyping;

        frames.push(this.captureFrame(cappedTimestamp, activeCursor, showCursor));
        lastFrameTime = cappedTimestamp;
      }

      this.currentTime = timestamp;
      this.currentEventIndex = i + 1;
    }

    // Ensure we capture the final state (at prompt, cursor visible and blinking)
    if (events.length > 0) {
      const finalTimestamp = events[events.length - 1][0];
      if (finalTimestamp > lastFrameTime) {
        frames.push(this.captureFrame(finalTimestamp, false, true));
      }
    }

    return frames;
  }

  /**
   * Analyze events to determine cursor state for each event.
   * Detects typing vs command output patterns.
   */
  private analyzeEventStates(events: CastEvent[]): Array<{ showCursor: boolean; isTyping: boolean }> {
    const result: Array<{ showCursor: boolean; isTyping: boolean }> = [];

    for (let i = 0; i < events.length; i++) {
      const [timestamp, eventType, data] = events[i];

      if (eventType !== 'o') {
        result.push({ showCursor: true, isTyping: false });
        continue;
      }

      // Check if this looks like typing output (single char or short backspace sequences)
      const isTypingOutput = this.isTypingOutput(data);

      // Check if we're in a rapid burst of output (command output)
      const inBurst = this.isInRapidBurst(events, i, 0.02); // 20ms threshold for bursts

      // Check time gap from previous event - typing has gaps of 50-500ms typically
      const prevTimestamp = i > 0 ? events[i - 1][0] : 0;
      const timeSincePrev = timestamp - prevTimestamp;
      const hasTypingGap = timeSincePrev >= 0.05 && timeSincePrev <= 1.0;

      // Check if this is at the END of a burst (significant gap after this event)
      const isEndOfBurst = this.isEndOfBurst(events, i, 0.1); // 100ms gap after this event

      // Check if this looks like a prompt event (shell prompt being drawn)
      const isPromptEvent = this.isPromptEvent(data);

      // Determine if this is typing
      const isTyping = isTypingOutput && hasTypingGap && !inBurst;

      // Show cursor if:
      // 1. We're typing (show active/non-blinking cursor)
      // 2. We're at the end of a burst (back at prompt)
      // 3. This is a prompt event
      // 4. Not in a burst at all
      // Hide cursor only during rapid command output bursts
      const showCursor = isTyping || isEndOfBurst || isPromptEvent || !inBurst;

      result.push({ showCursor, isTyping });
    }

    return result;
  }

  /**
   * Check if output data looks like typing (single chars, backspace, etc.)
   */
  private isTypingOutput(data: string): boolean {
    // Remove ANSI escape sequences for analysis
    const stripped = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b[^[]/g, '');

    // Typing outputs are typically:
    // - Single visible characters
    // - Backspace sequences (\b \b)
    // - Short strings (echo of typed text)
    if (stripped.length === 0) return false;
    if (stripped.length <= 3) return true;

    // Check for backspace pattern
    if (data.includes('\b')) return true;

    return false;
  }

  /**
   * Check if event is part of a rapid output burst (command output).
   */
  private isInRapidBurst(events: CastEvent[], index: number, threshold: number): boolean {
    const [timestamp, eventType] = events[index];
    if (eventType !== 'o') return false;

    // Count nearby output events within threshold (very rapid output)
    let nearbyCount = 0;
    for (let j = Math.max(0, index - 15); j < Math.min(events.length, index + 15); j++) {
      if (j === index) continue;
      const [otherTimestamp, otherType] = events[j];
      if (otherType === 'o' && Math.abs(otherTimestamp - timestamp) < threshold) {
        nearbyCount++;
      }
    }

    // If 5+ events within 20ms window, this is definitely command output
    return nearbyCount >= 5;
  }

  /**
   * Check if this event is at the end of a burst (significant gap after it).
   */
  private isEndOfBurst(events: CastEvent[], index: number, gapThreshold: number): boolean {
    if (index >= events.length - 1) return true; // Last event is end of burst

    const [timestamp] = events[index];
    const [nextTimestamp] = events[index + 1];

    // If there's a significant gap after this event, we're at the end of a burst
    return (nextTimestamp - timestamp) >= gapThreshold;
  }

  /**
   * Check if this looks like a prompt event (shell prompt being drawn).
   */
  private isPromptEvent(data: string): boolean {
    // Prompts often contain these patterns:
    // - Ends with escape sequence for bracket paste mode (\x1b[?2004h)
    // - Contains prompt symbols (➜, →, >, etc.)
    // - Carriage return + clear + content (typical prompt redraw)

    // Check for bracket paste mode enable (common at end of prompt)
    if (data.includes('\x1b[?2004h')) return true;

    // Check for prompt-like patterns
    if (data.includes('➜') || data.includes('→') || data.includes('❯')) return true;

    // Check for carriage return + clear + content (typical prompt redraw)
    if (data.startsWith('\r') && data.includes('\x1b[J')) return true;

    return false;
  }

  /**
   * Capture current terminal state as a FrameData object
   * @param timestamp - Frame timestamp in seconds
   * @param activeCursor - Whether cursor should be solid (typing) vs blinking (idle)
   * @param cursorVisible - Whether cursor should be shown at all
   */
  private captureFrame(timestamp: number, activeCursor: boolean = false, cursorVisible?: boolean): FrameData {
    const rows = coalesce(this.grid, this.theme);
    const cursor = this.grid.cursor;

    return {
      rows,
      cursor: { row: cursor.row, col: cursor.col },
      // Use provided visibility, or fall back to grid state
      cursorVisible: cursorVisible ?? this.grid.cursorVisible,
      timestamp: timestamp * 1000, // Convert to milliseconds for animation
      activeCursor,
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
