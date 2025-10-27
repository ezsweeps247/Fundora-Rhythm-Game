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
 * - Lyrics-based chart generation (LRC → notes)
 * - Vocal onset detection fallback
 * - Validating chart data
 * - Sorting notes by time
 */

import { LyricsManager } from './lyrics.js';

export class ChartManager {
  constructor() {
    this.currentChart = null;
    this.lyricsManager = new LyricsManager();
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
   * Load chart with lyrics support
   * Priority: Cached JSON → LRC → Vocal onset detection
   * 
   * @param {string} songId - Song ID (e.g., 'sample1')
   * @param {string} audioPath - Path to audio file
   * @param {AudioBuffer} audioBuffer - Audio buffer for vocal onset detection
   * @param {Object} settings - Settings {useLyrics, quantizeMode, langHint}
   * @returns {Promise<object>} Generated chart
   */
  async loadChartWithLyrics(songId, audioPath, audioBuffer, settings = {}) {
    const {
      useLyrics = true,
      quantizeMode = 'off',
      langHint = 'auto',
      perceptualCenter = -35
    } = settings;
    
    // Try to load cached chart first
    try {
      const response = await fetch(`/charts/${songId}.json`);
      if (response.ok) {
        const chart = await response.json();
        this.validateChart(chart);
        this.currentChart = chart;
        console.log(`✓ Loaded cached chart: ${chart.title}`);
        return chart;
      }
    } catch (error) {
      // No cached chart, continue to generation
    }
    
    let notes = [];
    let title = songId;
    let bpm = 120;
    
    // Try LRC if lyrics enabled
    if (useLyrics) {
      try {
        const lrcResponse = await fetch(`/lyrics/${songId}.lrc`);
        if (lrcResponse.ok) {
          const lrcText = await lrcResponse.text();
          const entries = this.lyricsManager.parseLRC(lrcText);
          
          if (entries.length > 0) {
            notes = await this.lyricsManager.generateNotesFromLRC(
              entries,
              bpm,
              quantizeMode,
              langHint,
              perceptualCenter,
              audioBuffer
            );
            console.log(`✓ Timing source: LRC (${entries.length} lines → ${notes.length} notes)`);
          }
        }
      } catch (error) {
        console.warn('LRC file not found or malformed, trying vocal onset detection');
      }
    }
    
    // Fallback to vocal onset detection
    if (notes.length === 0 && audioBuffer) {
      try {
        const onsets = await this.lyricsManager.detectVocalOnsets(audioBuffer, {
          bpm,
          quantizeMode
        });
        
        if (onsets.length > 0) {
          notes = this.lyricsManager.convertOnsetsToNotes(onsets);
          console.log(`✓ Timing source: VocalOnset (${onsets.length} onsets → ${notes.length} notes)`);
        }
      } catch (error) {
        console.error('Vocal onset detection failed:', error);
      }
    }
    
    // If still no notes, generate basic chart
    if (notes.length === 0) {
      console.warn('No lyrics or vocal onsets detected, generating basic chart');
      const duration = audioBuffer ? audioBuffer.duration : 10;
      const generated = this.generateAutoChart(bpm, duration, 8);
      notes = generated.notes;
    }
    
    // Create chart object
    const chart = {
      title: title,
      audio: audioPath,
      offsetMs: 0,
      bpm: bpm,
      lanes: 4,
      notes: notes,
      timingSource: this.lyricsManager.getTimingSource()
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
   * Creates notes in a round-robin pattern across lanes
   * 
   * @param {number} bpm - Beats per minute
   * @param {number} duration - Duration in seconds
   * @param {number} noteInterval - Note interval (e.g., 8 for 8th notes)
   * @returns {object} Generated chart
   */
  generateAutoChart(bpm = 120, duration = 10, noteInterval = 8) {
    const beatDuration = (60 / bpm) * 1000; // milliseconds per beat
    const noteDuration = beatDuration / (noteInterval / 4); // interval between notes
    
    const notes = [];
    let currentTime = 1000; // Start at 1 second
    let currentLane = 0;
    
    // Generate notes until we reach the duration
    while (currentTime < duration * 1000) {
      notes.push({
        timeMs: currentTime,
        lane: currentLane
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
    console.log(`Generated auto-chart with ${notes.length} notes`);
    
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
   * Get timing source display name
   * 
   * @returns {string} Timing source name
   */
  getTimingSourceDisplay() {
    return this.lyricsManager.getTimingSourceDisplay();
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
