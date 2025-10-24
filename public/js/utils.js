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
 * 1200ms = 1.2 seconds from top of screen to hit line
 */
export const APPROACH_TIME_MS = 1200;

/**
 * Default canvas dimensions
 * The game renders at 800x600 and scales to fit the screen
 */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

/**
 * Hit line position (as percentage from top)
 * 0.8 = 80% down the screen (480px in a 600px canvas)
 */
export const HIT_LINE_POSITION = 0.8;

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
