/**
 * patterns.js - Procedural Pattern Generation
 * 
 * Generates rhythm game patterns using deterministic seeds.
 * Same seed = same pattern, different seed = different pattern.
 * Supports difficulty presets (Easy/Medium/Hard).
 */

import { xorshift32 } from './utils.js';

// Difficulty presets
export const DIFFICULTY_PRESETS = {
  Easy: {
    subdiv: 2,
    skipSubProb: 0.55,
    syncop: 0.10,
    maxSameLane: 2,
    minIoiLaneMs: 150,
    jackGuard: true,
    targetNPS: 1.8,
  },
  Medium: {
    subdiv: 4,
    skipSubProb: 0.45,
    syncop: 0.20,
    maxSameLane: 2,
    minIoiLaneMs: 120,
    jackGuard: true,
    targetNPS: 2.5,
  },
  Hard: {
    subdiv: 4,
    skipSubProb: 0.25,
    syncop: 0.30,
    maxSameLane: 3,
    minIoiLaneMs: 95,
    jackGuard: true,
    targetNPS: 3.6,
  },
};

/**
 * Generate pattern from onset events using deterministic seed
 * 
 * @param {Array<{timeMs: number, strength: number, band: string}>} onsets - Musical events
 * @param {Object} opts - Generation options
 * @returns {Array<{timeMs: number, lane: number}>} Generated notes
 */
export function generatePattern(onsets, opts) {
  const {
    lanes = 4,
    seed = 12345,
    skipSubProb = 0.45,
    syncop = 0.20,
    maxSameLane = 2,
    minIoiLaneMs = 120,
    jackGuard = true,
  } = opts;

  const rnd = xorshift32(seed);
  const notes = [];
  const laneLastTime = new Array(lanes).fill(-Infinity); // Track last use per lane

  // Pattern motifs
  const motifs = [
    [0, 1, 2, 3],
    [3, 2, 1, 0],
    [0, 2, 1, 3],
    [1, 3, 0, 2],
    [0, 3, 1, 2],
    [2, 0, 3, 1],
    [1, 2, 3, 0],
    [3, 0, 2, 1],
  ];

  let currentMotif = motifs[Math.floor(rnd() * motifs.length)];
  let motifIndex = 0;
  let motifChangeCounter = 0;

  for (let i = 0; i < onsets.length; i++) {
    const onset = onsets[i];

    // Skip non-bass onsets based on probability for density control
    if (onset.band !== 'bass' && rnd() < skipSubProb) {
      continue;
    }

    // Apply syncopation (off-beat emphasis)
    if (onset.band === 'mid' && rnd() > syncop) {
      continue; // Skip some mid-range for syncopation feel
    }

    // Change motif for variety
    motifChangeCounter++;
    if (motifChangeCounter > 8 + Math.floor(rnd() * 4)) {
      currentMotif = motifs[Math.floor(rnd() * motifs.length)];
      motifIndex = 0;
      motifChangeCounter = 0;
    }

    // Get candidate lane from motif
    let lane = currentMotif[motifIndex % currentMotif.length];
    motifIndex++;

    // ROBUST JACK GUARD: Check all lanes for timing violations
    if (jackGuard) {
      const candidates = [];
      for (let l = 0; l < lanes; l++) {
        const timeSinceLastInLane = onset.timeMs - laneLastTime[l];
        
        // Check minimum interval per lane
        if (timeSinceLastInLane >= minIoiLaneMs) {
          candidates.push(l);
        }
      }

      // If no valid candidates, use least recently used lane
      if (candidates.length === 0) {
        let oldestLane = 0;
        let oldestTime = laneLastTime[0];
        for (let l = 1; l < lanes; l++) {
          if (laneLastTime[l] < oldestTime) {
            oldestTime = laneLastTime[l];
            oldestLane = l;
          }
        }
        lane = oldestLane;
      } else {
        // Prefer original lane if valid, else pick from candidates
        lane = candidates.includes(lane) ? lane : candidates[Math.floor(rnd() * candidates.length)];
      }

      // Check max consecutive (look back in notes array)
      let consecutive = 0;
      for (let j = notes.length - 1; j >= 0 && consecutive < maxSameLane; j--) {
        if (notes[j].lane === lane) {
          consecutive++;
        } else {
          break;
        }
      }

      // If over limit, force different lane
      if (consecutive >= maxSameLane) {
        const otherCandidates = candidates.filter(l => l !== lane);
        if (otherCandidates.length > 0) {
          lane = otherCandidates[Math.floor(rnd() * otherCandidates.length)];
        }
      }
    }

    const note = {
      timeMs: onset.timeMs,
      lane: lane,
      judged: false,
    };

    notes.push(note);
    laneLastTime[lane] = onset.timeMs;
  }

  return notes;
}

/**
 * Adjust pattern density to match target NPS
 * Removes or duplicates notes to hit the target
 * 
 * @param {Array} notes - Generated notes
 * @param {number} lengthMs - Song length in milliseconds
 * @param {number} targetNPS - Target notes per second
 * @param {number} seed - Random seed for consistent adjustments
 * @param {number} tolerance - Acceptable variance (default 0.3)
 * @returns {Array} Adjusted notes array
 */
export function adjustDensity(notes, lengthMs, targetNPS, seed, tolerance = 0.3) {
  const lengthSec = lengthMs / 1000;
  const targetCount = Math.round(targetNPS * lengthSec);
  const currentCount = notes.length;
  
  // Already within tolerance
  if (Math.abs(currentCount - targetCount) / targetCount < tolerance) {
    return notes;
  }
  
  const rnd = xorshift32(seed + 999); // Different seed for density adjustments
  
  // Need to remove notes
  if (currentCount > targetCount) {
    const toRemove = currentCount - targetCount;
    const adjusted = [...notes];
    
    // Remove notes randomly but prefer weaker onsets
    for (let i = 0; i < toRemove; i++) {
      if (adjusted.length === 0) break;
      const idx = Math.floor(rnd() * adjusted.length);
      adjusted.splice(idx, 1);
    }
    
    return adjusted.sort((a, b) => a.timeMs - b.timeMs);
  }
  
  // Need to add notes
  const toAdd = targetCount - currentCount;
  const adjusted = [...notes];
  
  // Find gaps and add notes between existing ones
  for (let i = 0; i < toAdd && adjusted.length > 1; i++) {
    // Find largest gap
    let maxGapIdx = 0;
    let maxGap = 0;
    
    for (let j = 0; j < adjusted.length - 1; j++) {
      const gap = adjusted[j + 1].timeMs - adjusted[j].timeMs;
      if (gap > maxGap) {
        maxGap = gap;
        maxGapIdx = j;
      }
    }
    
    // Add note in middle of gap
    if (maxGap > 100) { // Only add if gap is significant
      const newTime = (adjusted[maxGapIdx].timeMs + adjusted[maxGapIdx + 1].timeMs) / 2;
      const newLane = (adjusted[maxGapIdx].lane + 1) % 4; // Avoid same lane
      
      adjusted.push({
        timeMs: newTime,
        lane: newLane,
        judged: false,
      });
    }
  }
  
  return adjusted.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Check if pattern density is within target NPS tolerance
 * 
 * @param {Array} notes - Generated notes
 * @param {number} lengthMs - Song length in milliseconds
 * @param {number} targetNPS - Target notes per second
 * @param {number} tolerance - Acceptable variance (default 0.4)
 * @returns {boolean} True if within tolerance
 */
export function checkNPS(notes, lengthMs, targetNPS, tolerance = 0.4) {
  const actualNPS = notes.length / (lengthMs / 1000);
  return Math.abs(actualNPS - targetNPS) < tolerance;
}
