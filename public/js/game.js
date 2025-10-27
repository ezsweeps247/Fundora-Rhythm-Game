/**
 * game.js
 * 
 * Main game logic and state management
 * Implements:
 * - Game state machine (MENU → PLAYING → PAUSED → RESULTS)
 * - Game loop (rendering and update)
 * - Note rendering and movement
 * - Hit detection and judgment
 * - Combo and score tracking
 * - Canvas rendering
 * 
 * This is the core of the rhythm game!
 */

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  HIT_LINE_POSITION,
  SPAWN_POSITION,
  APPROACH_TIME_MS,
  PREWARM_MS,
  JUDGE_WINDOWS,
  ADAPTIVE_BIAS_CONFIG,
  PERCEPTUAL_CENTER_MS,
  calculateJudgment,
  getScoreForJudgment,
  clamp01,
  lerp,
} from './utils.js';

import { REF_PROFILE_KEY } from './beattrack.js';

// Game states
export const GameState = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULTS: 'results',
};

// Lane colors (matching CSS variables)
const LANE_COLORS = [
  '#00d4ff',  // Cyan (Lane 0)
  '#ff00ff',  // Magenta (Lane 1)
  '#ffcc00',  // Yellow (Lane 2)
  '#00ff88',  // Green (Lane 3)
];

export class Game {
  constructor(canvas, audioManager, chartManager, inputManager, uiManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audioManager;
    this.chart = chartManager;
    this.input = inputManager;
    this.ui = uiManager;
    
    // Game state
    this.state = GameState.MENU;
    this.currentChart = null;
    
    // Score tracking
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgments = {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
    };
    
    // Animation frame ID
    this.animationFrameId = null;
    
    // Setup input callbacks
    this.setupInputCallbacks();
    
    // Lane flash state (for visual feedback)
    this.laneFlash = [0, 0, 0, 0]; // 0-1, fades to 0
  }

  /**
   * Setup input manager callbacks
   * Handles lane presses during gameplay with PRECISE event timing
   */
  setupInputCallbacks() {
    // When a lane key is pressed
    // CRITICAL: Now receives eventTimeStamp for frame-independent judgment
    this.input.onLanePress = (lane, eventTimeStamp) => {
      // Only process input during gameplay
      if (this.state !== GameState.PLAYING) {
        return;
      }
      
      // Flash the lane for visual feedback
      this.laneFlash[lane] = 1.0;
      
      // Judge the note with precise event timing
      this.judgeNote(lane, eventTimeStamp);
    };
  }

  /**
   * Start a new game with the loaded chart
   */
  async startGame() {
    // Make sure we have a chart
    if (!this.currentChart) {
      console.error('No chart loaded');
      return;
    }
    
    // Reset game state
    this.resetGameState();
    
    // Reset input states
    this.input.resetPressedStates();
    
    // Update UI
    this.ui.resetHUD();
    this.ui.updateSongTitle(this.currentChart.title);
    this.ui.showScreen('game');
    
    // Load and play audio
    let audioPath = this.currentChart.audio || '';
    // If audioPath is just a filename (no path), prepend /audio/
    if (audioPath && !audioPath.startsWith('/') && !audioPath.startsWith('http')) {
      audioPath = `/audio/${audioPath}`;
    }
    await this.audio.loadAudio(audioPath, this.currentChart.bpm);
    await this.audio.play();
    
    // Start game state
    this.state = GameState.PLAYING;
    
    // Start game loop
    this.startGameLoop();
  }

  /**
   * Reset game state to initial values
   */
  resetGameState() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgments = {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
    };
    
    // Reset note judged flags
    if (this.currentChart) {
      this.currentChart.notes.forEach(note => {
        note.judged = false;
      });
    }
    
    this.laneFlash = [0, 0, 0, 0];
  }

  /**
   * Pause the game
   */
  pauseGame() {
    if (this.state !== GameState.PLAYING) {
      return;
    }
    
    this.state = GameState.PAUSED;
    this.audio.pause();
    this.ui.showScreen('pause');
  }

  /**
   * Resume the game from pause
   */
  async resumeGame() {
    if (this.state !== GameState.PAUSED) {
      return;
    }
    
    this.state = GameState.PLAYING;
    await this.audio.play();
    this.ui.showScreen('game');
  }

  /**
   * Return to menu
   */
  returnToMenu() {
    this.state = GameState.MENU;
    this.audio.stop();
    this.stopGameLoop();
    this.ui.showScreen('menu');
  }

  /**
   * Judge a note when a lane key is pressed
   * 
   * PRECISE TIMING (BEAT SYNC):
   * - Uses event.timeStamp for frame-independent judgment (no render jitter)
   * - Time delta ONLY - screen position is purely visual
   * 
   * @param {number} lane - Lane index (0-3)
   * @param {number} eventTimeStamp - DOM event.timeStamp (performance time)
   */
  judgeNote(lane, eventTimeStamp) {
    // Get song time at the EXACT moment of key press (not render loop time)
    const eventSongMs = this.audio.songTimeAtEventMs(eventTimeStamp);
    
    // Find all unjudged notes in this lane within judgment window
    const maxWindow = JUDGE_WINDOWS.good;
    const candidateNotes = this.currentChart.notes.filter(note => {
      if (note.lane !== lane || note.judged) {
        return false;
      }
      // TIME DELTA ONLY - screen position irrelevant
      const delta = note.timeMs - eventSongMs;
      return Math.abs(delta) <= maxWindow;
    });
    
    if (candidateNotes.length === 0) {
      // No note to hit, don't break combo
      return;
    }
    
    // Find the closest note (by time delta)
    let closestNote = candidateNotes[0];
    let closestDiff = Math.abs(closestNote.timeMs - eventSongMs);
    
    for (const note of candidateNotes) {
      const diff = Math.abs(note.timeMs - eventSongMs);
      if (diff < closestDiff) {
        closestNote = note;
        closestDiff = diff;
      }
    }
    
    // Calculate time delta (positive = late, negative = early)
    const delta = eventSongMs - closestNote.timeMs;
    
    // Calculate judgment based on time delta
    const judgment = calculateJudgment(delta);
    
    // Mark note as judged
    closestNote.judged = true;
    
    // Apply judgment
    this.applyJudgment(judgment);
  }

  /**
   * Apply a judgment to the game state
   * Updates score, combo, and statistics
   * 
   * @param {string} judgment - Judgment type
   */
  applyJudgment(judgment) {
    // Record judgment
    this.judgments[judgment]++;
    
    // Update score
    const points = getScoreForJudgment(judgment);
    this.score += points;
    
    // Update combo
    if (judgment === 'miss') {
      this.combo = 0;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    
    // Update UI
    this.ui.updateScore(this.score);
    this.ui.updateCombo(this.combo);
    this.ui.updateAccuracy(this.calculateAccuracy());
    this.ui.showJudgment(judgment);
  }

  /**
   * Auto-judge missed notes
   * Called each frame to check for notes that passed the judgment window
   * Uses PRECISE TIMING - based on songTimeMs(), not screen position
   */
  checkMissedNotes() {
    const now = this.audio.songTimeMs();
    const missWindow = JUDGE_WINDOWS.good;
    
    this.currentChart.notes.forEach(note => {
      if (!note.judged && now > note.timeMs + missWindow) {
        // This note was missed (passed the judgment window)
        note.judged = true;
        this.applyJudgment('miss');
      }
    });
  }

  /**
   * Calculate current accuracy percentage
   * Based on weighted judgment values
   * 
   * @returns {number} Accuracy percentage (0-100)
   */
  calculateAccuracy() {
    const total = this.judgments.perfect + this.judgments.great + 
                  this.judgments.good + this.judgments.miss;
    
    if (total === 0) return 100;
    
    const weighted = (this.judgments.perfect * 1.0) +
                    (this.judgments.great * 0.7) +
                    (this.judgments.good * 0.3) +
                    (this.judgments.miss * 0.0);
    
    return (weighted / total) * 100;
  }

  /**
   * Check if the song has ended
   * 
   * @returns {boolean} True if song is over
   */
  isSongEnded() {
    const currentTime = this.audio.getSongTimeMs();
    const duration = this.audio.getDuration();
    
    // If no notes, just check if audio ended
    if (this.currentChart.notes.length === 0) {
      return currentTime >= duration;
    }
    
    // End when audio finishes or all notes are judged
    const allNotesJudged = this.currentChart.notes.every(note => note.judged);
    const audioEnded = currentTime >= duration;
    const lastNoteTime = this.currentChart.notes[this.currentChart.notes.length - 1].timeMs;
    
    return audioEnded || (allNotesJudged && currentTime > lastNoteTime + 2000);
  }

  /**
   * End the game and show results
   */
  endGame() {
    this.state = GameState.RESULTS;
    this.audio.stop();
    this.stopGameLoop();
    
    // Save BLACKPINK profile if this is BLACKPINK-JUMP
    if (this.currentChart.title === 'BLACKPINK - 뛰어 (JUMP)' && this.chart.beatGridInfo) {
      try {
        const profile = {
          bpm: this.chart.beatGridInfo.bpm,
          phaseMs: this.chart.beatGridInfo.phaseMs,
          confidence: this.chart.beatGridInfo.confidence,
          preFilters: this.chart.beatGridInfo.preFilters || { hp: 30, lp: 2600 },
          fluxHopMs: this.chart.beatGridInfo.fluxHopMs || 10,
          subdivision: this.currentChart.subdivision || 4,
          timestamp: Date.now(),
        };
        localStorage.setItem(REF_PROFILE_KEY, JSON.stringify(profile));
        console.log('✓ Saved BLACKPINK reference profile:', profile);
      } catch (e) {
        console.warn('Failed to save BLACKPINK profile:', e);
      }
    }
    
    // Get timing source from chart manager
    const timingSource = this.chart.getTimingSourceDisplay();
    
    // Show results
    this.ui.showResults({
      score: this.score,
      maxCombo: this.maxCombo,
      accuracy: this.calculateAccuracy(),
      judgments: { ...this.judgments },
      songTitle: this.currentChart.title,
      timingSource: timingSource,
    });
  }

  /**
   * Main game loop
   * Updates game state and renders everything
   */
  gameLoop() {
    // Continue loop
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    
    // Only update during gameplay
    if (this.state !== GameState.PLAYING) {
      return;
    }
    
    // Check for missed notes
    this.checkMissedNotes();
    
    // Update progress bar using precise timing
    const progress = (this.audio.songTimeMs() / this.audio.getDuration()) * 100;
    this.ui.updateProgress(Math.min(progress, 100));
    
    // Check if song ended
    if (this.isSongEnded()) {
      this.endGame();
      return;
    }
    
    // Render game
    this.render();
  }

  /**
   * Render the game canvas
   * Draws lanes, notes, hit line, and visual effects
   */
  render() {
    const ctx = this.ctx;
    const width = CANVAS_WIDTH;
    const height = CANVAS_HEIGHT;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);
    
    // Calculate lane width and positions
    const laneWidth = width / 4;
    const spawnY = height * SPAWN_POSITION;
    const hitLineY = height * HIT_LINE_POSITION;
    const travelPx = hitLineY - spawnY;
    
    // Draw lane backgrounds with flash effect
    for (let i = 0; i < 4; i++) {
      const x = i * laneWidth;
      
      // Flash effect when key pressed
      if (this.laneFlash[i] > 0) {
        ctx.fillStyle = LANE_COLORS[i] + Math.floor(this.laneFlash[i] * 50).toString(16).padStart(2, '0');
        ctx.fillRect(x, 0, laneWidth, height);
        this.laneFlash[i] = Math.max(0, this.laneFlash[i] - 0.05);
      }
    }
    
    // Draw lane dividers
    ctx.strokeStyle = '#3a3a4a';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const x = i * laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Draw notes using PRECISE TIME-BASED POSITIONING
    const now = this.audio.songTimeMs();
    
    // Filter notes: spawn at targetMs - APPROACH_TIME_MS - PREWARM_MS
    const visibleNotes = this.currentChart.notes.filter(note => {
      const spawnTime = note.timeMs - APPROACH_TIME_MS - PREWARM_MS;
      return !note.judged && now >= spawnTime;
    });
    
    visibleNotes.forEach(note => {
      // PRECISE POSITIONING: t = (now - (targetMs - APPROACH_MS)) / APPROACH_MS
      // t == 0: note at spawn position
      // t == 1: note at hitline (exactly at targetMs)
      const t = (now - (note.timeMs - APPROACH_TIME_MS)) / APPROACH_TIME_MS;
      const y = spawnY + clamp01(t) * travelPx;
      
      // If t > 1, note has passed hitline - snap to hitline for judgment
      if (t > 1.05) {
        // Note is far past hitline, mark as judged (miss)
        if (!note.judged) {
          note.judged = true;
        }
        return; // Don't render notes that are too far past
      }
      
      // Draw note
      const x = note.lane * laneWidth;
      const noteWidth = laneWidth - 20;
      const noteHeight = 20;
      
      // Note body
      ctx.fillStyle = LANE_COLORS[note.lane];
      ctx.fillRect(x + 10, y - noteHeight / 2, noteWidth, noteHeight);
      
      // Note border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 10, y - noteHeight / 2, noteWidth, noteHeight);
    });
    
    // Draw hit line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, hitLineY);
    ctx.lineTo(width, hitLineY);
    ctx.stroke();
    
    // Draw lane key indicators at hit line
    ctx.font = 'bold 16px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const x = i * laneWidth + laneWidth / 2;
      const key = this.input.getDisplayKey(i);
      
      // Background
      ctx.fillStyle = 'rgba(10, 10, 15, 0.8)';
      ctx.fillRect(x - 20, hitLineY - 20, 40, 40);
      
      // Text
      ctx.fillStyle = LANE_COLORS[i];
      ctx.fillText(key, x, hitLineY);
    }
    
    // DEBUG HUD - Timing information (top-left corner)
    this.renderDebugHUD(ctx, now);
  }

  /**
   * Render debug HUD showing precise timing information (BEAT SYNC)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} now - Current song time in ms
   */
  renderDebugHUD(ctx, now) {
    // Find next unjudged note
    const nextNote = this.currentChart.notes.find(note => !note.judged);
    
    // Get beat grid info
    const beatInfo = this.currentChart.beatGridInfo;
    
    // Setup text rendering
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    let y = 10;
    const lineHeight = 16;
    
    // Background panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(5, 5, 300, 108);
    
    // Next note delta
    if (nextNote) {
      const delta = now - nextNote.timeMs;
      const deltaColor = Math.abs(delta) > 25 ? '#ff4444' : '#00ff88';
      ctx.fillStyle = deltaColor;
      ctx.fillText(`Δnext: ${delta > 0 ? '+' : ''}${delta.toFixed(1)}ms`, 10, y);
    } else {
      ctx.fillStyle = '#888888';
      ctx.fillText('Δnext: --', 10, y);
    }
    y += lineHeight;
    
    // Beat grid info
    if (beatInfo) {
      ctx.fillStyle = '#00ff88';
      ctx.fillText(`BPM: ${beatInfo.bpm.toFixed(1)}`, 10, y);
      y += lineHeight;
      
      ctx.fillStyle = '#00d4ff';
      ctx.fillText(`Phase: ${beatInfo.phaseMs.toFixed(0)}ms`, 10, y);
      y += lineHeight;
      
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`Conf: ${beatInfo.confidence.toFixed(2)}`, 10, y);
      y += lineHeight;
    } else {
      ctx.fillStyle = '#888888';
      ctx.fillText('BPM: --', 10, y);
      y += lineHeight * 3;
    }
    
    // Grid mode
    const subdiv = this.currentChart.subdivision || 0;
    const subdivText = subdiv === 0 ? 'beats' : `1/${subdiv}`;
    const quantMode = this.currentChart.quantizeMode || 'hard';
    ctx.fillStyle = '#ff00ff';
    ctx.fillText(`Grid: ${subdivText} (${quantMode})`, 10, y);
    y += lineHeight;
    
    // Audio offset
    ctx.fillStyle = '#888888';
    ctx.fillText(`Offset: ${this.audio.audioOffsetMs.toFixed(0)}ms`, 10, y);
    y += lineHeight;
    
    // Timing source
    const useTimestamp = this.audio.audioContext.getOutputTimestamp !== undefined;
    const timingSource = useTimestamp ? 'getOutputTimestamp' : 'fallback';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText(`Source: ${timingSource}`, 10, y);
  }

  /**
   * Start the game loop
   */
  startGameLoop() {
    if (this.animationFrameId) {
      this.stopGameLoop();
    }
    this.gameLoop();
  }

  /**
   * Stop the game loop
   */
  stopGameLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Set the current chart to play
   * 
   * @param {object} chart - Chart data
   */
  setChart(chart) {
    this.currentChart = chart;
  }
}
