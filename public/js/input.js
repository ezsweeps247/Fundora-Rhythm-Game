/**
 * input.js
 * 
 * Keyboard input handling and key mapping
 * Features:
 * - Configurable key bindings for each lane
 * - Key press/release detection
 * - Key remapping functionality
 * - localStorage persistence for custom keybinds
 * 
 * Default keys: D, F, J, K (standard rhythm game layout)
 */

export class InputManager {
  constructor() {
    // Default key mapping (lane index -> key code)
    this.defaultKeyMap = {
      0: 'KeyD',  // Lane 0 (leftmost)
      1: 'KeyF',  // Lane 1
      2: 'KeyJ',  // Lane 2
      3: 'KeyK',  // Lane 3 (rightmost)
    };
    
    // Current key mapping (can be customized)
    this.keyMap = { ...this.defaultKeyMap };
    
    // Reverse mapping (key code -> lane index) for quick lookup
    this.reverseKeyMap = {};
    this.updateReverseKeyMap();
    
    // Track which lanes are currently pressed
    this.lanePressed = [false, false, false, false];
    
    // Callbacks for key events
    this.onLanePress = null;    // Called when a lane key is pressed
    this.onLaneRelease = null;  // Called when a lane key is released
    this.onKeyDown = null;      // Called for any key press
    this.onKeyUp = null;        // Called for any key release
    
    // Key listening mode (for remapping)
    this.isListening = false;
    this.listeningLane = -1;
    this.onKeyCapture = null;
    
    // Load saved key mappings from localStorage
    this.loadKeyMap();
    
    // Set up keyboard event listeners
    this.setupEventListeners();
  }

  /**
   * Set up keyboard event listeners
   * Listens for keydown and keyup events on the window
   */
  setupEventListeners() {
    // Key press handler
    window.addEventListener('keydown', (e) => {
      // Prevent default behavior for game keys
      if (this.reverseKeyMap[e.code] !== undefined) {
        e.preventDefault();
      }
      
      // If in listening mode (for key remapping), capture the key
      if (this.isListening) {
        this.captureKey(e.code);
        return;
      }
      
      // Check if this key is mapped to a lane
      const lane = this.reverseKeyMap[e.code];
      
      if (lane !== undefined) {
        // Prevent key repeat (only trigger once per press)
        if (!this.lanePressed[lane]) {
          this.lanePressed[lane] = true;
          
          // Call the lane press callback if set
          // CRITICAL: Pass event.timeStamp for precise judgment timing
          // event.timeStamp is captured at the EXACT moment of key press
          // This eliminates render loop jitter (±8-30ms error)
          if (this.onLanePress) {
            this.onLanePress(lane, e.timeStamp);
          }
        }
      }
      
      // Call generic key down callback
      if (this.onKeyDown) {
        this.onKeyDown(e.code, e.key);
      }
    });
    
    // Key release handler
    window.addEventListener('keyup', (e) => {
      const lane = this.reverseKeyMap[e.code];
      
      if (lane !== undefined) {
        this.lanePressed[lane] = false;
        
        // Call the lane release callback if set
        if (this.onLaneRelease) {
          this.onLaneRelease(lane);
        }
      }
      
      // Call generic key up callback
      if (this.onKeyUp) {
        this.onKeyUp(e.code, e.key);
      }
    });
  }

  /**
   * Update the reverse key map (key code -> lane)
   * Called whenever key bindings change
   */
  updateReverseKeyMap() {
    this.reverseKeyMap = {};
    for (const lane in this.keyMap) {
      const keyCode = this.keyMap[lane];
      this.reverseKeyMap[keyCode] = parseInt(lane);
    }
  }

  /**
   * Set a key binding for a specific lane
   * 
   * @param {number} lane - Lane index (0-3)
   * @param {string} keyCode - Key code (e.g., 'KeyD', 'KeyA')
   */
  setKeyBinding(lane, keyCode) {
    // Remove old binding if it exists
    const oldKeyCode = this.keyMap[lane];
    if (oldKeyCode && this.reverseKeyMap[oldKeyCode] === lane) {
      delete this.reverseKeyMap[oldKeyCode];
    }
    
    // Set new binding
    this.keyMap[lane] = keyCode;
    this.reverseKeyMap[keyCode] = lane;
    
    console.log(`Lane ${lane} bound to ${keyCode}`);
  }

  /**
   * Get the current key binding for a lane
   * 
   * @param {number} lane - Lane index (0-3)
   * @returns {string} Key code
   */
  getKeyBinding(lane) {
    return this.keyMap[lane];
  }

  /**
   * Get the display key (letter) for a lane
   * 
   * @param {number} lane - Lane index (0-3)
   * @returns {string} Display key (e.g., 'D', 'F')
   */
  getDisplayKey(lane) {
    const keyCode = this.keyMap[lane];
    // Convert 'KeyD' to 'D'
    return keyCode.replace('Key', '').replace('Digit', '');
  }

  /**
   * Start listening for a key press to remap a lane
   * 
   * @param {number} lane - Lane index to remap
   * @param {function} callback - Called when key is captured
   */
  startListening(lane, callback) {
    this.isListening = true;
    this.listeningLane = lane;
    this.onKeyCapture = callback;
  }

  /**
   * Stop listening for key presses
   */
  stopListening() {
    this.isListening = false;
    this.listeningLane = -1;
    this.onKeyCapture = null;
  }

  /**
   * Capture a key press for remapping
   * 
   * @param {string} keyCode - Captured key code
   */
  captureKey(keyCode) {
    if (!this.isListening || this.listeningLane < 0) {
      return;
    }
    
    // Set the new key binding
    this.setKeyBinding(this.listeningLane, keyCode);
    
    // Call the callback
    if (this.onKeyCapture) {
      this.onKeyCapture(this.listeningLane, keyCode);
    }
    
    // Stop listening
    this.stopListening();
  }

  /**
   * Reset all key bindings to defaults
   */
  resetToDefaults() {
    this.keyMap = { ...this.defaultKeyMap };
    this.updateReverseKeyMap();
    console.log('Key bindings reset to defaults');
  }

  /**
   * Save current key map to localStorage
   */
  saveKeyMap() {
    try {
      localStorage.setItem('rhythmGameKeyMap', JSON.stringify(this.keyMap));
      console.log('Key map saved');
    } catch (error) {
      console.error('Failed to save key map:', error);
    }
  }

  /**
   * Load key map from localStorage
   */
  loadKeyMap() {
    try {
      const saved = localStorage.getItem('rhythmGameKeyMap');
      if (saved) {
        this.keyMap = JSON.parse(saved);
        this.updateReverseKeyMap();
        console.log('Key map loaded from storage');
      }
    } catch (error) {
      console.error('Failed to load key map:', error);
      this.keyMap = { ...this.defaultKeyMap };
      this.updateReverseKeyMap();
    }
  }

  /**
   * Check if a specific lane is currently pressed
   * 
   * @param {number} lane - Lane index (0-3)
   * @returns {boolean} True if lane key is pressed
   */
  isLanePressed(lane) {
    return this.lanePressed[lane];
  }

  /**
   * Get all currently pressed lanes
   * 
   * @returns {array} Array of pressed lane indices
   */
  getPressedLanes() {
    const pressed = [];
    for (let i = 0; i < 4; i++) {
      if (this.lanePressed[i]) {
        pressed.push(i);
      }
    }
    return pressed;
  }

  /**
   * Reset all pressed states
   * Useful when changing screens
   */
  resetPressedStates() {
    this.lanePressed = [false, false, false, false];
  }
}
