import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveEngine, ADAPTIVE_ENGINE_CONFIG } from '../core/AdaptiveEngine.js';

describe('AdaptiveEngine (P2 Specification Suite)', () => {
  let engine;

  beforeEach(() => {
    engine = new AdaptiveEngine({
      minEvaluationIntervalSec: 0.1, // Fast intervals for testing
      cooldownSeconds: 5.0,
      baselineWindowCount: 3,
      consecutiveGoodRequired: 3,
      consecutivePoorRequired: 2,
      progressThreshold: 0.82,
      regressThreshold: 0.58
    });
  });

  const createMockMovementState = (overrides = {}) => ({
    timestamp: Date.now(),
    state: overrides.state || 'ACTIVE',
    movement: {
      rom: overrides.rom ?? 0.85,
      velocity: overrides.velocity ?? 0.65,
      smoothness: overrides.smoothness ?? 0.88,
      symmetry: overrides.symmetry ?? 0.92,
      consistency: overrides.consistency ?? 0.86,
      quality: overrides.quality ?? 0.88
    },
    rhythm: {
      sync: overrides.sync ?? 0.90,
      timingErrorMs: overrides.timingErrorMs ?? 45,
      missedBeats: overrides.missedBeats ?? 0,
      averageErrorMs: 50,
      timingVariance: 100,
      successfulBeats: 10
    },
    confidence: overrides.confidence ?? 0.92
  });

  // TEST 1: High movement + high rhythm + high confidence -> PROGRESS
  it('TEST 1: triggers PROGRESS after required consecutive high-performance windows', () => {
    const highState = createMockMovementState({ quality: 0.90, sync: 0.92, confidence: 0.95 });
    
    // First 3 windows establish baseline
    engine.evaluate(highState, 60, 1.0);
    engine.evaluate(highState, 60, 2.0);
    const w3 = engine.evaluate(highState, 60, 3.0);
    expect(w3.adaptation.direction).toBe('MAINTAIN');

    // Windows 4 and 5 count towards consecutive good windows
    const w4 = engine.evaluate(highState, 60, 4.0);
    expect(w4.adaptation.direction).toBe('MAINTAIN');

    // Window 5 achieves 3rd consecutive good window -> PROGRESS
    const w5 = engine.evaluate(highState, 60, 5.0);
    expect(w5.adaptation.direction).toBe('PROGRESS');
    expect(w5.adaptation.parameter).toBe('TEMPO');
    expect(w5.tempo).toBe(63); // 60 + 3
    expect(w5.difficulty).toBeGreaterThan(0.50);
  });

  // TEST 2: Stable middle-range performance -> MAINTAIN
  it('TEST 2: MAINTAINs challenge when performance is in dead zone (0.58 - 0.82)', () => {
    const midState = createMockMovementState({ quality: 0.70, sync: 0.72, confidence: 0.80 });
    
    for (let t = 1; t <= 8; t++) {
      const state = engine.evaluate(midState, 60, t * 1.0);
      expect(state.adaptation.direction).toBe('MAINTAIN');
      expect(state.tempo).toBe(60);
    }
  });

  // TEST 3: Declining performance -> REGRESS
  it('TEST 3: triggers REGRESS after consecutive poor-performance windows', () => {
    // Establish mid baseline first
    const midState = createMockMovementState({ quality: 0.70, sync: 0.70, confidence: 0.85 });
    engine.evaluate(midState, 70, 1.0);
    engine.evaluate(midState, 70, 2.0);
    engine.evaluate(midState, 70, 3.0);

    // Now introduce poor performance (struggling / fatigue)
    const poorState = createMockMovementState({ quality: 0.40, sync: 0.45, confidence: 0.80 });
    
    // Window 4: First poor window
    const w4 = engine.evaluate(poorState, 70, 4.0);
    expect(w4.adaptation.direction).toBe('MAINTAIN');

    // Window 5: Second consecutive poor window -> REGRESS
    const w5 = engine.evaluate(poorState, 70, 5.0);
    expect(w5.adaptation.direction).toBe('REGRESS');
    expect(w5.adaptation.parameter).toBe('TEMPO');
    expect(w5.tempo).toBe(67); // 70 - 3
    expect(w5.difficulty).toBeLessThan(0.50);
  });

  // TEST 4: Low tracking confidence -> FREEZE
  it('TEST 4: FREEZEs adaptation when tracking confidence is low', () => {
    const lowConfState = createMockMovementState({
      quality: 0.85,
      sync: 0.90,
      confidence: 0.30,
      state: 'LOW_CONFIDENCE'
    });

    const state = engine.evaluate(lowConfState, 60, 1.0);
    expect(state.adaptation.direction).toBe('FREEZE');
    expect(state.adaptation.parameter).toBe('NONE');
    expect(state.performance.trend).toBe('LOW_CONFIDENCE');
    expect(state.reason).toContain('Tracking confidence is insufficient');
    expect(state.tempo).toBe(60);
  });

  // TEST 5: Single bad frame -> NO immediate regression
  it('TEST 5: does NOT immediately regress on a single bad frame', () => {
    const goodState = createMockMovementState({ quality: 0.75, sync: 0.75, confidence: 0.85 });
    for (let t = 1; t <= 5; t++) {
      engine.evaluate(goodState, 60, t * 1.0);
    }

    // Single sudden bad frame (e.g. temporary stumble or noise)
    const badState = createMockMovementState({ quality: 0.20, sync: 0.20, confidence: 0.80 });
    const result = engine.evaluate(badState, 60, 6.0);

    expect(result.adaptation.direction).toBe('MAINTAIN');
    expect(result.tempo).toBe(60);
  });

  // TEST 6: Single excellent frame -> NO immediate progression
  it('TEST 6: does NOT immediately progress on a single excellent frame', () => {
    const midState = createMockMovementState({ quality: 0.65, sync: 0.65, confidence: 0.80 });
    for (let t = 1; t <= 5; t++) {
      engine.evaluate(midState, 60, t * 1.0);
    }

    // Single outlier spike
    const spikeState = createMockMovementState({ quality: 0.98, sync: 0.98, confidence: 0.95 });
    const result = engine.evaluate(spikeState, 60, 6.0);

    expect(result.adaptation.direction).toBe('MAINTAIN');
    expect(result.tempo).toBe(60);
  });

  // TEST 7: Repeated high performance -> difficulty increases gradually
  it('TEST 7: increases difficulty gradually across repeated progression cycles', () => {
    const highState = createMockMovementState({ quality: 0.92, sync: 0.95, confidence: 0.95 });

    let t = 1.0;
    // Window 1-3 baseline
    for (; t <= 3.0; t += 1.0) engine.evaluate(highState, 60, t);

    // Cycle 1: Windows 4-5 -> Progress
    engine.evaluate(highState, 60, 4.0);
    const cycle1 = engine.evaluate(highState, 60, 5.0);
    expect(cycle1.adaptation.direction).toBe('PROGRESS');
    const diff1 = cycle1.difficulty;

    // Advance beyond cooldown (cooldownSeconds = 5.0, so wait until t = 11.0)
    t = 11.0;
    engine.evaluate(highState, cycle1.tempo, t); // Window 1
    engine.evaluate(highState, cycle1.tempo, t + 1.0); // Window 2
    const cycle2 = engine.evaluate(highState, cycle1.tempo, t + 2.0); // Window 3 -> Progress again

    expect(cycle2.adaptation.direction).toBe('PROGRESS');
    expect(cycle2.difficulty).toBeGreaterThan(diff1);
    expect(cycle2.difficulty - diff1).toBeLessThanOrEqual(ADAPTIVE_ENGINE_CONFIG.maxAdaptationStep + 0.01);
  });

  // TEST 8: Repeated low performance -> difficulty decreases gradually
  it('TEST 8: decreases difficulty gradually across repeated regression cycles', () => {
    // Start at elevated difficulty
    engine.difficulty = 0.70;
    engine.tempoDifficulty = 0.70;
    engine.movementDifficulty = 0.70;
    engine.targetBpm = 80;

    const midState = createMockMovementState({ quality: 0.70, sync: 0.70, confidence: 0.85 });
    for (let t = 1.0; t <= 3.0; t += 1.0) engine.evaluate(midState, 80, t);

    // Windows 4-5: poor windows -> REGRESS
    const poorState = createMockMovementState({ quality: 0.40, sync: 0.40, confidence: 0.85 });
    engine.evaluate(poorState, 80, 4.0);
    const reg1 = engine.evaluate(poorState, 80, 5.0);
    expect(reg1.adaptation.direction).toBe('REGRESS');
    const diff1 = reg1.difficulty;

    // Advance beyond cooldown
    let t = 11.0;
    engine.evaluate(poorState, reg1.tempo, t);
    const reg2 = engine.evaluate(poorState, reg1.tempo, t + 1.0);
    expect(reg2.adaptation.direction).toBe('REGRESS');
    expect(reg2.difficulty).toBeLessThan(diff1);
  });

  // TEST 9: Cooldown -> no repeated adaptation during cooldown
  it('TEST 9: blocks adaptations during the cooldown period', () => {
    const highState = createMockMovementState({ quality: 0.95, sync: 0.95, confidence: 0.95 });

    for (let t = 1; t <= 5; t++) engine.evaluate(highState, 60, t * 1.0);
    // At t = 5.0, progression occurred
    expect(engine.getLastDecision().direction).toBe('PROGRESS');

    // At t = 6.0 (1s into 5s cooldown), high performance continues
    const duringCooldown = engine.evaluate(highState, 63, 6.0);
    expect(duringCooldown.adaptation.direction).toBe('MAINTAIN');
    expect(duringCooldown.reason).toContain('cooldown active');
    expect(duringCooldown.tempo).toBe(63); // Unchanged
  });

  // TEST 10: Hysteresis -> no rapid oscillation
  it('TEST 10: prevents rapid oscillation through hysteresis dead zone', () => {
    // Alternating slightly above and below dead-zone boundaries
    const scores = [0.80, 0.60, 0.81, 0.59, 0.75, 0.65];
    for (let i = 0; i < scores.length; i++) {
      const state = createMockMovementState({ quality: scores[i], sync: scores[i], confidence: 0.85 });
      const res = engine.evaluate(state, 60, (i + 1) * 1.0);
      expect(res.adaptation.direction).toBe('MAINTAIN');
    }
    expect(engine.getLastDecision().direction).toBe('MAINTAIN');
  });

  // TEST 11: BPM adaptation -> tempo changes remain bounded
  it('TEST 11: bounds tempo strictly between minBpm and maxBpm', () => {
    engine.targetBpm = 139;
    const highState = createMockMovementState({ quality: 0.95, sync: 0.95, confidence: 0.95 });

    // Progress repeatedly
    for (let t = 1; t <= 10; t++) {
      engine.lastAdaptationTimestamp = -Infinity; // Bypass cooldown for boundary test
      engine.evaluate(highState, engine.targetBpm, t * 1.0);
    }
    expect(engine.targetBpm).toBeLessThanOrEqual(ADAPTIVE_ENGINE_CONFIG.maxBpm);

    // Regress down to floor
    engine.targetBpm = 41;
    const poorState = createMockMovementState({ quality: 0.30, sync: 0.30, confidence: 0.85 });
    for (let t = 20; t <= 30; t++) {
      engine.lastAdaptationTimestamp = -Infinity;
      engine.evaluate(poorState, engine.targetBpm, t * 1.0);
    }
    expect(engine.targetBpm).toBeGreaterThanOrEqual(ADAPTIVE_ENGINE_CONFIG.minBpm);
  });

  // TEST 12: Multi-dimensional adaptation -> Decoupled adaptations
  it('TEST 12: adapts movement target instead of tempo when movement is high but rhythm is low', () => {
    // Establish normal baseline
    const midState = createMockMovementState({ quality: 0.70, sync: 0.70, confidence: 0.85 });
    for (let t = 1.0; t <= 3.0; t += 1.0) engine.evaluate(midState, 60, t);

    // Good kinematic movement, but poor rhythm synchronization
    const decoupledState = createMockMovementState({
      quality: 0.88,
      sync: 0.50,
      confidence: 0.90
    });

    // Rhythm is low (< 0.60), so regression should target TEMPO/RHYTHM without penalizing movement
    engine.evaluate(decoupledState, 60, 4.0);
    const reg = engine.evaluate(decoupledState, 60, 5.0);
    expect(reg.adaptation.direction).toBe('REGRESS');
    expect(reg.adaptation.parameter).toBe('TEMPO');
    // Movement target must NOT have decreased
    expect(reg.movementTarget.rom).toBeGreaterThanOrEqual(ADAPTIVE_ENGINE_CONFIG.initialRomTarget);
  });

  // TEST 13: Baseline comparison -> relative improvement
  it('TEST 13: computes relative improvement against established session baseline', () => {
    const baseState = createMockMovementState({ quality: 0.60, sync: 0.60, confidence: 0.80 });
    engine.evaluate(baseState, 60, 1.0);
    engine.evaluate(baseState, 60, 2.0);
    engine.evaluate(baseState, 60, 3.0);

    const baseline = engine.getBaseLine();
    expect(baseline).not.toBeNull();
    expect(baseline.performance).toBeCloseTo(0.64, 1);

    // Later window with higher performance
    const improvedState = createMockMovementState({ quality: 0.85, sync: 0.85, confidence: 0.90 });
    const res = engine.evaluate(improvedState, 60, 4.0);
    expect(res.performance.relativeImprovement).toBeGreaterThan(0.15);
  });

  // TEST 14: Long session -> Bounded memory
  it('TEST 14: maintains bounded memory without unbounded growth over hundreds of updates', () => {
    const state = createMockMovementState();
    for (let t = 1; t <= 400; t++) {
      engine.evaluate(state, 60, t * 1.0);
    }

    expect(engine.performanceHistory.length).toBeLessThanOrEqual(ADAPTIVE_ENGINE_CONFIG.historyWindowSize);
    expect(engine.getHistory().length).toBeLessThanOrEqual(ADAPTIVE_ENGINE_CONFIG.maxMemoryHistory);
  });

  // TEST 15: Schema validation
  it('TEST 15: produces complete, valid canonical adaptive state object schema', () => {
    const state = createMockMovementState();
    const adaptiveState = engine.evaluate(state, 60, 1.0);

    expect(adaptiveState).toHaveProperty('timestamp');
    expect(typeof adaptiveState.timestamp).toBe('number');
    expect(adaptiveState).toHaveProperty('difficulty');
    expect(adaptiveState.difficulty).toBeGreaterThanOrEqual(0.0);
    expect(adaptiveState.difficulty).toBeLessThanOrEqual(1.0);

    expect(adaptiveState).toHaveProperty('tempo');
    expect(adaptiveState.tempo).toBeGreaterThanOrEqual(40);
    expect(adaptiveState.tempo).toBeLessThanOrEqual(140);

    expect(adaptiveState).toHaveProperty('targetRepetitions');
    expect(adaptiveState).toHaveProperty('movementTarget');
    expect(adaptiveState.movementTarget).toHaveProperty('rom');
    expect(adaptiveState.movementTarget).toHaveProperty('smoothness');
    expect(adaptiveState.movementTarget).toHaveProperty('symmetry');

    expect(adaptiveState).toHaveProperty('rhythmTarget');
    expect(adaptiveState.rhythmTarget).toHaveProperty('sync');
    expect(adaptiveState.rhythmTarget).toHaveProperty('timingErrorMs');

    expect(adaptiveState).toHaveProperty('adaptation');
    expect(['PROGRESS', 'MAINTAIN', 'REGRESS', 'FREEZE']).toContain(adaptiveState.adaptation.direction);
    expect(['TEMPO', 'MOVEMENT', 'REPETITIONS', 'RHYTHM', 'NONE']).toContain(adaptiveState.adaptation.parameter);

    expect(adaptiveState).toHaveProperty('performance');
    expect(adaptiveState).toHaveProperty('confidence');
    expect(adaptiveState).toHaveProperty('recommendation');
    expect(adaptiveState).toHaveProperty('reason');

    // Test explainLastDecision contract
    const explanation = engine.explainLastDecision();
    expect(typeof explanation).toBe('string');
    expect(explanation.length).toBeGreaterThan(5);
  });
});
