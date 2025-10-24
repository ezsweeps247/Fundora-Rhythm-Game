/**
 * ui.js
 * 
 * UI management and DOM manipulation
 * Handles:
 * - Screen transitions (menu, game, pause, results, settings)
 * - HUD updates (score, combo, accuracy)
 * - Settings panel functionality
 * - Results screen display
 * - Judgment text animations
 * - localStorage for settings and best scores
 */

import { formatNumber, calculateGrade } from './utils.js';

export class UIManager {
  constructor() {
    // Get references to all screens
    this.screens = {
      menu: document.getElementById('menu-screen'),
      game: document.getElementById('game-screen'),
      pause: document.getElementById('pause-screen'),
      results: document.getElementById('results-screen'),
      settings: document.getElementById('settings-screen'),
    };
    
    // Get references to HUD elements
    this.hudElements = {
      score: document.getElementById('score-display'),
      combo: document.getElementById('combo-display'),
      accuracy: document.getElementById('accuracy-display'),
      currentSong: document.getElementById('current-song'),
      progressBar: document.getElementById('progress-bar'),
      judgmentText: document.getElementById('judgment-text'),
    };
    
    // Settings elements
    this.settingsElements = {
      volumeSlider: document.getElementById('volume-slider'),
      volumeValue: document.getElementById('volume-value'),
      offsetSlider: document.getElementById('offset-slider'),
      offsetValue: document.getElementById('offset-value'),
    };
    
    // Current settings (will be loaded from localStorage)
    this.settings = {
      volume: 0.7,        // 70%
      audioOffset: 0,     // 0ms
    };
    
    // Load settings from storage
    this.loadSettings();
    
    // Apply initial settings to UI
    this.updateSettingsUI();
  }

  /**
   * Show a specific screen and hide all others
   * 
   * @param {string} screenName - Name of screen to show
   */
  showScreen(screenName) {
    // Hide all screens
    for (const name in this.screens) {
      this.screens[name].classList.remove('active');
    }
    
    // Show the requested screen
    if (this.screens[screenName]) {
      this.screens[screenName].classList.add('active');
    }
  }

  /**
   * Update the score display
   * 
   * @param {number} score - Current score
   */
  updateScore(score) {
    this.hudElements.score.textContent = formatNumber(Math.floor(score));
  }

  /**
   * Update the combo display
   * 
   * @param {number} combo - Current combo count
   */
  updateCombo(combo) {
    this.hudElements.combo.textContent = `${combo}x`;
  }

  /**
   * Update the accuracy display
   * 
   * @param {number} accuracy - Accuracy percentage (0-100)
   */
  updateAccuracy(accuracy) {
    this.hudElements.accuracy.textContent = `${accuracy.toFixed(1)}%`;
  }

  /**
   * Update the current song title
   * 
   * @param {string} title - Song title
   */
  updateSongTitle(title) {
    this.hudElements.currentSong.textContent = title;
  }

  /**
   * Update the progress bar
   * 
   * @param {number} progress - Progress percentage (0-100)
   */
  updateProgress(progress) {
    this.hudElements.progressBar.style.width = `${progress}%`;
  }

  /**
   * Show judgment text with animation
   * Displays "PERFECT", "GREAT", "GOOD", or "MISS" with fade out
   * 
   * @param {string} judgment - Judgment type
   */
  showJudgment(judgment) {
    const element = this.hudElements.judgmentText;
    
    // Set text and color class
    element.textContent = judgment.toUpperCase();
    element.className = `judgment-overlay show ${judgment}`;
    
    // Fade out after 300ms
    setTimeout(() => {
      element.classList.remove('show');
    }, 300);
  }

  /**
   * Display results screen with all statistics
   * 
   * @param {object} results - Results data
   */
  showResults(results) {
    const {
      score,
      maxCombo,
      accuracy,
      judgments,
    } = results;
    
    // Calculate grade
    const grade = calculateGrade(accuracy);
    
    // Update results display
    document.getElementById('final-score').textContent = formatNumber(Math.floor(score));
    document.getElementById('max-combo').textContent = `${maxCombo}x`;
    document.getElementById('final-accuracy').textContent = `${accuracy.toFixed(2)}%`;
    document.getElementById('grade-display').textContent = grade;
    
    // Update judgment counts
    document.getElementById('perfect-count').textContent = judgments.perfect;
    document.getElementById('great-count').textContent = judgments.great;
    document.getElementById('good-count').textContent = judgments.good;
    document.getElementById('miss-count').textContent = judgments.miss;
    
    // Save best score if this is a new record
    this.saveBestScore(results);
    
    // Show results screen
    this.showScreen('results');
  }

  /**
   * Update settings UI elements to match current settings
   */
  updateSettingsUI() {
    // Volume slider and display
    this.settingsElements.volumeSlider.value = this.settings.volume * 100;
    this.settingsElements.volumeValue.textContent = `${Math.round(this.settings.volume * 100)}%`;
    
    // Audio offset slider and display
    this.settingsElements.offsetSlider.value = this.settings.audioOffset;
    this.settingsElements.offsetValue.textContent = `${this.settings.audioOffset}ms`;
  }

  /**
   * Get current settings
   * 
   * @returns {object} Current settings
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Update a specific setting
   * 
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   */
  updateSetting(key, value) {
    this.settings[key] = value;
    this.updateSettingsUI();
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem('rhythmGameSettings', JSON.stringify(this.settings));
      console.log('Settings saved');
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem('rhythmGameSettings');
      if (saved) {
        const loaded = JSON.parse(saved);
        this.settings = {
          volume: loaded.volume ?? 0.7,
          audioOffset: loaded.audioOffset ?? 0,
        };
        console.log('Settings loaded from storage');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Save best score to localStorage
   * Only saves if the new score is higher
   * 
   * @param {object} results - Results data
   */
  saveBestScore(results) {
    try {
      const bestScores = JSON.parse(localStorage.getItem('rhythmGameBestScores') || '{}');
      const songTitle = results.songTitle || 'Unknown';
      
      // Check if this is a new best score
      if (!bestScores[songTitle] || results.score > bestScores[songTitle].score) {
        bestScores[songTitle] = {
          score: results.score,
          accuracy: results.accuracy,
          maxCombo: results.maxCombo,
          date: new Date().toISOString(),
        };
        
        localStorage.setItem('rhythmGameBestScores', JSON.stringify(bestScores));
        console.log(`New best score for ${songTitle}: ${results.score}`);
      }
    } catch (error) {
      console.error('Failed to save best score:', error);
    }
  }

  /**
   * Get best score for a song
   * 
   * @param {string} songTitle - Song title
   * @returns {object|null} Best score data or null
   */
  getBestScore(songTitle) {
    try {
      const bestScores = JSON.parse(localStorage.getItem('rhythmGameBestScores') || '{}');
      return bestScores[songTitle] || null;
    } catch (error) {
      console.error('Failed to load best score:', error);
      return null;
    }
  }

  /**
   * Reset all HUD values to zero
   */
  resetHUD() {
    this.updateScore(0);
    this.updateCombo(0);
    this.updateAccuracy(100);
    this.updateProgress(0);
  }

  /**
   * Setup settings panel event listeners
   * Called once during initialization
   * 
   * @param {object} callbacks - Callback functions for setting changes
   */
  setupSettingsListeners(callbacks) {
    // Volume slider
    this.settingsElements.volumeSlider.addEventListener('input', (e) => {
      const volume = parseFloat(e.target.value) / 100;
      this.updateSetting('volume', volume);
      if (callbacks.onVolumeChange) {
        callbacks.onVolumeChange(volume);
      }
    });
    
    // Audio offset slider
    this.settingsElements.offsetSlider.addEventListener('input', (e) => {
      const offset = parseInt(e.target.value);
      this.updateSetting('audioOffset', offset);
      if (callbacks.onOffsetChange) {
        callbacks.onOffsetChange(offset);
      }
    });
  }

  /**
   * Show settings screen with current values
   */
  openSettings() {
    this.updateSettingsUI();
    this.showScreen('settings');
  }

  /**
   * Apply and save current settings
   */
  applySettings() {
    this.saveSettings();
    console.log('Settings applied:', this.settings);
  }
}
