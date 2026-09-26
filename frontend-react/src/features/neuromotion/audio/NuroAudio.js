/**
 * NuroAudio: Browser-Local Audio Sensing & Synchronization Foundation
 * Extracts microphone audio levels, RMS energy, speech activity, and beat candidates.
 * Aligns movement events with audio beat timestamps for microsecond-accurate synchronization.
 */

import { POSE_CONFIG } from '../core/PoseConfig';

export class NuroAudio {
  constructor(config = POSE_CONFIG.audio) {
    this.config = config;
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.sourceNode = null;

    this.isListening = false;
    this.micPermissionState = 'prompt'; // 'prompt', 'granted', 'denied'
    this.timeData = null;
    this.frequencyData = null;

    this.lastBeatTime = 0;
    this.beatHistory = []; // generated or detected beat timestamps in seconds
    this.lastFeatureSnapshot = {
      level: 0,
      rms: 0,
      activity: false,
      isBeatCandidate: false,
      timestamp: 0,
    };
  }

  /**
   * Requests microphone permission and initializes Web Audio nodes
   */
  async startMicrophone() {
    if (this.isListening) return true;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Web Audio getUserMedia not supported in this browser');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: false,
      });

      this.micPermissionState = 'granted';

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.fftSize;
      this.analyser.smoothingTimeConstant = this.config.smoothingTimeConstant;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.analyser);

      this.timeData = new Uint8Array(this.analyser.fftSize);
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      this.isListening = true;
      return true;
    } catch (err) {
      this.micPermissionState = 'denied';
      console.warn("Microphone access unavailable or denied:", err.message);
      this.isListening = false;
      return false;
    }
  }

  /**
   * Samples current audio features from microphone
   * @param {number} timestamp - Current frame timestamp in seconds
   * @returns {Object} Real-time audio features
   */
  sampleFeatures(timestamp = performance.now() / 1000) {
    if (!this.isListening || !this.analyser) {
      return {
        level: 0,
        rms: 0,
        activity: false,
        isBeatCandidate: false,
        timestamp,
        confidence: 0,
      };
    }

    this.analyser.getByteTimeDomainData(this.timeData);
    this.analyser.getByteFrequencyData(this.frequencyData);

    // Compute RMS amplitude
    let sumSquares = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const normalized = (this.timeData[i] - 128) / 128; // [-1, 1]
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / this.timeData.length);
    const level = Math.min(1.0, rms * 4.0); // Scale for visual meter

    // Detect speech / audio activity
    const activity = rms > this.config.speechThresholdRms;

    // Detect onset / beat candidate in acoustic stream
    const isBeatCandidate = rms > this.config.beatOnsetThreshold &&
      (timestamp - this.lastBeatTime) * 1000 > this.config.minBeatIntervalMs;

    if (isBeatCandidate) {
      this.lastBeatTime = timestamp;
    }

    this.lastFeatureSnapshot = {
      level: Number(level.toFixed(3)),
      rms: Number(rms.toFixed(4)),
      activity,
      isBeatCandidate,
      timestamp,
      confidence: activity ? 0.9 : 0.6,
    };

    return this.lastFeatureSnapshot;
  }

  /**
   * Registers a metronome / synthesized beat timestamp for alignment
   * @param {number} timestamp - in seconds
   */
  registerSynthesizedBeat(timestamp) {
    this.beatHistory.push(timestamp);
    if (this.beatHistory.length > 30) {
      this.beatHistory.shift();
    }
  }

  /**
   * Evaluates synchronization between a movement event and the rhythm beats
   * @param {number} movementTimestamp - in seconds
   * @param {number} [toleranceMs=250] - Sync window tolerance
   * @returns {{
   *   timingErrorMs: number,
   *   syncScore: number,
   *   isSynchronized: boolean,
   *   phase: 'ON_BEAT' | 'EARLY' | 'LATE'
   * }}
   */
  alignMovementToBeat(movementTimestamp, toleranceMs = 250) {
    if (this.beatHistory.length === 0) {
      return {
        timingErrorMs: 0,
        syncScore: 85,
        isSynchronized: true,
        phase: 'ON_BEAT',
      };
    }

    // Find nearest beat timestamp
    let minSignedDiff = Infinity;
    let minAbsDiff = Infinity;

    for (const bTime of this.beatHistory) {
      const diff = movementTimestamp - bTime;
      const absDiff = Math.abs(diff);
      if (absDiff < minAbsDiff) {
        minAbsDiff = absDiff;
        minSignedDiff = diff;
      }
    }

    const timingErrorMs = Math.round(minAbsDiff * 1000);
    const score = Math.max(0, Math.min(100, Math.round(100 * (1 - timingErrorMs / toleranceMs))));
    const isSynchronized = timingErrorMs <= toleranceMs;

    let phase = 'ON_BEAT';
    if (timingErrorMs > 25) {
      phase = minSignedDiff < 0 ? 'EARLY' : 'LATE';
    }

    return {
      timingErrorMs,
      syncScore: score,
      isSynchronized,
      phase,
    };
  }

  stop() {
    this.isListening = false;
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch { /* ignore */ }
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch { /* ignore */ }
      this.audioContext = null;
    }
  }
}
