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
  APPROACH_TIME_MS,
  JUDGE_WINDOWS,
  calculateJudgment,
  getScoreForJudgment,
} from './utils.js';

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
   * Handles lane presses during gameplay
   */
  setupInputCallbacks() {
    // When a lane key is pressed
    this.input.onLanePress = (lane) => {
      // Only process input during gameplay
      if (this.state !== GameState.PLAYING) {
        return;
      }
      
      // Flash the lane for visual feedback
      this.laneFlash[lane] = 1.0;
      
      // Judge the note
      this.judgeNote(lane);
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
   * Finds the closest unjudged note in the lane and calculates judgment
   * 
   * @param {number} lane - Lane index (0-3)
   */
  judgeNote(lane) {
    const currentTime = this.audio.getSongTimeMs();
    
    // Find all unjudged notes in this lane within judgment window
    const maxWindow = JUDGE_WINDOWS.good;
    const candidateNotes = this.currentChart.notes.filter(note => {
      if (note.lane !== lane || note.judged) {
        return false;
      }
      const timeDiff = note.timeMs - currentTime;
      return Math.abs(timeDiff) <= maxWindow;
    });
    
    if (candidateNotes.length === 0) {
      // No note to hit, don't break combo
      return;
    }
    
    // Find the closest note
    let closestNote = candidateNotes[0];
    let closestDiff = Math.abs(closestNote.timeMs - currentTime);
    
    for (const note of candidateNotes) {
      const diff = Math.abs(note.timeMs - currentTime);
      if (diff < closestDiff) {
        closestNote = note;
        closestDiff = diff;
      }
    }
    
    // Calculate judgment
    const timeDiff = closestNote.timeMs - currentTime;
    const judgment = calculateJudgment(timeDiff);
    
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
   * Called each frame to check for notes that passed the hit line
   */
  checkMissedNotes() {
    const currentTime = this.audio.getSongTimeMs();
    const missWindow = JUDGE_WINDOWS.good;
    
    this.currentChart.notes.forEach(note => {
      if (!note.judged && currentTime > note.timeMs + missWindow) {
        // This note was missed
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
    
    // End when audio finishes or all notes are judged
    const allNotesJudged = this.currentChart.notes.every(note => note.judged);
    const audioEnded = currentTime >= duration;
    
    return audioEnded || (allNotesJudged && currentTime > this.currentChart.notes[this.currentChart.notes.length - 1].timeMs + 2000);
  }

  /**
   * End the game and show results
   */
  endGame() {
    this.state = GameState.RESULTS;
    this.audio.stop();
    this.stopGameLoop();
    
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
    
    // Update progress bar
    const progress = (this.audio.getSongTimeMs() / this.audio.getDuration()) * 100;
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
    
    // Calculate lane width
    const laneWidth = width / 4;
    const hitLineY = height * HIT_LINE_POSITION;
    
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
    
    // Draw notes
    const currentTime = this.audio.getSongTimeMs();
    const visibleNotes = this.currentChart.notes.filter(note => {
      return !note.judged && note.timeMs >= currentTime && note.timeMs <= currentTime + APPROACH_TIME_MS;
    });
    
    visibleNotes.forEach(note => {
      // Calculate Y position based on time
      const timeUntilHit = note.timeMs - currentTime;
      const progress = 1 - (timeUntilHit / APPROACH_TIME_MS);
      const y = progress * hitLineY;
      
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
