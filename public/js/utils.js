/**
 * utils.js
 * 
 * Core utilities, constants, and helper functions for the rhythm game.
 * This module contains:
 * - Judgment timing windows (how precise you need to be)
 * - Score values for each judgment
 * - Math helper functions (clamp, lerp)
 * - Judgment calculation logic
 */

// ============================================================
// GAME CONSTANTS
// ============================================================

/**
 * Judgment timing windows in milliseconds
 * These define how close to the target time you need to hit a note
 * 
 * Perfect: Within 35ms (very precise!)
 * Great: Within 70ms (pretty good)
 * Good: Within 110ms (acceptable)
 * Miss: Outside 110ms or no input
 */
export const JUDGE_WINDOWS = {
  perfect: 35,  // ±35ms from perfect timing
  great: 70,    // ±70ms from perfect timing
  good: 110,    // ±110ms from perfect timing
};

/**
 * Score values for each judgment type
 * Perfect hits give maximum points, misses give nothing
 */
export const SCORE_VALUES = {
  perfect: 1000,
  great: 700,
  good: 300,
  miss: 0,
};

/**
 * Grade thresholds based on accuracy percentage
 * S: 95% or higher
 * A: 90% or higher
 * B: 80% or higher
 * C: Below 80%
 */
export const GRADE_THRESHOLDS = {
  S: 95,
  A: 90,
  B: 80,
  C: 0,
};

/**
 * Default approach time - how long notes take to reach the hit line
 * 1200ms = 1.2 seconds from spawn to hit line (PRECISE TIMING)
 */
export const APPROACH_TIME_MS = 1200;

/**
 * Prewarm time for note spawning (render queue buffer)
 * Notes spawn slightly early to ensure smooth rendering
 */
export const PREWARM_MS = 0;

/**
 * Default canvas dimensions
 * The game renders at 800x600 and scales to fit the screen
 */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

/**
 * Hit line position (as percentage from top)
 * 0.85 = 85% down the screen (510px in a 600px canvas)
 * Notes must arrive EXACTLY at this line at their targetMs timestamp
 */
export const HIT_LINE_POSITION = 0.85;

/**
 * Spawn position (as percentage from top)
 * 0.15 = 15% down the screen (90px in a 600px canvas)
 * Notes spawn at this position APPROACH_TIME_MS before their targetMs
 */
export const SPAWN_POSITION = 0.15;

/**
 * Perceptual Center Correction (LYRIC SYNC ENHANCEMENT)
 * Advances lyric timestamps by default 35ms to align with vocal attack perception
 * 
 * Why needed:
 * - LRC timestamps are often subtitle-aligned (late for rhythm games)
 * - Human perception of vocal "start" is ~20-50ms before actual phonation
 * - This correction makes notes feel "locked" to the vocal syllable
 * 
 * Configurable in settings from -80ms to +40ms
 */
export const PERCEPTUAL_CENTER_MS = -35;

/**
 * Adaptive bias configuration
 * Tracks player's early/late tendency and auto-adjusts judgment
 */
export const ADAPTIVE_BIAS_CONFIG = {
  enabled: true,              // Can be toggled in settings
  learningRate: 0.08,         // How quickly to adapt (0-1, higher = faster)
  calibrationHits: 24,        // Number of initial hits to calibrate on
  maxBiasMs: 50,             // Maximum bias correction allowed (±50ms)
};

/**
 * Vocal onset detection window
 * Search range around lyric timestamp for actual vocal attack
 */
export const VOCAL_ONSET_WINDOW_MS = 100;  // ±100ms search window
export const VOCAL_FREQ_BAND = [300, 3400]; // Hz range for vocal detection (excludes kick/bass)

// ============================================================
// MATH HELPERS
// ============================================================

/**
 * Clamp a value between min and max
 * Ensures a number doesn't go outside a specific range
 * 
 * @param {number} value - The value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} The clamped value
 * 
 * Example: clamp(150, 0, 100) returns 100
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Clamp a value between 0 and 1
 * Optimized version of clamp(value, 0, 1) for common use case
 * 
 * @param {number} value - The value to clamp
 * @returns {number} The clamped value between 0 and 1
 * 
 * Example: clamp01(1.5) returns 1.0
 */
export function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Linear interpolation between two values
 * Useful for smooth animations and transitions
 * 
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0 to 1)
 * @returns {number} Interpolated value
 * 
 * Example: lerp(0, 100, 0.5) returns 50 (halfway between)
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ============================================================
// JUDGMENT LOGIC
// ============================================================

/**
 * Calculate judgment based on timing difference
 * Compares how far off the player's timing was from perfect
 * 
 * @param {number} timeDiff - Absolute time difference in milliseconds
 * @returns {string} Judgment type: 'perfect', 'great', 'good', or 'miss'
 * 
 * How it works:
 * - If within 35ms: Perfect!
 * - If within 70ms: Great
 * - If within 110ms: Good
 * - Otherwise: Miss
 */
export function calculateJudgment(timeDiff) {
  const absTimeDiff = Math.abs(timeDiff);
  
  if (absTimeDiff <= JUDGE_WINDOWS.perfect) {
    return 'perfect';
  } else if (absTimeDiff <= JUDGE_WINDOWS.great) {
    return 'great';
  } else if (absTimeDiff <= JUDGE_WINDOWS.good) {
    return 'good';
  } else {
    return 'miss';
  }
}

/**
 * Get score for a judgment type
 * 
 * @param {string} judgment - Judgment type ('perfect', 'great', 'good', 'miss')
 * @returns {number} Score value for that judgment
 */
export function getScoreForJudgment(judgment) {
  return SCORE_VALUES[judgment] || 0;
}

/**
 * Calculate grade based on accuracy percentage
 * 
 * @param {number} accuracy - Accuracy as a percentage (0-100)
 * @returns {string} Grade letter: 'S', 'A', 'B', or 'C'
 */
export function calculateGrade(accuracy) {
  if (accuracy >= GRADE_THRESHOLDS.S) return 'S';
  if (accuracy >= GRADE_THRESHOLDS.A) return 'A';
  if (accuracy >= GRADE_THRESHOLDS.B) return 'B';
  return 'C';
}

/**
 * Format a number with commas for better readability
 * 
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 * 
 * Example: formatNumber(1234567) returns "1,234,567"
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ============================================================
// SEED & HASH UTILITIES (Pattern Generation)
// ============================================================

/**
 * Xorshift32 pseudo-random number generator
 * Fast, deterministic RNG for procedural pattern generation
 * 
 * @param {number} seed - Initial seed value (32-bit integer)
 * @returns {Function} RNG function that returns values in [0, 1)
 */
export function xorshift32(seed) {
  let x = (seed | 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a 32-bit integer using SHA-256
 * Used for creating unique song seeds
 * 
 * @param {string} str - String to hash
 * @returns {Promise<number>} 32-bit hash value
 */
export async function hash32(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new DataView(digest);
  
  // Fold 256 bits down to 32 bits via XOR
  let h = 0;
  for (let i = 0; i < view.byteLength; i += 4) {
    h ^= view.getUint32(i);
  }
  return h >>> 0;
}

/**
 * Create a unique hash from audio buffer samples
 * Ensures different songs get different pattern seeds
 * 
 * @param {AudioBuffer} audioBuffer - Audio buffer to hash
 * @param {number} seconds - How many seconds to analyze (default 90)
 * @returns {Promise<number>} 32-bit audio hash
 */
export async function audioHash32(audioBuffer, seconds = 90) {
  const sr = audioBuffer.sampleRate;
  const frames = Math.min(audioBuffer.length, Math.floor(seconds * sr));
  
  // Downmix to mono
  const chs = audioBuffer.numberOfChannels;
  const tmp = new Float32Array(frames);
  for (let c = 0; c < chs; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      tmp[i] += ch[i] / chs;
    }
  }
  
  // Downsample to ~11kHz for stability
  const factor = Math.max(1, Math.floor(sr / 11025));
  const ds = new Float32Array(Math.ceil(frames / factor));
  for (let i = 0, j = 0; i < frames; i += factor, j++) {
    ds[j] = tmp[i];
  }
  
  // Quantize to int16 and hash
  const raw = new Uint8Array(ds.length * 2);
  for (let i = 0; i < ds.length; i++) {
    const s = Math.max(-1, Math.min(1, ds[i]));
    const q = (s * 32767) | 0;
    raw[i * 2] = q & 0xff;
    raw[i * 2 + 1] = (q >> 8) & 0xff;
  }
  
  const digest = await crypto.subtle.digest('SHA-256', raw);
  const view = new DataView(digest);
  
  // Fold to 32-bit
  let h = 0;
  for (let i = 0; i < view.byteLength; i += 4) {
    h ^= view.getUint32(i);
  }
  return h >>> 0;
}

/**
 * Generate unique song key from metadata + audio hash
 * Used for per-song calibration storage
 * 
 * @param {Object} meta - Song metadata {title, path}
 * @param {number} aHash - Audio hash value
 * @returns {string} Unique song key
 */
export function songKey(meta, aHash) {
  return `${meta.path || meta.title || 'untitled'}@${aHash}`;
}
