/**
 * lyrics.js
 * 
 * 가사 기반 노트 생성 시스템 (Lyrics-based note generation system)
 * 
 * 기능 (Features):
 * - LRC 파일 파싱 (타임스탬프가 있는 가사)
 * - 음절 분리 (영어/한글 지원)
 * - 보컬 온셋 감지 (음성 대역 분석)
 * - 가사 → 노트 변환
 * 
 * LRC file parsing (timed lyrics)
 * Syllable separation (English/Korean support)
 * Vocal onset detection (voice band analysis)
 * Lyrics → Note conversion
 */

import { PERCEPTUAL_CENTER_MS } from './utils.js';

// ============================================================
// 상수 설정 (Tuning Constants)
// ============================================================

const VOICE_BAND = [300, 3400];      // 음성 주파수 대역 Hz
const ONSET_HOP_MS = 10;             // 온셋 분석 간격 (ms)
const ONSET_MIN_GAP_MS = 110;        // 최소 온셋 간격 (ms)
const Z_THRESHOLD = 2.0;             // Z-score 임계값
const SOFT_SNAP_MS = 40;             // 소프트 퀀타이제이션 범위 (ms)
const DEFAULT_SYLL_MS = 380;         // 기본 음절 지속 시간 (ms)

export class LyricsManager {
  constructor() {
    this.lrcEntries = [];
    this.timingSource = 'none'; // 'lrc', 'vocal', or 'none'
  }

  /**
   * LRC 파일 파싱 (Parse LRC file)
   * 
   * LRC 형식 예시:
   * [00:12.00] This is a line of lyrics
   * [00:15.30] Another line here
   * 
   * @param {string} lrcText - LRC 파일 텍스트
   * @returns {Array<{timeMs: number, text: string}>} 파싱된 가사 엔트리
   */
  parseLRC(lrcText) {
    const entries = [];
    const lines = lrcText.split('\n');
    
    // LRC 타임스탬프 정규식: [mm:ss.xx] 또는 [mm:ss]
    const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{2})?\]/g;
    
    for (const line of lines) {
      const matches = [...line.matchAll(timeRegex)];
      
      if (matches.length > 0) {
        // 타임스탬프 추출
        const match = matches[0];
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const centiseconds = match[3] ? parseInt(match[3]) : 0;
        
        const timeMs = (minutes * 60 + seconds) * 1000 + centiseconds * 10;
        
        // 타임스탬프 뒤의 텍스트 추출
        const text = line.substring(match[0].length).trim();
        
        if (text) {
          entries.push({ timeMs, text });
        }
      }
    }
    
    // 시간순 정렬
    entries.sort((a, b) => a.timeMs - b.timeMs);
    
    this.lrcEntries = entries;
    console.log(`✓ LRC parsed: ${entries.length} lines`);
    
    return entries;
  }

  /**
   * 텍스트를 음절로 분리 (Syllabify text)
   * 
   * @param {string} text - 분리할 텍스트
   * @param {string} langHint - 언어 힌트 ('auto', 'EN', 'KO')
   * @returns {string[]} 음절 배열
   */
  syllabify(text, langHint = 'auto') {
    const syllables = [];
    
    // 언어 자동 감지
    let detectedLang = langHint;
    if (langHint === 'auto') {
      // 한글이 포함되어 있으면 KO, 아니면 EN
      detectedLang = /[\uAC00-\uD7A3]/.test(text) ? 'KO' : 'EN';
    }
    
    if (detectedLang === 'KO') {
      // 한글: 각 글자를 하나의 음절로 처리
      // Korean: Each Hangul character is one syllable
      const chars = text.split('');
      for (const char of chars) {
        // 한글 음절 범위: \uAC00-\uD7A3
        if (/[\uAC00-\uD7A3]/.test(char)) {
          syllables.push(char);
        } else if (/[a-zA-Z]/.test(char)) {
          // 영어 문자가 섞여 있으면 처리
          syllables.push(char);
        }
        // 공백이나 특수문자는 무시
      }
    } else {
      // 영어: 단어를 분리하고 모음 클러스터로 음절 추정
      // English: Split words and estimate syllables by vowel clusters
      const words = text.split(/\s+/);
      
      for (const word of words) {
        if (!word) continue;
        
        // 간단한 음절 분리: 모음 그룹 찾기
        const vowelPattern = /[aeiouy]+/gi;
        const vowelMatches = [...word.matchAll(vowelPattern)];
        
        if (vowelMatches.length === 0) {
          // 모음이 없으면 단어 전체를 하나의 음절로
          syllables.push(word);
        } else if (vowelMatches.length === 1) {
          // 모음 그룹이 하나면 단어 전체를 하나의 음절로
          syllables.push(word);
        } else {
          // 모음 그룹이 여러 개면 그 개수만큼 음절로 추정
          // 간단한 방법: 각 모음 그룹 위치에서 단어를 나눔
          let lastIndex = 0;
          for (let i = 0; i < vowelMatches.length; i++) {
            const match = vowelMatches[i];
            const nextIndex = i < vowelMatches.length - 1 
              ? vowelMatches[i + 1].index 
              : word.length;
            
            // 현재 모음 그룹의 끝에서 다음 모음 시작 사이의 중간점에서 나눔
            const splitPoint = match.index + match[0].length + 
              Math.floor((nextIndex - (match.index + match[0].length)) / 2);
            
            const syllable = word.substring(lastIndex, splitPoint);
            if (syllable) syllables.push(syllable);
            lastIndex = splitPoint;
          }
          
          // 마지막 부분
          if (lastIndex < word.length) {
            syllables.push(word.substring(lastIndex));
          }
        }
      }
    }
    
    return syllables.filter(s => s.length > 0);
  }

  /**
   * LRC에서 노트 생성 (Generate notes from LRC)
   * 
   * @param {Array} entries - LRC 엔트리 ({timeMs, text})
   * @param {number} bpm - BPM (퀀타이제이션용)
   * @param {string} quantizeMode - 'off', 'soft', 'hard'
   * @param {string} langHint - 언어 힌트
   * @returns {Array<{timeMs: number, lane: number}>} 노트 배열
   */
  generateNotesFromLRC(entries, bpm = 120, quantizeMode = 'off', langHint = 'auto') {
    const notes = [];
    let laneIndex = 0;
    let consecutiveCount = 0;
    let lastLane = -1;
    
    const beatDuration = (60 / bpm) * 1000; // ms per beat
    const eighthNoteDuration = beatDuration / 2; // 1/8 note duration
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const nextEntry = i < entries.length - 1 ? entries[i + 1] : null;
      
      // 음절 분리
      const syllables = this.syllabify(entry.text, langHint);
      
      if (syllables.length === 0) continue;
      
      // 다음 타임스탬프까지의 시간 계산
      const duration = nextEntry 
        ? (nextEntry.timeMs - entry.timeMs) 
        : (syllables.length * DEFAULT_SYLL_MS);
      
      // 음절을 고르게 분배
      const syllableDuration = duration / syllables.length;
      
      for (let j = 0; j < syllables.length; j++) {
        let noteTime = entry.timeMs + (j * syllableDuration);
        
        // 퀀타이제이션 적용
        if (quantizeMode === 'soft' || quantizeMode === 'hard') {
          const snapRange = quantizeMode === 'soft' ? SOFT_SNAP_MS : 0;
          const nearestEighth = Math.round(noteTime / eighthNoteDuration) * eighthNoteDuration;
          const diff = nearestEighth - noteTime;
          
          if (quantizeMode === 'hard' || Math.abs(diff) <= snapRange) {
            noteTime = nearestEighth;
          }
        }
        
        // 레인 할당 (deterministic round-robin with mirroring)
        let lane = laneIndex % 4;
        
        // 같은 레인이 3번 연속이면 미러링
        if (lane === lastLane) {
          consecutiveCount++;
          if (consecutiveCount >= 2) {
            // 미러링: 0↔3, 1↔2
            lane = 3 - lane;
            consecutiveCount = 0;
          }
        } else {
          consecutiveCount = 0;
        }
        
        // Apply perceptual center correction (LYRIC SYNC ENHANCEMENT)
        // Advances note timing by -35ms to align with perceived vocal attack
        notes.push({
          timeMs: Math.round(noteTime + PERCEPTUAL_CENTER_MS),
          lane: lane
        });
        
        lastLane = lane;
        laneIndex++;
      }
    }
    
    this.timingSource = 'lrc';
    console.log(`✓ Generated ${notes.length} notes from LRC (${quantizeMode} quantize)`);
    
    return notes;
  }

  /**
   * 보컬 온셋 감지 (Detect vocal onsets from audio)
   * 
   * 음성 대역(300-3400Hz)만 분석하여 보컬 시작점 감지
   * Analyzes voice band (300-3400Hz) only to detect vocal onsets
   * 
   * @param {AudioBuffer} audioBuffer - 분석할 오디오 버퍼
   * @param {Object} opts - 옵션 {bpm, quantizeMode}
   * @returns {Promise<number[]>} 온셋 시간 배열 (ms)
   */
  async detectVocalOnsets(audioBuffer, opts = {}) {
    const { bpm = 120, quantizeMode = 'off' } = opts;
    
    try {
      // 오프라인 오디오 컨텍스트 생성
      const offlineContext = new OfflineAudioContext(
        1, // mono
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      
      // 소스 버퍼 생성
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // 밴드패스 필터: 300-3400 Hz (음성 대역)
      const bandpass = offlineContext.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = (VOICE_BAND[0] + VOICE_BAND[1]) / 2; // 중심 주파수
      bandpass.Q.value = 1.0;
      
      // 컴프레서 (다이나믹 레인지 줄이기)
      const compressor = offlineContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      
      // 연결: source → bandpass → compressor → destination
      source.connect(bandpass);
      bandpass.connect(compressor);
      compressor.connect(offlineContext.destination);
      
      source.start(0);
      
      // 렌더링
      const renderedBuffer = await offlineContext.startRendering();
      
      // 프레임별 에너지 계산
      const hopSamples = Math.floor((ONSET_HOP_MS / 1000) * audioBuffer.sampleRate);
      const channelData = renderedBuffer.getChannelData(0);
      const frames = [];
      
      for (let i = 0; i < channelData.length; i += hopSamples) {
        const frameEnd = Math.min(i + hopSamples, channelData.length);
        let energy = 0;
        
        for (let j = i; j < frameEnd; j++) {
          energy += channelData[j] * channelData[j];
        }
        
        energy = Math.sqrt(energy / (frameEnd - i));
        frames.push({ time: (i / audioBuffer.sampleRate) * 1000, energy });
      }
      
      // Spectral flux 계산 (에너지 변화율)
      const fluxes = [];
      for (let i = 1; i < frames.length; i++) {
        const flux = Math.max(0, frames[i].energy - frames[i - 1].energy);
        fluxes.push({ time: frames[i].time, flux });
      }
      
      // Z-score 정규화
      const mean = fluxes.reduce((sum, f) => sum + f.flux, 0) / fluxes.length;
      const variance = fluxes.reduce((sum, f) => sum + Math.pow(f.flux - mean, 2), 0) / fluxes.length;
      const stdDev = Math.sqrt(variance);
      
      const normalized = fluxes.map(f => ({
        time: f.time,
        zScore: stdDev > 0 ? (f.flux - mean) / stdDev : 0
      }));
      
      // 온셋 감지: z-score > threshold, local maxima, minimum gap
      const onsets = [];
      for (let i = 1; i < normalized.length - 1; i++) {
        const curr = normalized[i];
        const prev = normalized[i - 1];
        const next = normalized[i + 1];
        
        // Local maxima and above threshold
        if (curr.zScore > Z_THRESHOLD && 
            curr.zScore > prev.zScore && 
            curr.zScore > next.zScore) {
          
          // Check minimum gap
          if (onsets.length === 0 || 
              (curr.time - onsets[onsets.length - 1]) >= ONSET_MIN_GAP_MS) {
            onsets.push(curr.time);
          }
        }
      }
      
      // 퀀타이제이션 적용
      const beatDuration = (60 / bpm) * 1000;
      const eighthNoteDuration = beatDuration / 2;
      
      const quantizedOnsets = onsets.map(time => {
        if (quantizeMode === 'soft') {
          const nearestEighth = Math.round(time / eighthNoteDuration) * eighthNoteDuration;
          const diff = nearestEighth - time;
          return Math.abs(diff) <= SOFT_SNAP_MS ? nearestEighth : time;
        } else if (quantizeMode === 'hard') {
          return Math.round(time / eighthNoteDuration) * eighthNoteDuration;
        }
        return time;
      });
      
      this.timingSource = 'vocal';
      console.log(`✓ Detected ${quantizedOnsets.length} vocal onsets (${quantizeMode} quantize)`);
      
      return quantizedOnsets;
      
    } catch (error) {
      console.error('Vocal onset detection failed:', error);
      return [];
    }
  }

  /**
   * 온셋 시간을 노트로 변환 (Convert onset times to notes)
   * 
   * @param {number[]} onsetTimes - 온셋 시간 배열 (ms)
   * @returns {Array<{timeMs: number, lane: number}>} 노트 배열
   */
  convertOnsetsToNotes(onsetTimes) {
    const notes = [];
    let laneIndex = 0;
    let consecutiveCount = 0;
    let lastLane = -1;
    
    for (const time of onsetTimes) {
      // 레인 할당 (deterministic round-robin with mirroring)
      let lane = laneIndex % 4;
      
      // 같은 레인이 3번 연속이면 미러링
      if (lane === lastLane) {
        consecutiveCount++;
        if (consecutiveCount >= 2) {
          // 미러링: 0↔3, 1↔2
          lane = 3 - lane;
          consecutiveCount = 0;
        }
      } else {
        consecutiveCount = 0;
      }
      
      notes.push({
        timeMs: Math.round(time),
        lane: lane
      });
      
      lastLane = lane;
      laneIndex++;
    }
    
    return notes;
  }

  /**
   * 타이밍 소스 가져오기
   * 
   * @returns {string} 'lrc', 'vocal', or 'none'
   */
  getTimingSource() {
    return this.timingSource;
  }

  /**
   * 타이밍 소스 한글 이름
   * 
   * @returns {string} 타이밍 소스 표시명
   */
  getTimingSourceDisplay() {
    switch (this.timingSource) {
      case 'lrc':
        return 'LRC (Lyrics)';
      case 'vocal':
        return 'Vocal Onset Detection';
      default:
        return 'Manual/BPM';
    }
  }
}
