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
    
    // Playback state tracking
    this.isPlaying = false;
    this.startTime = 0;        // When playback started (in audio context time)
    this.pauseTime = 0;        // Where we paused (in song time)
    
    // Audio offset in milliseconds (positive = delay audio, negative = advance audio)
    this.audioOffsetMs = 0;
    
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
   */
  async play() {
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
    
    // Resume from where we paused (or from beginning)
    const offset = this.pauseTime;
    this.source.start(0, offset);
    
    // Record when we started (in audio context time)
    this.startTime = this.audioContext.currentTime - offset;
    this.isPlaying = true;
    
    console.log(`Audio playback started at ${this.audioContext.currentTime.toFixed(3)}s, offset: ${offset.toFixed(3)}s`);
    
    // Handle when the audio ends naturally
    this.source.onended = () => {
      if (this.isPlaying) {
        // Update pause time to current position before stopping
        this.pauseTime = (this.audioContext.currentTime - this.startTime);
        this.isPlaying = false;
        console.log(`Audio playback ended naturally at ${this.pauseTime.toFixed(3)}s`);
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
    
    // Remember where we paused
    this.pauseTime = this.getSongTimeMs() / 1000;
    
    // Stop the source
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
    
    this.isPlaying = false;
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
    
    this.pauseTime = timeMs / 1000;
    
    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Get current playback time in milliseconds
   * Adjusted for audio offset setting
   * 
   * @returns {number} Current time in milliseconds
   */
  getSongTimeMs() {
    if (!this.isPlaying) {
      return this.pauseTime * 1000;
    }
    
    // Calculate how long we've been playing
    const elapsed = this.audioContext.currentTime - this.startTime;
    
    // Apply audio offset (this helps sync notes with audio)
    return (elapsed * 1000) + this.audioOffsetMs;
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
    this.startTime = 0;
    this.pauseTime = 0;
  }
}
