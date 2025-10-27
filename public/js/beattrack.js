/**
 * beattrack.js - Musical Onset Detection
 * 
 * Analyzes audio to detect actual musical events (drum hits, bass notes, etc.)
 * Uses multi-band onset detection to create rhythm patterns that follow the music.
 */

// ============================================================
// BLACKPINK REFERENCE PROFILE
// ============================================================

/**
 * LocalStorage key for BLACKPINK reference profile
 * Stores the "perfect" beat analysis from BLACKPINK-JUMP to apply to other songs
 * 
 * Profile shape:
 * {
 *   bpm: number,
 *   subdiv: 4,
 *   quantize: 'hard',
 *   preFilters: {hp: 30, lp: 2600},
 *   fluxHopMs: 10,
 *   phaseKernelMs: 1400,
 *   phaseSnapMs: 18,
 *   onsetMinGapMs: 95,
 *   audioOffsetLearnedMs: number
 * }
 */
export const REF_PROFILE_KEY = 'REF_BEAT_PROFILE_BLACKPINK';

/**
 * Analyze audio buffer to detect musical onsets and rhythm
 * NEW: Adopts BLACKPINK reference profile when available
 * 
 * @param {AudioBuffer} audioBuffer - Audio to analyze
 * @param {Object} options - Analysis options {ref: profile|null}
 * @returns {Promise<{bpm: number, phaseMs: number, confidence: number, onsets: Array, adoptedFromRef: boolean}>}
 */
export async function analyzeBeatGrid(audioBuffer, options = {}) {
  // Load reference profile from localStorage
  const ref = options.ref !== undefined ? options.ref : 
    JSON.parse(localStorage.getItem(REF_PROFILE_KEY) || 'null');
  
  if (ref) {
    console.log('[BeatProfile] REF loaded ✅ subdiv=4, quantize=hard');
    return await analyzeBeatGridWithRef(audioBuffer, ref);
  } else {
    console.log('🎵 Analyzing musical events (no ref profile)...');
    return await analyzeBeatGridStandard(audioBuffer);
  }
}

/**
 * Standard beat analysis (when no reference profile exists)
 */
async function analyzeBeatGridStandard(audioBuffer) {
  const duration = audioBuffer.duration;
  
  // Detect onsets in different frequency bands
  const bassOnsets = await detectOnsetsInBand(audioBuffer, 30, 250, 'bass');
  const midOnsets = await detectOnsetsInBand(audioBuffer, 250, 2000, 'mid');
  const highOnsets = await detectOnsetsInBand(audioBuffer, 2000, 8000, 'high');
  
  console.log(`Raw detections: bass:${bassOnsets.length} mid:${midOnsets.length} high:${highOnsets.length}`);
  
  // Combine bass and mid for moderate difficulty
  const allOnsets = [...bassOnsets, ...midOnsets]
    .sort((a, b) => a.timeMs - b.timeMs);
  
  console.log(`✓ Detected ${allOnsets.length} musical events`);
  
  // Estimate tempo from onset intervals
  const bpm = estimateBPMFromOnsets(allOnsets);
  
  // Find first strong onset as phase
  const phaseMs = allOnsets.length > 0 ? allOnsets[0].timeMs : 0;
  
  const result = {
    bpm: bpm,
    phaseMs: phaseMs,
    confidence: 0.8,
    onsets: allOnsets,
    adoptedFromRef: false,
    drift: { ppm: 0 }
  };
  
  console.log(`[BeatTrack] bpm=${bpm.toFixed(1)}, phase=${phaseMs.toFixed(0)}ms (conf=${result.confidence.toFixed(2)}, adoptedFromRef=false)`);
  
  return result;
}

/**
 * Reference profile-based analysis (BLACKPINK method)
 * Uses ref's filter params and searches for BPM/phase that matches ref's subdiv=4 grid
 */
async function analyzeBeatGridWithRef(audioBuffer, ref) {
  const hp = ref.preFilters?.hp || 30;
  const lp = ref.preFilters?.lp || 2600;
  const fluxHopMs = ref.fluxHopMs || 10;
  const phaseKernelMs = ref.phaseKernelMs || 1400;
  
  // Detect onsets using ref's filters
  const bassOnsets = await detectOnsetsInBand(audioBuffer, hp, 250, 'bass');
  const midOnsets = await detectOnsetsInBand(audioBuffer, 250, lp, 'mid');
  
  const allOnsets = [...bassOnsets, ...midOnsets]
    .sort((a, b) => a.timeMs - b.timeMs);
  
  console.log(`✓ Detected ${allOnsets.length} onsets (ref filters)`);
  
  // Estimate base BPM
  let baseBPM = estimateBPMFromOnsets(allOnsets);
  
  // Test octave variations (×0.5, ×1, ×2) for subdiv=4 grid fit
  const candidates = [
    { bpm: baseBPM * 0.5, octave: 0.5 },
    { bpm: baseBPM, octave: 1.0 },
    { bpm: baseBPM * 2.0, octave: 2.0 }
  ].filter(c => c.bpm >= 70 && c.bpm <= 180);
  
  let bestBPM = baseBPM;
  let bestScore = 0;
  
  // Evaluate each BPM candidate for subdiv=4 grid alignment
  for (const cand of candidates) {
    const beatMs = 60000 / cand.bpm;
    const gridStep = beatMs / 4; // subdiv=4
    
    // Score = how many onsets land on grid points
    let score = 0;
    for (const onset of allOnsets.slice(0, 200)) {
      const nearestGridTime = Math.round(onset.timeMs / gridStep) * gridStep;
      const dist = Math.abs(onset.timeMs - nearestGridTime);
      if (dist < gridStep * 0.3) score += onset.strength || 1;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestBPM = cand.bpm;
    }
  }
  
  const beatMs = 60000 / bestBPM;
  
  // Phase search within ±phaseKernelMs
  const searchMax = Math.min(phaseKernelMs, beatMs * 2);
  let bestPhaseMs = 0;
  let bestPhaseScore = 0;
  
  const phaseStep = 10; // 10ms resolution
  for (let testPhase = 0; testPhase < searchMax; testPhase += phaseStep) {
    let score = 0;
    const gridStep = beatMs / 4;
    
    for (const onset of allOnsets.slice(0, 200)) {
      const gridPos = (onset.timeMs - testPhase + gridStep) % gridStep;
      const dist = Math.min(gridPos, gridStep - gridPos);
      if (dist < gridStep * 0.25) score += onset.strength || 1;
    }
    
    if (score > bestPhaseScore) {
      bestPhaseScore = score;
      bestPhaseMs = testPhase;
    }
  }
  
  const confidence = Math.min(0.95, bestPhaseScore / (allOnsets.length * 0.5));
  
  const result = {
    bpm: bestBPM,
    phaseMs: bestPhaseMs,
    confidence: confidence,
    onsets: allOnsets,
    adoptedFromRef: true,
    drift: { ppm: 0 }
  };
  
  console.log(`[BeatTrack] bpm=${bestBPM.toFixed(1)}, phase=${bestPhaseMs.toFixed(0)}ms (conf=${confidence.toFixed(2)}, adoptedFromRef=true)`);
  
  return result;
}

/**
 * Detect onsets in a specific frequency band
 */
async function detectOnsetsInBand(audioBuffer, lowFreq, highFreq, bandName) {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  
  // Create offline context for filtering
  const ctx = new OfflineAudioContext(1, audioBuffer.length, sampleRate);
  
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  
  // Band-pass filter
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = highFreq;
  lowpass.Q.value = 1.0;
  
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = lowFreq;
  highpass.Q.value = 1.0;
  
  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(ctx.destination);
  
  source.start(0);
  
  const filtered = await ctx.startRendering();
  
  // Compute energy flux
  const flux = computeSpectralFlux(filtered);
  
  // Find peaks in flux (onsets)
  const onsets = findOnsetPeaks(flux, bandName);
  
  return onsets;
}

/**
 * Estimate BPM from onset intervals
 */
function estimateBPMFromOnsets(onsets) {
  if (onsets.length < 4) return 120; // Default
  
  // Calculate intervals between consecutive onsets
  const intervals = [];
  for (let i = 1; i < Math.min(onsets.length, 100); i++) {
    intervals.push(onsets[i].timeMs - onsets[i-1].timeMs);
  }
  
  // Find median interval
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  
  // Convert to BPM (assuming median interval is 1 beat or subdivision)
  let bpm = 60000 / medianInterval;
  
  // Adjust for common subdivision patterns
  if (bpm > 180) bpm = bpm / 2;
  if (bpm < 70) bpm = bpm * 2;
  
  // Clamp to reasonable range
  return Math.max(70, Math.min(180, bpm));
}

/**
 * Find onset peaks in flux signal
 */
function findOnsetPeaks(flux, bandName) {
  const hopMs = 10;
  const onsets = [];
  
  // Balanced threshold - match APT difficulty (~700 notes)
  const windowSize = 20; // 200ms window
  const minTimeBetweenMs = 80; // Minimum 80ms between notes (max ~12 notes/sec)
  
  // Threshold multipliers per band (lower = more notes to match APT)
  const thresholdMultiplier = {
    'bass': 2.0,  // More inclusive
    'mid': 2.2,   // Slightly more selective on mid
    'high': 4.0   // More selective on high
  };
  
  const multiplier = thresholdMultiplier[bandName] || 4.0;
  let lastOnsetTime = -1000;
  
  for (let i = windowSize; i < flux.length - windowSize; i++) {
    const current = flux[i];
    const currentTimeMs = i * hopMs;
    
    // Skip if too close to last onset
    if (currentTimeMs - lastOnsetTime < minTimeBetweenMs) {
      continue;
    }
    
    // Calculate local average
    let localSum = 0;
    for (let j = i - windowSize; j < i; j++) {
      localSum += flux[j];
    }
    const localAvg = localSum / windowSize;
    
    // Much higher threshold - only strong peaks
    const threshold = localAvg * multiplier;
    
    // Check if this is a peak (relaxed criteria for more notes)
    const isPeak = current > threshold && 
                   current > flux[i-1] && 
                   current > flux[i+1];
    
    if (isPeak) {
      onsets.push({
        timeMs: currentTimeMs,
        strength: current,
        band: bandName
      });
      
      lastOnsetTime = currentTimeMs;
      
      // Skip ahead to avoid duplicate peaks
      i += Math.floor(minTimeBetweenMs / hopMs);
    }
  }
  
  return onsets;
}

/**
 * Compute spectral flux from audio buffer
 * Uses frame-based analysis with 10ms hop
 */
function computeSpectralFlux(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const audioData = audioBuffer.getChannelData(0);
  
  const hopMs = 10; // 10ms hop
  const hopSamples = Math.floor((hopMs / 1000) * sampleRate);
  const frameSize = hopSamples * 2; // Window size
  
  const numFrames = Math.floor(audioData.length / hopSamples);
  const flux = new Float32Array(numFrames);
  
  let prevMagnitudes = new Float32Array(frameSize / 2);
  
  for (let frame = 0; frame < numFrames; frame++) {
    const startSample = frame * hopSamples;
    const endSample = Math.min(startSample + frameSize, audioData.length);
    
    // Simple energy-based flux (approximation)
    let energy = 0;
    for (let i = startSample; i < endSample; i++) {
      energy += audioData[i] * audioData[i];
    }
    
    // Differentiate to get flux
    const magnitude = Math.sqrt(energy / (endSample - startSample));
    const fluxValue = Math.max(0, magnitude - prevMagnitudes[frame % prevMagnitudes.length]);
    flux[frame] = fluxValue;
    
    prevMagnitudes[frame % prevMagnitudes.length] = magnitude;
  }
  
  return flux;
}

/**
 * Estimate tempo (BPM) using autocorrelation of spectral flux
 */
function estimateTempo(flux, sampleRate) {
  const hopMs = 10;
  const minBPM = 70;
  const maxBPM = 180;
  
  // Convert BPM range to lag range (in frames)
  const minLag = Math.floor((60000 / maxBPM) / hopMs);
  const maxLag = Math.floor((60000 / minBPM) / hopMs);
  
  // Compute autocorrelation
  const autocorr = new Float32Array(maxLag - minLag + 1);
  
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let count = 0;
    
    for (let i = 0; i < flux.length - lag; i++) {
      sum += flux[i] * flux[i + lag];
      count++;
    }
    
    autocorr[lag - minLag] = count > 0 ? sum / count : 0;
  }
  
  // Find peak in autocorrelation
  let maxCorr = 0;
  let peakLag = minLag;
  
  for (let lag = minLag; lag <= maxLag; lag++) {
    const corr = autocorr[lag - minLag];
    if (corr > maxCorr) {
      maxCorr = corr;
      peakLag = lag;
    }
  }
  
  // Convert lag to BPM
  const bpm = 60000 / (peakLag * hopMs);
  
  // Check octave errors (half/double tempo)
  const candidates = [
    { bpm: bpm, score: maxCorr },
    { bpm: bpm * 2, score: autocorr[Math.floor(peakLag / 2) - minLag] || 0 },
    { bpm: bpm / 2, score: autocorr[Math.min(peakLag * 2 - minLag, autocorr.length - 1)] || 0 }
  ].filter(c => c.bpm >= minBPM && c.bpm <= maxBPM);
  
  // Pick best candidate
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  
  // Normalize confidence (0-1 range)
  const confidence = Math.min(1, best.score / 0.5);
  
  return {
    bpm: best.bpm,
    confidence: confidence
  };
}

/**
 * Estimate phase (first beat time) for given BPM
 */
function estimatePhase(flux, bpm, sampleRate) {
  const hopMs = 10;
  const beatMs = 60000 / bpm;
  
  // Search for phase offset that maximizes flux-on-beat
  const searchWindowMs = Math.min(beatMs * 4, 5000); // First few beats
  const searchWindowFrames = Math.floor(searchWindowMs / hopMs);
  
  let bestPhaseMs = 0;
  let bestScore = 0;
  
  // Try different phase offsets
  const phaseStep = hopMs; // Try every frame
  for (let phaseMs = 0; phaseMs < beatMs; phaseMs += phaseStep) {
    let score = 0;
    let beatCount = 0;
    
    // Sum flux at beat positions
    for (let t = phaseMs; t < searchWindowMs; t += beatMs) {
      const frameIdx = Math.floor(t / hopMs);
      if (frameIdx < flux.length) {
        score += flux[frameIdx];
        beatCount++;
      }
    }
    
    const avgScore = beatCount > 0 ? score / beatCount : 0;
    
    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestPhaseMs = phaseMs;
    }
  }
  
  // Calculate confidence based on how much better this phase is vs random
  const randomScore = flux.slice(0, searchWindowFrames).reduce((a, b) => a + b, 0) / searchWindowFrames;
  const confidence = Math.min(1, bestScore / (randomScore * 2));
  
  return {
    phaseMs: bestPhaseMs,
    confidence: confidence
  };
}

/**
 * Generate beat grid with subdivisions
 * 
 * @param {Object} params - Grid parameters
 * @param {number} params.bpm - Beats per minute
 * @param {number} params.phaseMs - First beat time in ms
 * @param {number} params.lengthMs - Total song length in ms
 * @param {number} params.subdiv - Subdivision (2, 3, 4, or 0 for beats only)
 * @returns {Array<{tms: number, type: string}>} Beat grid times
 */
export function makeBeatGrid({ bpm, phaseMs, lengthMs, subdiv = 4 }) {
  const beatMs = 60000 / bpm;
  const times = [];
  
  if (subdiv === 0) {
    // Only beats, no subdivisions
    for (let t = phaseMs; t <= lengthMs; t += beatMs) {
      times.push({ tms: t, type: 'beat' });
    }
  } else {
    // Beats with subdivisions
    const step = beatMs / subdiv;
    
    for (let t = phaseMs; t <= lengthMs; t += beatMs) {
      times.push({ tms: t, type: 'beat' });
      
      // Add subdivisions
      for (let i = 1; i < subdiv; i++) {
        const subTime = t + i * step;
        if (subTime <= lengthMs) {
          times.push({ tms: subTime, type: 'sub' });
        }
      }
    }
  }
  
  return times.sort((a, b) => a.tms - b.tms);
}

/**
 * Map beat grid time to lane using deterministic pattern
 * Ensures variety and avoids >2 consecutive notes in same lane
 */
export function laneForGridIndex(index, gridType, numLanes = 4) {
  // Pattern ensures no more than 2 consecutive in same lane
  const beatPattern = [0, 1, 2, 3, 1, 3, 0, 2]; // Beat pattern
  const subPattern = [3, 2, 1, 0, 2, 0, 3, 1];  // Sub pattern
  
  const pattern = gridType === 'beat' ? beatPattern : subPattern;
  return pattern[index % pattern.length];
}

/**
 * Quantize a time to nearest grid point
 */
export function quantizeToGrid(ms, grid, mode = 'hard', maxSnapMs = 60) {
  if (!grid || grid.length === 0) return ms;
  
  // Find nearest grid point
  let nearestIdx = 0;
  let minDist = Math.abs(ms - grid[0].tms);
  
  for (let i = 1; i < grid.length; i++) {
    const dist = Math.abs(ms - grid[i].tms);
    if (dist < minDist) {
      minDist = dist;
      nearestIdx = i;
    }
  }
  
  const nearestTime = grid[nearestIdx].tms;
  const delta = Math.abs(ms - nearestTime);
  
  if (mode === 'hard') {
    return nearestTime;
  } else if (mode === 'soft') {
    return delta <= maxSnapMs ? nearestTime : ms;
  }
  
  return ms;
}
