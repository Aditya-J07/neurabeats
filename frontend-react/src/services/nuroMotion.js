/**
 * NuroMotion & NuroSync Engines for Nuro-Beats
 * Implements deterministic movement event detection, rhythmic synchronization,
 * and adaptive tempo control as defined in ARCHITECTURE.md and PRD.md.
 */

import { NuroMotion as CoreNuroMotion } from '../features/neuromotion/core/NuroMotion';

export class NuroMotion {
  constructor(onStepEvent) {
    this.onStepEvent = onStepEvent;
    this.core = new CoreNuroMotion();
    this.isTracking = false;
    this.isDemoMode = false;
    this.videoElement = null;

    this.core.onMovementEvent((ev) => {
      if (this.onStepEvent) {
        this.onStepEvent(ev);
      }
    });
  }

  async startCamera(videoElement, targetBpm = 54) {
    this.videoElement = videoElement;
    this.isTracking = true;
    this.isDemoMode = false;

    const ok = await this.core.start({
      videoElement,
      targetBpm,
      useMic: true,
    });

    if (!ok) {
      this.startDemoMode(targetBpm);
    }
  }

  startDemoMode(targetBpm = 54) {
    this.isTracking = true;
    this.isDemoMode = true;
    this.core.startDemo(targetBpm);
  }

  stop() {
    this.isTracking = false;
    this.core.stop();
  }

  pause() {
    this.core.pause();
  }

  resume() {
    this.core.resume();
  }

  registerBeat(timestamp) {
    this.core.registerBeat(timestamp);
  }
}


export class NuroSync {
  constructor(toleranceMs = 250) {
    this.toleranceMs = toleranceMs;
    this.beatTimestamps = [];
    this.errorHistory = []; // list of timing errors in ms
  }

  recordBeat(timestamp) {
    this.beatTimestamps.push(timestamp);
    // Keep only recent 20 beats
    if (this.beatTimestamps.length > 20) {
      this.beatTimestamps.shift();
    }
  }

  evaluateStep(stepTimestamp) {
    if (this.beatTimestamps.length === 0) {
      return { timingErrorMs: 0, syncScore: 85, isSynchronized: true };
    }

    // Find nearest beat timestamp
    let minDiff = Infinity;
    for (const bTime of this.beatTimestamps) {
      const diff = Math.abs(stepTimestamp - bTime);
      if (diff < minDiff) {
        minDiff = diff;
      }
    }

    const timingErrorMs = Math.round(minDiff * 1000);
    this.errorHistory.push(timingErrorMs);
    if (this.errorHistory.length > 30) this.errorHistory.shift();

    // Deterministic sync score formula
    // Error 0ms -> 100%, Error = toleranceMs -> 0%
    const score = Math.max(0, Math.min(100, Math.round(100 * (1 - timingErrorMs / this.toleranceMs))));
    const isSynchronized = timingErrorMs <= this.toleranceMs;

    return {
      timingErrorMs,
      syncScore: score,
      isSynchronized
    };
  }

  getAverageSync() {
    if (this.errorHistory.length === 0) return 92;
    const avgError = this.errorHistory.reduce((a, b) => a + b, 0) / this.errorHistory.length;
    return Math.max(0, Math.min(100, Math.round(100 * (1 - avgError / this.toleranceMs))));
  }
}

export class AdaptationEngine {
  constructor(minSafeBpm = 45, maxSafeBpm = 72) {
    this.minSafeBpm = minSafeBpm;
    this.maxSafeBpm = maxSafeBpm;
    this.consecutiveHigh = 0;
    this.consecutiveLow = 0;
  }

  updateSafetyLimits(minBpm, maxBpm) {
    this.minSafeBpm = minBpm;
    this.maxSafeBpm = maxBpm;
  }

  evaluateAdaptation(currentBpm, recentSyncScores, lastStepIntervalSec = 1.0) {
    if (recentSyncScores.length < 3) {
      return { adapted: false, newBpm: currentBpm, reason: "Collecting initial rhythm telemetry" };
    }

    const recent3 = recentSyncScores.slice(-3);
    const avgSync = recent3.reduce((a, b) => a + b, 0) / recent3.length;

    // Freezing of Gait check (excessive step lag > 3.5s)
    if (lastStepIntervalSec > 3.5) {
      const protectedBpm = Math.max(this.minSafeBpm, currentBpm - 2);
      return {
        adapted: true,
        newBpm: protectedBpm,
        isFreezing: true,
        reason: `Freezing episode detected (${lastStepIntervalSec.toFixed(1)}s delay). Eased tempo to safe floor.`
      };
    }

    // High Synchronization (>88%): gently increase tempo towards therapeutic target
    if (avgSync >= 88) {
      this.consecutiveHigh += 1;
      this.consecutiveLow = 0;

      if (this.consecutiveHigh >= 4) {
        this.consecutiveHigh = 0;
        if (currentBpm < this.maxSafeBpm) {
          const nextBpm = currentBpm + 1;
          return {
            adapted: true,
            newBpm: nextBpm,
            reason: `High synchronization (${Math.round(avgSync)}%). Lifting tempo +1 BPM (Doctor ceiling: ${this.maxSafeBpm} BPM).`
          };
        }
      }
    } 
    // Low Synchronization (<75%): fatigue protection, gently ease tempo down
    else if (avgSync < 75) {
      this.consecutiveLow += 1;
      this.consecutiveHigh = 0;

      if (this.consecutiveLow >= 3) {
        this.consecutiveLow = 0;
        if (currentBpm > this.minSafeBpm) {
          const nextBpm = currentBpm - 1;
          return {
            adapted: true,
            newBpm: nextBpm,
            reason: `Sync dropped to ${Math.round(avgSync)}%. Easing tempo -1 BPM for joint and fatigue safety.`
          };
        }
      }
    } else {
      this.consecutiveHigh = 0;
      this.consecutiveLow = 0;
    }

    return { adapted: false, newBpm: currentBpm, reason: "Steady cadence in harmony with rhythm" };
  }
}
