import { describe, it, expect, beforeEach } from 'vitest';
import {
  MovementIntelligence,
  PhaseIntelligence,
  AdaptiveEngine,
  NuroAgent
} from '../index.js';

describe('P0 -> P1 -> P4 -> P2 -> P3 Pipeline Integration Test', () => {
  let p1;
  let p4;
  let p2;
  let p3;

  beforeEach(() => {
    p1 = new MovementIntelligence();
    p4 = new PhaseIntelligence();
    p2 = new AdaptiveEngine({
      minEvaluationIntervalSec: 0.1,
      cooldownSeconds: 2.0
    });
    p3 = new NuroAgent({
      evaluationWindowSeconds: 0.1,
      baselineWindowsRequired: 2
    });
  });

  it('runs complete multi-layer perception chain synchronously without data distortion', () => {
    const fps = 30.0;
    const dtSec = 1.0 / fps;
    const totalFrames = 60; // 2 seconds of periodic gait motion
    const bpm = 60;
    const omega = 2 * Math.PI * (bpm / 60);

    let lastP4State = null;
    let lastAdaptiveState = null;
    let lastAgentState = null;

    for (let frameId = 1; frameId <= totalFrames; frameId++) {
      const timeSec = frameId * dtSec;
      const captureMs = timeSec * 1000.0;

      // Simulated periodic lower limb landmark kinematics
      const theta = omega * timeSec;
      const kneeY = 0.5 + 0.15 * Math.sin(theta);
      const ankleY = 0.8 + 0.20 * Math.sin(theta);

      const landmarks = Array.from({ length: 33 }, (_, idx) => {
        if (idx === 23) return { x: 0.45, y: 0.4, visibility: 0.95 }; // Left hip
        if (idx === 24) return { x: 0.55, y: 0.4, visibility: 0.95 }; // Right hip
        if (idx === 25) return { x: 0.45, y: kneeY, visibility: 0.95 }; // Left knee
        if (idx === 26) return { x: 0.55, y: 0.5, visibility: 0.95 }; // Right knee
        if (idx === 27) return { x: 0.45, y: ankleY, visibility: 0.95 }; // Left ankle
        if (idx === 28) return { x: 0.55, y: 0.8, visibility: 0.95 }; // Right ankle
        return { x: 0.5, y: 0.5, visibility: 0.95 };
      });

      // Layer P1: Deterministic Movement Intelligence
      const miState = p1.processFrame(landmarks, 25.0, timeSec, null, frameId);
      expect(miState).toBeDefined();
      expect(miState.movement).toBeDefined();

      // Layer P4: Learned Temporal Motion Intelligence
      const p4Observation = {
        frameId,
        captureTimestampMs: captureMs,
        deltaTimeMs: dtSec * 1000.0,
        landmarks,
        landmarkConfidence: miState.confidence || 0.9,
        bodyScale: 0.8,
        movementState: miState.state || 'ACTIVE',
        bpm,
        isNewPoseResult: true
      };

      const p4State = p4.processObservation(p4Observation);
      expect(p4State).toBeDefined();
      expect(p4State.phase).toBeDefined();
      expect(p4State.phase.normalized).toBeGreaterThanOrEqual(0.0);
      expect(p4State.phase.normalized).toBeLessThan(1.0);
      expect(Number.isFinite(p4State.phase.velocity)).toBe(true);

      // Attach P4 to canonical movement state
      miState.temporal = p4State;
      lastP4State = p4State;

      // Layer P2: Adaptive Difficulty Engine
      if (frameId % 3 === 0) {
        lastAdaptiveState = p2.evaluate(miState, bpm, timeSec);
        expect(lastAdaptiveState).toBeDefined();
        expect(lastAdaptiveState.adaptation).toBeDefined();
      }

      // Layer P3: Nuro Reasoning Agent
      if (frameId % 6 === 0 && lastAdaptiveState) {
        lastAgentState = p3.observe(miState, lastAdaptiveState, timeSec);
        expect(lastAgentState).toBeDefined();
        expect(lastAgentState.mode).toBeDefined();
      }
    }

    // Pipeline assertions
    expect(lastP4State).not.toBeNull();
    expect(lastP4State.version).toBe('p4.1');
    expect(lastP4State.cycle.index).toBeGreaterThanOrEqual(1); // Detected completed cycles
    expect(lastAdaptiveState).not.toBeNull();
    expect(lastAgentState).not.toBeNull();

    // Verify session reset propagates cleanly through all layers
    p1.reset();
    p4.reset();
    p2.reset();
    p3.reset();

    expect(p4.latestAcceptedFrameId).toBe(-1);
    expect(p4.featureBuffer.length).toBe(0);
    expect(p4.baseline.available).toBe(false);
  });
});
