/**
 * audio.js
 * 
 * Audio management using Web Audio API
 * Features:
 * - Load and play MP3 files
 * - Fallback to beep tone generation if MP3 is missing
 * - Volume control
 * - Audio offset adjustment (for sync issues)
 * - Playback controls (play, pause, seek)
 * 
 * Web Audio API allows precise timing control for rhythm games
 */

export class AudioManager {
  constructor() {
    // Create audio context (required for Web Audio API)
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Audio buffer stores the decoded audio data
    this.audioBuffer = null;
    
    // Source node plays the audio
    this.source = null;
    
    // Gain node controls volume
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    
    // Precise timing tracking (single timebase)
    this.isPlaying = false;
    this.startCtxTime = 0;      // AudioContext time when playback started
    this.startSongTimeMs = 0;   // Song time (ms) at playback start
    this.pausedAtMs = 0;        // Song time (ms) where we paused
    
    // Audio offset in milliseconds (positive = delay notes, negative = advance notes)
    this.audioOffsetMs = 0;
    
    // Drift compensation tracking
    this.lastDriftCheck = 0;
    this.driftSamples = [];
    this.maxDrift = 0;
    
    // Flag to track if using beep tones instead of real audio
    this.usingBeepTones = false;
    
    // Store BPM for beep tone generation
    this.bpm = 120;
  }

  /**
   * Load an audio file from URL
   * If loading fails, automatically generates beep tones instead
   * 
   * @param {string} url - Path to audio file
   * @param {number} bpm - Beats per minute (for beep tone fallback)
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async loadAudio(url, bpm = 120) {
    this.bpm = bpm;
    
    try {
      // Try to fetch the audio file
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to load audio: ${response.status}`);
      }
      
      // Get the audio data as an array buffer
      const arrayBuffer = await response.arrayBuffer();
      
      // Decode the audio data into a playable format
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.usingBeepTones = false;
      console.log('Audio loaded successfully:', url);
      return true;
      
    } catch (error) {
      // If audio file doesn't exist or fails to load, generate beep tones
      console.warn('Audio file not found, generating beep tones:', error.message);
      this.generateBeepTones(bpm);
      this.usingBeepTones = true;
      return false;
    }
  }

  /**
   * Generate beep tones as audio fallback
   * Creates a simple pattern of beeps based on BPM
   * 
   * @param {number} bpm - Beats per minute
   */
  generateBeepTones(bpm) {
    // Calculate timing based on BPM
    const beatDuration = 60 / bpm;           // Seconds per beat
    const measures = 4;                       // 4 measures
    const beatsPerMeasure = 4;               // 4/4 time signature
    const totalBeats = measures * beatsPerMeasure;
    const totalDuration = totalBeats * beatDuration;
    
    // Create a buffer for the generated audio
    const sampleRate = this.audioContext.sampleRate;
    const bufferLength = Math.ceil(totalDuration * sampleRate);
    this.audioBuffer = this.audioContext.createBuffer(1, bufferLength, sampleRate);
    const channelData = this.audioBuffer.getChannelData(0);
    
    // Generate beeps at each beat
    for (let beat = 0; beat < totalBeats; beat++) {
      const startTime = beat * beatDuration;
      const startSample = Math.floor(startTime * sampleRate);
      const beepDuration = 0.1; // 100ms beep
      const beepSamples = Math.floor(beepDuration * sampleRate);
      
      // Generate a simple sine wave beep
      // Higher frequency (880 Hz) on first beat of measure, lower (440 Hz) otherwise
      const frequency = (beat % beatsPerMeasure === 0) ? 880 : 440;
      
      for (let i = 0; i < beepSamples; i++) {
        const sample = startSample + i;
        if (sample < bufferLength) {
          // Sine wave: sin(2π * frequency * time)
          const t = i / sampleRate;
          const value = Math.sin(2 * Math.PI * frequency * t);
          
          // Apply envelope (fade in/out) to avoid clicks
          const envelope = Math.min(i / (beepSamples * 0.1), 1) * 
                          Math.min((beepSamples - i) / (beepSamples * 0.1), 1);
          
          channelData[sample] = value * envelope * 0.3; // 0.3 = volume
        }
      }
    }
    
    console.log(`Generated ${totalDuration.toFixed(2)}s of beep tones at ${bpm} BPM`);
  }

  /**
   * Start or resume audio playback
   * @param {number} atMs - Optional: start at specific time in ms (default: resume from pause)
   */
  async play(atMs = null) {
    if (!this.audioBuffer) {
      console.error('No audio loaded');
      return;
    }
    
    if (this.isPlaying) {
      return; // Already playing
    }
    
    // Resume audio context if suspended (required in many browsers)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // Create a new source node (sources can only be used once)
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.connect(this.gainNode);
    
    // Determine start time
    const startMs = atMs !== null ? atMs : this.pausedAtMs;
    const offsetSeconds = startMs / 1000;
    
    // Start playback
    this.source.start(0, offsetSeconds);
    
    // Record precise timing anchors
    this.startCtxTime = this.audioContext.currentTime;
    this.startSongTimeMs = startMs;
    this.isPlaying = true;
    
    // Reset drift tracking
    this.lastDriftCheck = this.audioContext.currentTime;
    this.driftSamples = [];
    this.maxDrift = 0;
    
    console.log(`Audio playback started at ${this.audioContext.currentTime.toFixed(3)}s, song position: ${startMs}ms`);
    
    // Handle when the audio ends naturally
    this.source.onended = () => {
      if (this.isPlaying) {
        this.pausedAtMs = this.songTimeMs();
        this.isPlaying = false;
        console.log(`Audio playback ended naturally at ${this.pausedAtMs.toFixed(1)}ms`);
      }
    };
  }

  /**
   * Pause audio playback
   */
  pause() {
    if (!this.isPlaying) {
      return;
    }
    
    // Remember exact song position where we paused
    this.pausedAtMs = this.songTimeMs();
    
    // Stop the source
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
    
    this.isPlaying = false;
    console.log(`Paused at ${this.pausedAtMs.toFixed(1)}ms`);
  }

  /**
   * Seek to a specific time in the song
   * 
   * @param {number} timeMs - Target time in milliseconds
   */
  seek(timeMs) {
    const wasPlaying = this.isPlaying;
    
    if (this.isPlaying) {
      this.pause();
    }
    
    this.pausedAtMs = timeMs;
    
    if (wasPlaying) {
      this.play(timeMs);
    }
  }

  /**
   * Get current song time in milliseconds (PRECISE TIMEBASE)
   * Uses getOutputTimestamp() for maximum accuracy
   * Includes drift compensation and audio offset
   * 
   * @returns {number} Current song time in milliseconds
   */
  songTimeMs() {
    if (!this.isPlaying) {
      return this.pausedAtMs;
    }
    
    // Use getOutputTimestamp() for precise timing when available
    const ctxNow = this.audioContext.getOutputTimestamp
      ? this.audioContext.getOutputTimestamp().contextTime
      : this.audioContext.currentTime;
    
    // Calculate elapsed time since playback started
    const runningMs = (ctxNow - this.startCtxTime) * 1000;
    
    // Compute song time with offset
    const songTime = this.startSongTimeMs + runningMs + this.audioOffsetMs;
    
    // Drift compensation (every 5 seconds)
    if (ctxNow - this.lastDriftCheck >= 5.0) {
      this.compensateDrift(ctxNow, songTime);
      this.lastDriftCheck = ctxNow;
    }
    
    return songTime;
  }

  /**
   * Get song time at the EXACT moment of an input event (FRAME-INDEPENDENT JUDGMENT)
   * Uses event.timeStamp (performance time) to calculate precise song time
   * without relying on render loop timing
   * 
   * This is critical for accurate rhythm game judgment:
   * - event.timeStamp is captured at the moment of input
   * - Render loop can run at variable fps (16ms-60ms jitter)
   * - Using render time would add ±8-30ms error
   * 
   * @param {number} eventTimeStamp - event.timeStamp from DOM event (DOMHighResTimeStamp)
   * @returns {number} Song time in milliseconds at the event moment
   */
  songTimeAtEventMs(eventTimeStamp) {
    if (!this.isPlaying) {
      return this.pausedAtMs;
    }
    
    // Get current song time and performance time for calibration
    const nowSong = this.songTimeMs();
    const perfNow = performance.now();
    
    // Calculate time delta between event and now
    // eventTimeStamp and perfNow are both in Performance timeline
    const deltaMs = eventTimeStamp - perfNow;
    
    // Adjust song time by the delta (negative = event in past)
    // This gives us song time at the exact moment of the event
    return nowSong + deltaMs;
  }

  /**
   * Drift compensation - corrects accumulated timing errors
   * Resamples timing anchor to prevent drift over long playback
   * 
   * @param {number} ctxNow - Current audio context time
   * @param {number} currentSongTime - Current calculated song time
   */
  compensateDrift(ctxNow, currentSongTime) {
    // Calculate expected song time from audio buffer position
    const expectedMs = this.startSongTimeMs + (ctxNow - this.startCtxTime) * 1000 + this.audioOffsetMs;
    const drift = expectedMs - currentSongTime;
    
    // Track drift statistics
    this.driftSamples.push(Math.abs(drift));
    if (this.driftSamples.length > 10) {
      this.driftSamples.shift(); // Keep last 10 samples
    }
    this.maxDrift = Math.max(this.maxDrift, Math.abs(drift));
    
    // Apply correction if drift exceeds threshold (2ms)
    if (Math.abs(drift) > 2) {
      // Smooth correction (apply 50% of drift to avoid visual jumps)
      this.startSongTimeMs += drift * 0.5;
      console.log(`Drift corrected: ${drift.toFixed(2)}ms → ${(drift * 0.5).toFixed(2)}ms`);
    }
  }

  /**
   * Get drift statistics for debugging
   * @returns {object} Drift stats {avg, max}
   */
  getDriftStats() {
    const avg = this.driftSamples.length > 0
      ? this.driftSamples.reduce((a, b) => a + b, 0) / this.driftSamples.length
      : 0;
    return { avg, max: this.maxDrift };
  }

  /**
   * Legacy compatibility: alias for songTimeMs()
   * @deprecated Use songTimeMs() instead
   */
  getSongTimeMs() {
    return this.songTimeMs();
  }

  /**
   * Set playback volume
   * 
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set audio offset for sync adjustment
   * Positive values delay the audio, negative values advance it
   * 
   * @param {number} offsetMs - Offset in milliseconds
   */
  setAudioOffset(offsetMs) {
    this.audioOffsetMs = offsetMs;
  }

  /**
   * Get total duration of loaded audio
   * 
   * @returns {number} Duration in milliseconds
   */
  getDuration() {
    return this.audioBuffer ? this.audioBuffer.duration * 1000 : 0;
  }

  /**
   * Stop and reset audio
   */
  stop() {
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
    this.isPlaying = false;
    this.startCtxTime = 0;
    this.startSongTimeMs = 0;
    this.pausedAtMs = 0;
    this.driftSamples = [];
    this.maxDrift = 0;
  }
}
