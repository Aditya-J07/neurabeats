import { describe, it, expect, beforeEach } from 'vitest';
import {
  PhaseIntelligence,
  CircularPhaseResolver,
  PhaseStateMachine,
  MultiSignalCycleDetector,
  PersonalMovementBaseline,
} from '../core/PhaseIntelligence';

describe('P4 Continuous Phase Intelligence Tests (Section 44 & 45)', () => {
  let engine;

  beforeEach(() => {
    engine = new PhaseIntelligence();
  });

  it('handles circular phase wrap-around without negative discontinuity', () => {
    const thetaBefore = 0.99 * 2.0 * Math.PI;
    const thetaAfter = 0.02 * 2.0 * Math.PI;
    const diff = CircularPhaseResolver.circularDifference(thetaAfter, thetaBefore);
    const normStep = diff / (2.0 * Math.PI);

    expect(normStep).toBeCloseTo(0.03, 2);
    expect(diff).toBeGreaterThan(0);
  });

  it('calculates true circular distance on unit circle', () => {
    const theta1 = 0.1 * Math.PI;
    const theta2 = 1.9 * Math.PI;
    const dist = CircularPhaseResolver.circularDistance(theta1, theta2);
    expect(dist).toBeCloseTo(0.2 * Math.PI, 3);
  });

  it('interpolates circularly across 0/1 boundary', () => {
    const thetaA = 1.95 * Math.PI;
    const thetaB = 0.05 * Math.PI;
    const interp = CircularPhaseResolver.circularInterpolate(thetaA, thetaB, 0.5);
    expect(Math.abs(interp)).toBeCloseTo(0.0, 2);
  });

  it('enforces minimum dwell time and state hysteresis', () => {
    const sm = new PhaseStateMachine(3);
    sm.update('RISING', 0.10, 4.0, 0.9);
    sm.update('RISING', 0.12, 4.0, 0.9);
    sm.update('RISING', 0.14, 4.0, 0.9);
    expect(sm.currentState).toBe('RISING');

    // 1-frame noisy glitch must not trigger switch
    const noisyState = sm.update('FALLING', 0.15, 4.0, 0.9);
    expect(noisyState).toBe('RISING');
  });

  it('detects cycles based on wrap, velocity and refractory period', () => {
    const cd = new MultiSignalCycleDetector();
    const t = 1000.0;
    const bpm = 60.0;

    cd.update(0.70, 6.28, t, bpm, 0.9);
    cd.update(0.85, 6.28, t + 100, bpm, 0.9);
    cd.update(0.95, 6.28, t + 200, bpm, 0.9);

    const res = cd.update(0.05, 6.28, t + 600, bpm, 0.9);
    expect(res.cycleCompleted).toBe(true);
    expect(res.cycleIndex).toBe(1);
    expect(res.cycleProgress).toBeCloseTo(0.05, 2);
  });

  it('updates personal baseline from confident cycles only', () => {
    const base = new PersonalMovementBaseline(0.05);
    expect(base.available).toBe(false);

    base.updateFromCycle(850.0, 6.28, 0.5, 0.9, 0.85);
    expect(base.available).toBe(true);
    expect(base.cycleDurationMs).toBeCloseTo(850.0, 1);

    // Corrupted low confidence cycle
    base.updateFromCycle(100.0, 25.0, 0.1, 0.2, 0.30);
    expect(base.cycleDurationMs).toBeCloseTo(850.0, 1);
  });

  it('rejects stale or duplicate frames monotonically', () => {
    const obs1 = {
      frameId: 10,
      captureTimestampMs: 1000.0,
      deltaTimeMs: 33.3,
      isNewPoseResult: true,
      landmarkConfidence: 0.95
    };
    const out1 = engine.processObservation(obs1);
    expect(out1).not.toBeNull();

    // Duplicate frameId
    const obsDup = {
      frameId: 10,
      captureTimestampMs: 1033.3,
      deltaTimeMs: 33.3,
      isNewPoseResult: true,
      landmarkConfidence: 0.95
    };
    const out2 = engine.processObservation(obsDup);
    expect(out2).toBe(out1); // Reuses latest output without recomputation
  });

  it('gracefully handles missing frames and outliers', () => {
    // Normal frame
    const obsNormal = {
      frameId: 1,
      captureTimestampMs: 1000.0,
      deltaTimeMs: 33.3,
      isNewPoseResult: true,
      landmarks: Array(33).fill({ x: 0.5, y: 0.5 }),
      landmarkConfidence: 0.95
    };
    const out1 = engine.processObservation(obsNormal);
    expect(out1.dataQuality.gapDetected).toBe(false);

    // Frame with gap > 60ms
    const obsGap = {
      frameId: 2,
      captureTimestampMs: 1120.0,
      deltaTimeMs: 120.0,
      isNewPoseResult: true,
      landmarks: Array(33).fill({ x: 0.5, y: 0.5 }),
      landmarkConfidence: 0.95
    };
    const out2 = engine.processObservation(obsGap);
    expect(out2.dataQuality.gapDetected).toBe(true);
  });
});
