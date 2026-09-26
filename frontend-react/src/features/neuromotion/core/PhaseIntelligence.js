/**
 * NURO-BEATS P4 — Continuous Phase Intelligence Engine (ES Module)
 * Client-Side Causal Perception Layer for React Applications
 */

export const P4_MODEL_VERSION = 'p4_tcn_v1.0';
export const DEFAULT_WINDOW_SIZE = 81;
export const FEATURE_DIM = 48;
export const MAX_EXPECTED_FRAME_GAP_MS = 60.0;
export const PHASE_STATES = ['IDLE', 'RISING', 'PEAK', 'FALLING', 'RECOVERY', 'UNKNOWN'];

export class CircularPhaseResolver {
  static wrapRadians(theta) {
    return Math.atan2(Math.sin(theta), Math.cos(theta));
  }

  static normalizePhase(theta) {
    const twoPi = 2.0 * Math.PI;
    const rem = theta % twoPi;
    return ((rem + twoPi) % twoPi) / twoPi;
  }

  static circularDistance(theta1, theta2) {
    return Math.abs(Math.atan2(Math.sin(theta1 - theta2), Math.cos(theta1 - theta2)));
  }

  static circularDifference(thetaCurr, thetaPrev) {
    return Math.atan2(Math.sin(thetaCurr - thetaPrev), Math.cos(thetaCurr - thetaPrev));
  }

  static circularInterpolate(thetaA, thetaB, alpha) {
    const diff = Math.atan2(Math.sin(thetaB - thetaA), Math.cos(thetaB - thetaA));
    return CircularPhaseResolver.wrapRadians(thetaA + alpha * diff);
  }
}

export class PhaseStateMachine {
  constructor(minDwellFrames = 3) {
    this.minDwellFrames = minDwellFrames;
    this.currentState = 'IDLE';
    this.dwellCounter = 0;
  }

  reset() {
    this.currentState = 'IDLE';
    this.dwellCounter = 0;
  }

  update(predictedState, phaseNormalized, phaseVelocity, confidence) {
    if (confidence < 0.25) return 'UNKNOWN';
    if (phaseVelocity < 0.2 && this.currentState === 'IDLE') return 'IDLE';

    let validated = predictedState;
    if (phaseNormalized >= 0.20 && phaseNormalized < 0.35 && phaseVelocity > 0) {
      validated = 'PEAK';
    } else if (phaseNormalized >= 0.35 && phaseNormalized < 0.70 && phaseVelocity > 0) {
      validated = 'FALLING';
    } else if (phaseNormalized >= 0.70 && phaseNormalized < 0.95 && phaseVelocity > 0) {
      validated = 'RECOVERY';
    } else if ((phaseNormalized >= 0.95 || phaseNormalized < 0.20) && phaseVelocity > 0) {
      validated = 'RISING';
    }

    if (validated === this.currentState) {
      this.dwellCounter++;
      return this.currentState;
    }

    if (this.dwellCounter >= this.minDwellFrames || this.currentState === 'IDLE' || this.currentState === 'UNKNOWN') {
      this.currentState = validated;
      this.dwellCounter = 1;
    } else {
      this.dwellCounter++;
    }

    return this.currentState;
  }
}

export class MultiSignalCycleDetector {
  constructor() {
    this.cycleCount = 0;
    this.lastCycleTimestamp = 0.0;
    this.lastPhase = 0.0;
    this.cycleDurations = [];
  }

  reset() {
    this.cycleCount = 0;
    this.lastCycleTimestamp = 0.0;
    this.lastPhase = 0.0;
    this.cycleDurations = [];
  }

  update(phaseNormalized, phaseVelocity, timestampMs, bpm, confidence) {
    let cycleCompleted = false;
    let durationMs = 0.0;
    const safeBpm = Math.max(30, Math.min(180, bpm || 60));
    const refractoryMs = (60000.0 / safeBpm) * 0.40;

    const wrapped = (this.lastPhase > 0.82 && phaseNormalized < 0.25);
    const timeSince = timestampMs - this.lastCycleTimestamp;

    if (wrapped && phaseVelocity > 0.3 && confidence >= 0.45 && timeSince >= refractoryMs) {
      this.cycleCount++;
      cycleCompleted = true;
      durationMs = this.lastCycleTimestamp > 0 ? timeSince : (60000.0 / safeBpm);
      this.lastCycleTimestamp = timestampMs;

      this.cycleDurations.push(durationMs);
      if (this.cycleDurations.length > 20) this.cycleDurations.shift();
    }

    this.lastPhase = phaseNormalized;
    return {
      cycleCompleted,
      cycleIndex: this.cycleCount,
      cycleProgress: phaseNormalized,
      durationMs
    };
  }
}

export class PersonalMovementBaseline {
  constructor(alpha = 0.05) {
    this.alpha = alpha;
    this.cycleDurationMs = 1000.0;
    this.meanPhaseVelocity = 6.28;
    this.meanRom = 0.45;
    this.meanQuality = 0.85;
    this.sampleCount = 0;
    this.available = false;
  }

  reset() {
    this.cycleDurationMs = 1000.0;
    this.meanPhaseVelocity = 6.28;
    this.meanRom = 0.45;
    this.meanQuality = 0.85;
    this.sampleCount = 0;
    this.available = false;
  }

  updateFromCycle(durationMs, avgVelocity, rom, quality, confidence) {
    if (confidence < 0.65 || durationMs < 300 || durationMs > 4000) return;

    if (!this.available) {
      this.cycleDurationMs = durationMs;
      this.meanPhaseVelocity = avgVelocity;
      this.meanRom = rom;
      this.meanQuality = quality;
      this.available = true;
      this.sampleCount = 1;
    } else {
      this.cycleDurationMs = (1.0 - this.alpha) * this.cycleDurationMs + this.alpha * durationMs;
      this.meanPhaseVelocity = (1.0 - this.alpha) * this.meanPhaseVelocity + this.alpha * avgVelocity;
      this.meanRom = (1.0 - this.alpha) * this.meanRom + this.alpha * rom;
      this.meanQuality = (1.0 - this.alpha) * this.meanQuality + this.alpha * quality;
      this.sampleCount++;
    }
  }

  computeDeviations(currentPhaseRad, expectedPhaseRad, currentDurationMs) {
    const phaseDev = CircularPhaseResolver.circularDistance(currentPhaseRad, expectedPhaseRad);
    const durationDev = this.available ? Math.abs(currentDurationMs - this.cycleDurationMs) : 0.0;
    return {
      phaseDeviation: Number(phaseDev.toFixed(4)),
      timingDeviationMs: Number(((phaseDev / (2.0 * Math.PI)) * this.cycleDurationMs).toFixed(1)),
      cycleDurationDeviationMs: Number(durationDev.toFixed(1))
    };
  }
}

export class PhaseIntelligence {
  constructor(windowSize = DEFAULT_WINDOW_SIZE) {
    this.windowSize = windowSize;
    this.featureBuffer = [];
    this.timestampBuffer = [];
    this.frameIdBuffer = [];

    this.latestAcceptedFrameId = -1;
    this.previousPhaseRadians = 0.0;
    this.previousTimestampSec = 0.0;

    this.stateMachine = new PhaseStateMachine(3);
    this.cycleDetector = new MultiSignalCycleDetector();
    this.baseline = new PersonalMovementBaseline(0.05);

    this.latenciesMs = [];
    this.fallbackCount = 0;
    this.gapCount = 0;
    this.latestOutput = null;
  }

  reset() {
    this.featureBuffer = [];
    this.timestampBuffer = [];
    this.frameIdBuffer = [];
    this.latestAcceptedFrameId = -1;
    this.previousPhaseRadians = 0.0;
    this.previousTimestampSec = 0.0;
    this.stateMachine.reset();
    this.cycleDetector.reset();
    this.baseline.reset();
    this.latestOutput = null;
  }

  extractKinematicFeatures(landmarks, dtSec, bodyScale, confidence) {
    if (!landmarks || landmarks.length < 33) {
      const f = new Array(FEATURE_DIM).fill(0);
      f[42] = confidence;
      return f;
    }

    const dt = Math.max(0.010, Math.min(0.200, dtSec));
    const scale = Math.max(0.20, bodyScale || 1.0);

    const lh = landmarks[23], rh = landmarks[24];
    const lk = landmarks[25], rk = landmarks[26];
    const la = landmarks[27], ra = landmarks[28];

    const px = ((lh.x || 0.5) + (rh.x || 0.5)) / 2.0;
    const py = ((lh.y || 0.5) + (rh.y || 0.5)) / 2.0;

    const lxKnee = ((lk.x || 0.5) - px) / scale;
    const lyKnee = ((lk.y || 0.5) - py) / scale;
    const rxKnee = ((rk.x || 0.5) - px) / scale;
    const ryKnee = ((rk.y || 0.5) - py) / scale;

    const lxAnkle = ((la.x || 0.5) - px) / scale;
    const lyAnkle = ((la.y || 0.5) - py) / scale;
    const rxAnkle = ((ra.x || 0.5) - px) / scale;
    const ryAnkle = ((ra.y || 0.5) - py) / scale;

    const prev = this.featureBuffer.length > 0 ? this.featureBuffer[this.featureBuffer.length - 1] : null;
    let vxLk = 0, vyLk = 0, vxRk = 0, vyRk = 0;
    let vxLa = 0, vyLa = 0, vxRa = 0, vyRa = 0;

    if (prev && prev.length >= 8) {
      vxLk = (lxKnee - prev[0]) / dt;
      vyLk = (lyKnee - prev[1]) / dt;
      vxRk = (rxKnee - prev[2]) / dt;
      vyRk = (ryKnee - prev[3]) / dt;
      vxLa = (lxAnkle - prev[4]) / dt;
      vyLa = (lyAnkle - prev[5]) / dt;
      vxRa = (rxAnkle - prev[6]) / dt;
      vyRa = (ryAnkle - prev[7]) / dt;
    }

    let axLk = 0, ayLk = 0, axRk = 0, ayRk = 0;
    let axLa = 0, ayLa = 0, axRa = 0, ayRa = 0;

    if (prev && prev.length >= 16) {
      axLk = (vxLk - prev[8]) / dt;
      ayLk = (vyLk - prev[9]) / dt;
      axRk = (vxRk - prev[10]) / dt;
      ayRk = (vyRk - prev[11]) / dt;
      axLa = (vxLa - prev[12]) / dt;
      ayLa = (vyLa - prev[13]) / dt;
      axRa = (vxRa - prev[14]) / dt;
      ayRa = (vyRa - prev[15]) / dt;
    }

    const leftKneeFlex = Math.atan2(lyAnkle - lyKnee, lxAnkle - lxKnee);
    const rightKneeFlex = Math.atan2(ryAnkle - ryKnee, rxAnkle - rxKnee);
    const kineticEnergy = 0.5 * (vyLk * vyLk + vyRk * vyRk + vyLa * vyLa + vyRa * vyRa);

    return [
      // 0..7: Key joint positions
      lxKnee, lyKnee, rxKnee, ryKnee, lxAnkle, lyAnkle, rxAnkle, ryAnkle,
      // 8..15: Velocities
      vxLk, vyLk, vxRk, vyRk, vxLa, vyLa, vxRa, vyRa,
      // 16..23: Accelerations
      axLk, ayLk, axRk, ayRk, axLa, ayLa, axRa, ayRa,
      // 24..29: Angles & angular velocities
      leftKneeFlex, rightKneeFlex, vyLk * 1.5, vyRk * 1.5, 1.0, 1.0,
      // 30..35: Bilateral symmetry & scale
      Math.abs(lyKnee - ryKnee), scale, 0, 0, 0, 0,
      // 36..41: Motion energy & global dynamics
      Math.abs(vyLk) + Math.abs(vyRk), kineticEnergy, Math.abs(ayLk) + Math.abs(ayRk), 0, 0, 0,
      // 42..47: Landmark confidences
      confidence, confidence, confidence, confidence, confidence, confidence
    ];
  }

  processObservation(obs) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (obs.frameId <= this.latestAcceptedFrameId && this.latestAcceptedFrameId !== -1) {
      return this.latestOutput;
    }

    if (!obs.isNewPoseResult) {
      return this.latestOutput;
    }

    this.latestAcceptedFrameId = obs.frameId;
    const dtSec = obs.deltaTimeMs > 0 ? obs.deltaTimeMs / 1000.0 : (1.0 / 30.0);
    const gapDetected = obs.deltaTimeMs > MAX_EXPECTED_FRAME_GAP_MS;
    if (gapDetected) this.gapCount++;

    const feat = this.extractKinematicFeatures(obs.landmarks, dtSec, obs.bodyScale, obs.landmarkConfidence);
    this.featureBuffer.push(feat);
    this.timestampBuffer.push(obs.captureTimestampMs);
    this.frameIdBuffer.push(obs.frameId);

    while (this.featureBuffer.length > this.windowSize) {
      this.featureBuffer.shift();
      this.timestampBuffer.shift();
      this.frameIdBuffer.shift();
    }

    this.fallbackCount++;
    const disp = feat[5] || 0.0;
    const vel = feat[13] || 0.0;
    const safeBpm = Math.max(30, Math.min(180, obs.bpm || 60));
    const omega0 = (2.0 * Math.PI) / (60.0 / safeBpm);

    const rawPhaseRad = Math.atan2(vel / Math.max(0.5, omega0), disp);
    const predictedState = vel > 0.05 ? 'RISING' : (vel < -0.05 ? 'FALLING' : 'PEAK');
    const modelQuality = Math.max(0.5, Math.min(0.95, 1.0 - Math.abs(disp) * 0.2));
    const modelConf = 0.85;

    const phaseSin = Math.sin(rawPhaseRad);
    const phaseCos = Math.cos(rawPhaseRad);

    let phaseVelocity = (2.0 * Math.PI) / (60.0 / safeBpm);
    if (this.previousTimestampSec > 0) {
      const actualDt = Math.max(0.010, (obs.captureTimestampMs / 1000.0) - this.previousTimestampSec);
      const deltaTheta = CircularPhaseResolver.circularDifference(rawPhaseRad, this.previousPhaseRadians);
      phaseVelocity = deltaTheta / actualDt;
    }

    const alpha = obs.landmarkConfidence > 0.8 ? 0.85 : 0.55;
    const stabilizedRadians = CircularPhaseResolver.circularInterpolate(this.previousPhaseRadians, rawPhaseRad, alpha);
    const normalizedPhase = CircularPhaseResolver.normalizePhase(stabilizedRadians);

    this.previousPhaseRadians = stabilizedRadians;
    this.previousTimestampSec = obs.captureTimestampMs / 1000.0;

    const historyRatio = Math.min(1.0, this.featureBuffer.length / 10.0);
    const temporalContinuity = (gapDetected ? 0.4 : 1.0) * historyRatio;
    const velConsistency = Math.max(0.0, Math.min(1.0, 1.0 - Math.abs(phaseVelocity - (2.0 * Math.PI / safeBpm)) / 6.0));
    const cycleContrib = this.cycleDetector.cycleCount > 0 ? 1.0 : 0.2;

    const scaledModelConf = modelConf * Math.min(1.0, obs.landmarkConfidence * 1.2);
    let phaseConfidence = (
      0.30 * obs.landmarkConfidence +
      0.25 * scaledModelConf +
      0.20 * (temporalContinuity * Math.min(1.0, obs.landmarkConfidence * 1.5)) +
      0.15 * (velConsistency * Math.min(1.0, obs.landmarkConfidence * 1.5)) +
      0.10 * (cycleContrib * Math.min(1.0, obs.landmarkConfidence * 1.5))
    );
    phaseConfidence = Math.max(0.0, Math.min(1.0, phaseConfidence));

    const finalState = this.stateMachine.update(predictedState, normalizedPhase, phaseVelocity, phaseConfidence);
    const cycleInfo = this.cycleDetector.update(normalizedPhase, phaseVelocity, obs.captureTimestampMs, obs.bpm, phaseConfidence);

    if (cycleInfo.cycleCompleted) {
      this.baseline.updateFromCycle(cycleInfo.durationMs, Math.abs(phaseVelocity), 0.45, modelQuality, phaseConfidence);
    }

    const deviations = this.baseline.computeDeviations(
      stabilizedRadians,
      ((obs.captureTimestampMs / 1000.0) * (2.0 * Math.PI / safeBpm)) % (2.0 * Math.PI),
      cycleInfo.durationMs
    );

    const latencyMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    this.latenciesMs.push(latencyMs);
    if (this.latenciesMs.length > 120) this.latenciesMs.shift();

    this.latestOutput = {
      version: 'p4.1',
      modelVersion: P4_MODEL_VERSION,
      source: 'FALLBACK',
      provider: 'BROWSER_JS',
      timestamp: obs.captureTimestampMs,
      frameId: obs.frameId,
      latencyMs: Number(latencyMs.toFixed(2)),
      motion: {
        embedding: feat.slice(0, 8),
        quality: Number(modelQuality.toFixed(3)),
        confidence: Number(modelConf.toFixed(3))
      },
      phase: {
        normalized: Number(normalizedPhase.toFixed(3)),
        radians: Number(stabilizedRadians.toFixed(4)),
        sin: Number(phaseSin.toFixed(4)),
        cos: Number(phaseCos.toFixed(4)),
        velocity: Number(phaseVelocity.toFixed(2)),
        confidence: Number(phaseConfidence.toFixed(3)),
        state: finalState
      },
      cycle: {
        index: cycleInfo.cycleIndex,
        progress: Number(cycleInfo.cycleProgress.toFixed(3)),
        durationMs: Number(cycleInfo.durationMs.toFixed(1)),
        deviationMs: deviations.timingDeviationMs,
        confidence: Number(phaseConfidence.toFixed(3))
      },
      personalBaseline: {
        available: this.baseline.available,
        confidence: Number(Math.min(1.0, this.baseline.sampleCount / 5.0).toFixed(2)),
        meanDurationMs: Number(this.baseline.cycleDurationMs.toFixed(1)),
        phaseDeviation: deviations.phaseDeviation
      },
      dataQuality: {
        poseConfidence: Number(obs.landmarkConfidence.toFixed(3)),
        temporalContinuity: Number(temporalContinuity.toFixed(3)),
        gapDetected: gapDetected,
        observationAgeMs: Number(obs.deltaTimeMs.toFixed(1))
      }
    };

    return this.latestOutput;
  }
}
