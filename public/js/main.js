/**
 * main.js
 * 
 * Application entry point
 * Initializes all managers and sets up event handlers
 * Connects all the modules together to create the complete rhythm game
 * 
 * Flow:
 * 1. Create all manager instances
 * 2. Load initial settings
 * 3. Set up UI event listeners
 * 4. Ready to play!
 */

import { AudioManager } from './audio.js';
import { ChartManager } from './chart.js';
import { InputManager } from './input.js';
import { UIManager } from './ui.js';
import { Game, GameState } from './game.js';

// ============================================================
// INITIALIZATION
// ============================================================

// Get canvas element
const canvas = document.getElementById('game-canvas');

// Create manager instances
const audioManager = new AudioManager();
const chartManager = new ChartManager();
const inputManager = new InputManager();
const uiManager = new UIManager();

// Create game instance
const game = new Game(canvas, audioManager, chartManager, inputManager, uiManager);

// Apply initial settings to audio
const settings = uiManager.getSettings();
audioManager.setVolume(settings.volume);
audioManager.setAudioOffset(settings.audioOffset);

// ============================================================
// MENU SCREEN HANDLERS
// ============================================================

/**
 * Start button - Begin the game with selected song
 */
document.getElementById('start-btn').addEventListener('click', async () => {
  const songSelect = document.getElementById('song-select');
  const selectedSong = songSelect.value;
  
  try {
    const settings = uiManager.getSettings();
    
    // Load audio file first to get AudioBuffer for vocal onset detection
    const audioPath = `/audio/${selectedSong}.mp3`;
    let audioBuffer = null;
    
    try {
      const response = await fetch(audioPath);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        await audioContext.close();
      }
    } catch (error) {
      console.warn('Could not load audio for analysis:', error.message);
    }
    
    // Load chart with beat tracking
    const chart = await chartManager.loadChartWithBeatTracking(
      selectedSong,
      audioPath,
      audioBuffer,
      {
        difficulty: settings.difficulty || 'Medium',
        subdivision: settings.subdivision || 4,
        quantizeMode: settings.quantizeMode || 'hard',
        beatLock: settings.beatLock || 'soft'
      }
    );
    
    game.setChart(chart);
    
    // Start the game
    await game.startGame();
  } catch (error) {
    console.error('Failed to start game:', error);
    alert('Failed to load song. Please try again.');
  }
});

/**
 * Settings button - Open settings panel
 */
document.getElementById('settings-btn').addEventListener('click', () => {
  uiManager.openSettings();
});

// ============================================================
// SETTINGS SCREEN HANDLERS
// ============================================================

// Setup settings change listeners
uiManager.setupSettingsListeners({
  onVolumeChange: (volume) => {
    audioManager.setVolume(volume);
  },
  onOffsetChange: (offset) => {
    audioManager.setAudioOffset(offset);
  },
  onSubdivisionChange: (subdivision) => {
    // Subdivision only applies to new charts
    console.log(`Subdivision updated: ${subdivision} (restart game to apply)`);
  },
  onQuantizeModeChange: (mode) => {
    // Quantize mode only applies to new charts
    console.log(`Quantize mode updated: ${mode} (restart game to apply)`);
  },
  onBeatLockChange: (mode) => {
    // Beat lock only applies to new charts
    console.log(`Beat lock updated: ${mode} (restart game to apply)`);
  },
});

/**
 * Key binding buttons - Remap controls
 */
const keyButtons = document.querySelectorAll('.key-btn');
keyButtons.forEach(button => {
  button.addEventListener('click', () => {
    const lane = parseInt(button.dataset.lane);
    
    // Start listening for new key
    button.classList.add('listening');
    button.textContent = '...';
    
    inputManager.startListening(lane, (capturedLane, keyCode) => {
      // Update button display
      button.classList.remove('listening');
      button.textContent = inputManager.getDisplayKey(capturedLane);
      
      // Save key map
      inputManager.saveKeyMap();
    });
  });
});

/**
 * Save settings button
 */
document.getElementById('save-settings-btn').addEventListener('click', () => {
  uiManager.applySettings();
  inputManager.saveKeyMap();
  uiManager.showScreen('menu');
});

/**
 * Cancel settings button
 */
document.getElementById('cancel-settings-btn').addEventListener('click', () => {
  // Reload settings from storage (discard changes)
  uiManager.loadSettings();
  inputManager.loadKeyMap();
  
  // Update UI to reflect loaded settings
  uiManager.updateSettingsUI();
  
  // Update key binding buttons
  keyButtons.forEach(button => {
    const lane = parseInt(button.dataset.lane);
    button.textContent = inputManager.getDisplayKey(lane);
  });
  
  // Apply settings to audio
  const settings = uiManager.getSettings();
  audioManager.setVolume(settings.volume);
  audioManager.setAudioOffset(settings.audioOffset);
  
  uiManager.showScreen('menu');
});

// ============================================================
// PAUSE SCREEN HANDLERS
// ============================================================

/**
 * Resume button - Continue playing
 */
document.getElementById('resume-btn').addEventListener('click', async () => {
  await game.resumeGame();
});

/**
 * Restart button (from pause) - Restart current song
 */
document.getElementById('restart-btn').addEventListener('click', async () => {
  await game.startGame();
});

/**
 * Menu button (from pause) - Return to menu
 */
document.getElementById('menu-btn').addEventListener('click', () => {
  game.returnToMenu();
});

// ============================================================
// RESULTS SCREEN HANDLERS
// ============================================================

/**
 * Retry button - Play same song again
 */
document.getElementById('retry-btn').addEventListener('click', async () => {
  await game.startGame();
});

/**
 * Back to menu button (from results)
 */
document.getElementById('back-menu-btn').addEventListener('click', () => {
  game.returnToMenu();
});

// ============================================================
// GLOBAL KEYBOARD HANDLERS
// ============================================================

/**
 * Global keyboard shortcuts
 * P - Pause/Resume
 * R - Restart
 * ESC - Return to menu
 */
inputManager.onKeyDown = async (code, key) => {
  // P key - Pause/Resume
  if (key === 'p' || key === 'P') {
    if (game.state === GameState.PLAYING) {
      game.pauseGame();
    } else if (game.state === GameState.PAUSED) {
      await game.resumeGame();
    }
  }
  
  // R key - Restart
  if (key === 'r' || key === 'R') {
    if (game.state === GameState.PLAYING || game.state === GameState.PAUSED) {
      await game.startGame();
    }
  }
  
  // ESC key - Menu
  if (key === 'Escape') {
    if (game.state === GameState.PLAYING || game.state === GameState.PAUSED) {
      game.returnToMenu();
    } else if (game.state === GameState.RESULTS) {
      game.returnToMenu();
    } else if (uiManager.screens.settings.classList.contains('active')) {
      // Close settings without saving
      uiManager.loadSettings();
      const settings = uiManager.getSettings();
      audioManager.setVolume(settings.volume);
      audioManager.setAudioOffset(settings.audioOffset);
      uiManager.showScreen('menu');
    }
  }
};

// ============================================================
// INITIALIZATION COMPLETE
// ============================================================

// Initialize key binding display
keyButtons.forEach(button => {
  const lane = parseInt(button.dataset.lane);
  button.textContent = inputManager.getDisplayKey(lane);
});

console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ffff');
console.log('%c🎮 PATTERN/DIFFICULTY FIX ✅', 'color: #00ff88; font-weight: bold; font-size: 18px');
console.log('%c  • Unique per song • Easy/Medium/Hard • NPS tuned', 'color: #ff00ff; font-weight: bold; font-size: 14px');
console.log('%cSEED-BASED PATTERN GENERATION', 'color: #00d4ff; font-weight: bold; font-size: 14px');
console.log('%c  • Audio hash: each song gets unique identifier', 'color: #00d4ff');
console.log('%c  • Pattern seed: deterministic but unique per song', 'color: #00d4ff');
console.log('%c  • Difficulty: Easy (1.8 NPS) / Medium (2.5 NPS) / Hard (3.6 NPS)', 'color: #00d4ff');
console.log('%c  • Onset detection: notes follow actual musical events', 'color: #00d4ff');
console.log('%c  • Jack guard: prevents unfair same-lane spam', 'color: #00d4ff');
console.log('%cKeys: D F J K • P Pause • R Restart • ESC Menu', 'color: #ffcc00; font-weight: bold');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ffff');
console.log('🎵 Different songs = different patterns (fixed!)');
console.log('⚙️ Settings: Difficulty preset, audio offset, subdivision');
console.log('📊 Debug: Console shows {songSeed, runNonce, playSeed, difficulty, nps}');
console.log('🎮 Medium difficulty ≈ rose-apt feel!');
