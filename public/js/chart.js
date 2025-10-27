/**
 * chart.js
 * 
 * Chart loading and management
 * A "chart" contains:
 * - Song metadata (title, BPM, audio file path)
 * - Note data (when and which lane to hit)
 * 
 * This module handles:
 * - Loading chart JSON files
 * - Seed-based procedural pattern generation (unique per song)
 * - Difficulty-based pattern density
 * - Validating chart data
 * - Sorting notes by time
 */

import { analyzeBeatGrid, makeBeatGrid, laneForGridIndex, quantizeToGrid } from './beattrack.js';
import { generatePattern, adjustDensity, DIFFICULTY_PRESETS } from './patterns.js';
import { hash32, audioHash32 } from './utils.js';

export class ChartManager {
  constructor() {
    this.currentChart = null;
    this.beatGridInfo = null; // Stores {bpm, phaseMs, confidence}
  }

  /**
   * Build a unique, deterministic seed for pattern generation
   * Each song + difficulty combo gets a unique, repeatable pattern
   * 
   * @param {object} meta - Song metadata {title, bpm, phaseMs, path}
   * @param {AudioBuffer} audioBuffer - Audio buffer
   * @param {object} settings - Settings {difficulty, patternSeedLocked, patternSeed}
   * @returns {Promise<number>} Play seed (32-bit unsigned integer)
   */
  async buildPlaySeed(meta, audioBuffer, settings = {}) {
    // Generate audio hash from first 90 seconds
    const ah = await audioHash32(audioBuffer, 90);
    
    // Build unique song key including difficulty for different patterns per difficulty
    const songId = meta.path || meta.title || `song_${Date.now()}`;
    const difficulty = settings.difficulty || 'Medium';
    const baseKey = `${songId}:${meta.bpm.toFixed(2)}:${Math.round(meta.phaseMs)}:${ah}:${difficulty}`;
    const songSeed = await hash32(baseKey);
    
    // By default, seed is deterministic (same song+difficulty = same pattern)
    // Only add random nonce if pattern variation is explicitly enabled
    const playSeed = songSeed >>> 0;
    
    console.log('[Seed]', { songSeed, playSeed, difficulty, song: meta.title || songId.substring(0, 30) });
    
    return playSeed;
  }

  /**
   * Load a chart from a JSON file
   * 
   * @param {string} chartPath - Path to chart JSON file
   * @returns {Promise<object>} The loaded and validated chart
   * 
   * Chart JSON structure:
   * {
   *   "title": "Song Name",
   *   "audio": "/public/audio/song.mp3",
   *   "offsetMs": 0,
   *   "bpm": 120,
   *   "lanes": 4,
   *   "notes": [
   *     { "timeMs": 1000, "lane": 0 },
   *     { "timeMs": 1250, "lane": 1 }
   *   ]
   * }
   */
  async loadChart(chartPath) {
    try {
      const response = await fetch(chartPath);
      
      if (!response.ok) {
        throw new Error(`Failed to load chart: ${response.status}`);
      }
      
      const chart = await response.json();
      
      // Validate the chart structure
      this.validateChart(chart);
      
      // Sort notes by time (just in case they're not sorted in the file)
      chart.notes.sort((a, b) => a.timeMs - b.timeMs);
      
      // Store the loaded chart
      this.currentChart = chart;
      
      console.log(`Chart loaded: ${chart.title} (${chart.notes.length} notes)`);
      
      return chart;
      
    } catch (error) {
      console.error('Failed to load chart:', error);
      throw error;
    }
  }

  /**
   * Load chart with beat tracking
   * Priority: Cached JSON → Beat grid analysis
   * 
   * @param {string} songId - Song ID (e.g., 'sample1')
   * @param {string} audioPath - Path to audio file
   * @param {AudioBuffer} audioBuffer - Audio buffer for beat analysis
   * @param {Object} settings - Settings {subdivision, quantizeMode, beatLock}
   * @returns {Promise<object>} Generated chart
   */
  async loadChartWithBeatTracking(songId, audioPath, audioBuffer, settings = {}) {
    const {
      subdivision = 4,      // 0=beats only, 2/3/4=subdivisions
      quantizeMode = 'hard', // 'hard' or 'soft'
      beatLock = 'soft'     // 'off', 'soft', 'hard'
    } = settings;
    
    // Try to load cached chart first
    try {
      const response = await fetch(`/charts/${songId}.json`);
      if (response.ok) {
        const chart = await response.json();
        this.validateChart(chart);
        
        // If quantization is enabled and we have audio, quantize the cached chart to beat grid
        // OR if the cached chart has no notes, generate them from the beat grid
        if (audioBuffer && (quantizeMode !== 'off' || chart.notes.length === 0)) {
          try {
            const gridInfo = await analyzeBeatGrid(audioBuffer);
            
            // BPM validation: If detected BPM differs significantly from chart BPM,
            // prefer the chart BPM (manual override for detection errors)
            const detectedBPM = gridInfo.bpm;
            const chartBPM = chart.bpm || 120;
            const bpmDiff = Math.abs(detectedBPM - chartBPM);
            const bpmDiffPercent = (bpmDiff / chartBPM) * 100;
            
            if (bpmDiffPercent > 10 && chartBPM > 0) {
              console.warn(`⚠️ BPM mismatch: detected ${detectedBPM.toFixed(1)}, chart says ${chartBPM}. Using chart BPM.`);
              gridInfo.bpm = chartBPM;
            } else if (bpmDiffPercent > 5) {
              console.log(`ℹ️ BPM variance: detected ${detectedBPM.toFixed(1)}, chart ${chartBPM} (${bpmDiffPercent.toFixed(1)}% diff)`);
            }
            
            this.beatGridInfo = gridInfo;
            
            // If chart has no notes, generate them using seed-based pattern
            if (chart.notes.length === 0 && gridInfo.onsets && gridInfo.onsets.length > 0) {
              const meta = {
                title: chart.title,
                bpm: gridInfo.bpm,
                phaseMs: gridInfo.phaseMs,
                path: audioPath,
              };
              
              const playSeed = await this.buildPlaySeed(meta, audioBuffer, settings);
              const difficultyKey = settings.difficulty || 'Medium';
              const preset = DIFFICULTY_PRESETS[difficultyKey] || DIFFICULTY_PRESETS['Medium'];
              
              if (!DIFFICULTY_PRESETS[difficultyKey]) {
                console.warn(`Unknown difficulty "${difficultyKey}", using Medium`);
              }
              
              let notes = generatePattern(gridInfo.onsets, {
                lanes: 4,
                seed: playSeed,
                ...preset,
              });
              
              // Enforce target NPS if specified in preset
              if (preset.targetNPS) {
                notes = adjustDensity(notes, audioBuffer.duration * 1000, preset.targetNPS, playSeed);
              }
              
              chart.notes = notes;
              
              const nps = chart.notes.length / (audioBuffer.duration);
              console.log(`✓ Generated ${chart.notes.length} notes (${nps.toFixed(2)} NPS, ${settings.difficulty || 'Medium'}): ${chart.title}`);
            }
            
            chart.beatGridInfo = gridInfo;
            chart.subdivision = subdivision;
            chart.quantizeMode = quantizeMode;
            chart.beatLock = beatLock;
          } catch (error) {
            console.warn('Musical analysis failed, using original chart:', error);
          }
        } else if (chart.notes.length === 0) {
          // Fallback: Chart has no notes and no audioBuffer for analysis
          // Generate simple pattern using BPM from chart
          console.warn(`No audio analysis available for ${chart.title}, using fallback pattern with BPM=${chart.bpm}`);
          const duration = 180; // Assume 3 minute song as fallback
          const generated = this.generateAutoChart(chart.bpm, duration, settings);
          chart.notes = generated.notes;
          console.log(`✓ Generated ${chart.notes.length} fallback notes: ${chart.title}`);
        } else {
          console.log(`✓ Loaded cached chart: ${chart.title}`);
        }
        
        this.currentChart = chart;
        return chart;
      }
    } catch (error) {
      // No cached chart, continue to generation
    }
    
    let notes = [];
    let title = songId;
    let bpm = 120;
    let phaseMs = 0;
    let confidence = 0;
    
    // Analyze musical events from audio
    if (audioBuffer) {
      try {
        const gridInfo = await analyzeBeatGrid(audioBuffer);
        bpm = gridInfo.bpm;
        phaseMs = gridInfo.phaseMs;
        confidence = gridInfo.confidence;
        this.beatGridInfo = gridInfo;
        
        console.log(`Musical Analysis • BPM=${bpm.toFixed(1)} • ${gridInfo.onsets ? gridInfo.onsets.length : 0} events detected`);
        
        // Generate notes using seed-based pattern
        if (gridInfo.onsets && gridInfo.onsets.length > 0) {
          const meta = {
            title: title,
            bpm: bpm,
            phaseMs: phaseMs,
            path: audioPath,
          };
          
          const playSeed = await this.buildPlaySeed(meta, audioBuffer, settings);
          const preset = DIFFICULTY_PRESETS[settings.difficulty || 'Medium'];
          
          notes = generatePattern(gridInfo.onsets, {
            lanes: 4,
            seed: playSeed,
            ...preset,
          });
          
          const nps = notes.length / (audioBuffer.duration);
          console.log(`✓ Generated ${notes.length} notes (${nps.toFixed(2)} NPS, ${settings.difficulty || 'Medium'})`);
        } else {
          // Fallback to simple pattern if onset detection fails
          const duration = audioBuffer.duration;
          const generated = this.generateAutoChart(bpm, duration, settings);
          notes = generated.notes;
        }
        
      } catch (error) {
        console.error('Musical analysis failed:', error);
        // Fallback to simple chart
        const duration = audioBuffer.duration;
        const generated = this.generateAutoChart(bpm, duration, settings);
        notes = generated.notes;
      }
    } else {
      // No audio buffer, generate simple chart
      const duration = 10;
      const generated = this.generateAutoChart(bpm, duration, settings);
      notes = generated.notes;
    }
    
    // Create chart object
    const chart = {
      title: title,
      audio: audioPath,
      offsetMs: 0,
      bpm: bpm,
      phaseMs: phaseMs,
      lanes: 4,
      notes: notes,
      beatGridInfo: this.beatGridInfo,
      subdivision: subdivision,
      quantizeMode: quantizeMode,
      beatLock: beatLock
    };
    
    this.validateChart(chart);
    this.currentChart = chart;
    
    return chart;
  }

  /**
   * Validate chart data structure
   * Ensures all required fields are present and valid
   * 
   * @param {object} chart - Chart data to validate
   * @throws {Error} If chart is invalid
   */
  validateChart(chart) {
    // Check required fields
    if (!chart.title || typeof chart.title !== 'string') {
      throw new Error('Chart must have a valid title');
    }
    
    if (typeof chart.bpm !== 'number' || chart.bpm <= 0) {
      throw new Error('Chart must have a valid BPM');
    }
    
    if (typeof chart.lanes !== 'number' || chart.lanes !== 4) {
      throw new Error('Chart must have exactly 4 lanes');
    }
    
    if (!Array.isArray(chart.notes)) {
      throw new Error('Chart must have a notes array');
    }
    
    // Validate each note
    chart.notes.forEach((note, index) => {
      if (typeof note.timeMs !== 'number' || note.timeMs < 0) {
        throw new Error(`Note ${index}: invalid timeMs`);
      }
      
      if (typeof note.lane !== 'number' || note.lane < 0 || note.lane >= chart.lanes) {
        throw new Error(`Note ${index}: invalid lane (must be 0-3)`);
      }
    });
    
    // Set default offset if not present
    if (typeof chart.offsetMs !== 'number') {
      chart.offsetMs = 0;
    }
    
    // Audio path is optional (can use beep tones)
    if (!chart.audio) {
      chart.audio = null;
    }
  }

  /**
   * Generate a simple auto-chart
   * Useful for testing or when no chart file exists
   * Creates notes in a round-robin pattern across lanes respecting difficulty NPS
   * 
   * @param {number} bpm - Beats per minute
   * @param {number} duration - Duration in seconds
   * @param {object} settings - Settings including difficulty
   * @returns {object} Generated chart
   */
  generateAutoChart(bpm = 120, duration = 10, settings = {}) {
    const difficulty = settings.difficulty || 'Medium';
    const preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS['Medium'];
    const targetNPS = preset.targetNPS || 2.5;
    
    // Calculate target note count based on NPS
    const targetNoteCount = Math.round(targetNPS * duration);
    const noteDuration = (duration * 1000) / targetNoteCount; // milliseconds between notes
    
    const notes = [];
    let currentTime = 1000; // Start at 1 second
    let currentLane = 0;
    
    // Generate exact number of notes based on difficulty
    for (let i = 0; i < targetNoteCount; i++) {
      notes.push({
        timeMs: currentTime,
        lane: currentLane,
        judged: false
      });
      
      // Move to next lane (round-robin: 0, 1, 2, 3, 0, 1, ...)
      currentLane = (currentLane + 1) % 4;
      
      // Move to next note time
      currentTime += noteDuration;
    }
    
    const chart = {
      title: 'Auto-Generated Chart',
      audio: null,
      offsetMs: 0,
      bpm: bpm,
      lanes: 4,
      notes: notes
    };
    
    this.currentChart = chart;
    const actualNPS = notes.length / duration;
    console.log(`Generated auto-chart with ${notes.length} notes (${actualNPS.toFixed(2)} NPS, ${difficulty})`);
    
    return chart;
  }

  /**
   * Get the current loaded chart
   * 
   * @returns {object|null} Current chart or null if none loaded
   */
  getCurrentChart() {
    return this.currentChart;
  }

  /**
   * Apply beat lock correction to the current chart
   * Re-estimates phase based on recent timing and adjusts future notes
   * 
   * @param {number} currentTimeMs - Current song time
   * @param {number} windowMs - Analysis window (default 5000ms)
   */
  applyBeatLockCorrection(currentTimeMs, windowMs = 5000) {
    if (!this.currentChart || !this.beatGridInfo) return;
    
    const beatLock = this.currentChart.beatLock;
    if (beatLock === 'off') return;
    
    // For soft mode, we only adjust phase (keep BPM constant)
    // For hard mode, we could also adjust BPM, but that's rarely needed
    
    // This is a placeholder for beat lock logic
    // In a full implementation, this would:
    // 1. Analyze recent hit timing to detect phase drift
    // 2. Adjust future note times by applying a small correction
    // 3. Use lerp to smooth the correction and avoid pops
    
    // For now, we'll leave this as a hook for future enhancement
  }

  /**
   * Get timing source display name
   * 
   * @returns {string} Timing source name
   */
  getTimingSourceDisplay() {
    if (this.beatGridInfo) {
      return `BeatGrid (BPM=${this.beatGridInfo.bpm.toFixed(1)} phase=${this.beatGridInfo.phaseMs.toFixed(0)}ms conf=${this.beatGridInfo.confidence.toFixed(2)})`;
    }
    return 'Manual Chart';
  }

  /**
   * Get notes that should be visible on screen at a given time
   * Used for rendering notes during gameplay
   * 
   * @param {number} currentTimeMs - Current song time in milliseconds
   * @param {number} approachTimeMs - How far ahead to show notes
   * @returns {array} Array of notes that should be visible
   */
  getVisibleNotes(currentTimeMs, approachTimeMs) {
    if (!this.currentChart) return [];
    
    // Show notes that will hit within the approach time window
    const startTime = currentTimeMs;
    const endTime = currentTimeMs + approachTimeMs;
    
    return this.currentChart.notes.filter(note => {
      return note.timeMs >= startTime && note.timeMs <= endTime;
    });
  }

  /**
   * Get notes in a specific lane within a time window
   * Used for input handling and judgment
   * 
   * @param {number} lane - Lane number (0-3)
   * @param {number} currentTimeMs - Current time in milliseconds
   * @param {number} windowMs - Time window in milliseconds
   * @returns {array} Notes in the specified lane and time window
   */
  getNotesInLane(lane, currentTimeMs, windowMs) {
    if (!this.currentChart) return [];
    
    const startTime = currentTimeMs - windowMs;
    const endTime = currentTimeMs + windowMs;
    
    return this.currentChart.notes.filter(note => {
      return note.lane === lane && 
             note.timeMs >= startTime && 
             note.timeMs <= endTime &&
             !note.judged; // Only get notes that haven't been judged yet
    });
  }
}
