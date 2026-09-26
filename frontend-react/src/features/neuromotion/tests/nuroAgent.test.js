import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NuroAgent,
  NuroActionValidator,
  NuroReasoner,
  NURO_AGENT_CONFIG
} from '../core/NuroAgent';

function createMockMovementState({
  quality = 0.85,
  rhythmSync = 0.88,
  consistency = 0.82,
  confidence = 0.92,
  rom = 0.75,
  smoothness = 0.80,
  symmetry = 0.85
} = {}) {
  return {
    timestamp: Date.now(),
    state: 'ACTIVE',
    movement: {
      rom,
      smoothness,
      symmetry,
      consistency,
      quality
    },
    rhythm: {
      sync: rhythmSync,
      timingErrorMs: 40,
      missedBeats: 0
    },
    confidence
  };
}

function createMockAdaptiveState({
  tempo = 84,
  difficulty = 0.60,
  adaptation = { direction: 'MAINTAIN', parameter: 'NONE', magnitude: 0.0 }
} = {}) {
  return {
    tempo,
    difficulty,
    adaptation
  };
}

describe('P3 NuroAgent Automated Test Suite', () => {
  let agent;

  beforeEach(() => {
    agent = new NuroAgent({
      evaluationWindowSeconds: 0.0, // Instant evaluation for unit tests
      adaptationObservationSamples: 3
    });
  });

  // TEST 1: Valid high-performance context produces structured recommendation
  it('TEST 1: Valid high-performance context produces valid structured recommendation', () => {
    // Feed baseline windows
    for (let i = 0; i < 4; i++) {
      agent.observe(createMockMovementState(), createMockAdaptiveState(), i * 1.0);
    }
    const state = agent.getCurrentState();
    expect(state.lastDecision).toBeDefined();
    expect(state.lastDecision.intent).toBeDefined();
    expect(['PROGRESS', 'MAINTAIN']).toContain(state.lastDecision.intent);
    expect(typeof state.lastDecision.reason).toBe('string');
    expect(state.lastDecision.confidence).toBeGreaterThan(0.5);
  });

  // TEST 2: Low confidence -> OBSERVE / MAINTAIN
  it('TEST 2: Low tracking confidence results in OBSERVE/MAINTAIN with frozen progression', () => {
    for (let i = 0; i < 4; i++) {
      agent.observe(createMockMovementState({ confidence: 0.30 }), createMockAdaptiveState(), i * 1.0);
    }
    const state = agent.getCurrentState();
    expect(['OBSERVE', 'MAINTAIN']).toContain(state.lastDecision.intent);
    expect(state.lastDecision.reason).toMatch(/confidence|insufficient|maintaining/i);
  });

  // TEST 3: Invalid LLM JSON -> Fallback to deterministic decision
  it('TEST 3: Invalid LLM JSON safely falls back to deterministic decision', async () => {
    const reasoner = new NuroReasoner();
    // Simulate invalid fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ invalid_key: 'gibberish', not_a_decision: true })
    });

    const context = {
      current: { movementQuality: 0.85, rhythmSync: 0.85, confidence: 0.9 },
      performance: { score: 0.85, trend: 'IMPROVING', stability: 0.85 }
    };

    const decision = await reasoner.reason(context, '/fake-url');
    expect(decision).toBeDefined();
    expect(decision.intent).toBeDefined();
    expect(decision.confidence).toBeGreaterThan(0);
  });

  // TEST 4: LLM timeout -> Session continues
  it('TEST 4: LLM timeout or network error does not break reasoning', async () => {
    const reasoner = new NuroReasoner();
    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const context = {
      current: { movementQuality: 0.80, rhythmSync: 0.80, confidence: 0.9 },
      performance: { score: 0.80, trend: 'STABLE', stability: 0.8 }
    };

    const decision = await reasoner.reason(context, '/fake-url');
    expect(decision).toBeDefined();
    expect(decision.intent).toBe('MAINTAIN');
  });

  // TEST 5: LLM recommends illegal BPM -> Validator rejects/clamps
  it('TEST 5: LLM recommending illegal BPM is rejected or clamped by validator', () => {
    const illegalAction = {
      intent: 'PROGRESS',
      target: 'TEMPO',
      action: 'INCREASE_TEMPO',
      magnitude: 0.05
    };

    // Current tempo is already 140 (max boundary)
    const currentState = { tempo: 140, confidence: 0.9 };
    const validation = NuroActionValidator.validate(illegalAction, currentState);
    expect(validation.accepted).toBe(false);
    expect(validation.reason).toMatch(/violates safety bounds/i);
  });

  // TEST 6: Historical memory conflicts with current data -> Current evidence wins
  it('TEST 6: Historical memory conflicts with current data; current evidence has higher influence', () => {
    const historicalRecord = {
      tempo: 88,
      exerciseType: 'gait_trainer',
      ageInSessions: 5,
      outcome: 'POSITIVE'
    };

    const currentContext = {
      tempo: 60,
      exerciseType: 'gait_trainer'
    };

    const relevance = agent.calculateMemoryRelevance(historicalRecord, currentContext);
    const influence = agent.calculateMemoryInfluence(relevance, 0.95);

    // Memory influence is strictly capped at maxMemoryInfluence (0.35)
    expect(influence).toBeLessThanOrEqual(NURO_AGENT_CONFIG.maxMemoryInfluence);
    expect(influence).toBeLessThan(0.95); // Current confidence far outweighs historical influence
  });

  // TEST 7: Positive adaptation -> POSITIVE outcome
  it('TEST 7: Positive adaptation produces POSITIVE outcome evaluation', () => {
    // Establish baseline at 0.70
    for (let i = 0; i < 4; i++) {
      agent.observe(createMockMovementState({ quality: 0.70, rhythmSync: 0.70 }), createMockAdaptiveState({ tempo: 80 }), i * 1.0);
    }

    // Trigger adaptation experiment: TEMPO 80 -> 84
    agent.beginExperiment({ parameter: 'TEMPO', previousValue: 80, newValue: 84, direction: 'PROGRESS' }, 4.0, 0.70, 0.70, 0.70);

    // Observe 3 post-adaptation windows with significantly higher performance (0.85)
    for (let i = 5; i <= 7; i++) {
      agent.observe(createMockMovementState({ quality: 0.86, rhythmSync: 0.88 }), createMockAdaptiveState({ tempo: 84 }), i * 1.0);
    }

    const experiments = agent.getAdaptationExperiments();
    expect(experiments.length).toBe(1);
    expect(experiments[0].outcome).toBe('POSITIVE');
    expect(experiments[0].delta.performance).toBeGreaterThan(0.04);
  });

  // TEST 8: Negative adaptation -> NEGATIVE outcome
  it('TEST 8: Negative adaptation produces NEGATIVE outcome evaluation', () => {
    for (let i = 0; i < 4; i++) {
      agent.observe(createMockMovementState({ quality: 0.85, rhythmSync: 0.85 }), createMockAdaptiveState({ tempo: 88 }), i * 1.0);
    }

    agent.beginExperiment({ parameter: 'TEMPO', previousValue: 88, newValue: 94, direction: 'PROGRESS' }, 4.0, 0.85, 0.85, 0.85);

    // Performance drops noticeably post-adaptation (0.65)
    for (let i = 5; i <= 7; i++) {
      agent.observe(createMockMovementState({ quality: 0.65, rhythmSync: 0.60 }), createMockAdaptiveState({ tempo: 94 }), i * 1.0);
    }

    const experiments = agent.getAdaptationExperiments();
    expect(experiments.length).toBe(1);
    expect(experiments[0].outcome).toBe('NEGATIVE');
    expect(experiments[0].delta.performance).toBeLessThan(-0.04);
  });

  // TEST 9: Insufficient data or low confidence -> INCONCLUSIVE outcome
  it('TEST 9: Low confidence post-adaptation produces INCONCLUSIVE outcome', () => {
    for (let i = 0; i < 4; i++) {
      agent.observe(createMockMovementState({ quality: 0.80, rhythmSync: 0.80 }), createMockAdaptiveState(), i * 1.0);
    }

    agent.beginExperiment({ parameter: 'TEMPO', previousValue: 80, newValue: 84, direction: 'PROGRESS' }, 4.0, 0.80, 0.80, 0.80);

    // Post-adaptation tracking is obscured (low confidence 0.3)
    for (let i = 5; i <= 7; i++) {
      agent.observe(createMockMovementState({ confidence: 0.30 }), createMockAdaptiveState(), i * 1.0);
    }

    const experiments = agent.getAdaptationExperiments();
    expect(experiments.length).toBe(1);
    expect(experiments[0].outcome).toBe('INCONCLUSIVE');
  });

  // TEST 10: Stable performance -> MAINTAIN
  it('TEST 10: Consolidated performance in mid-target zone produces MAINTAIN', () => {
    for (let i = 0; i < 8; i++) {
      agent.observe(createMockMovementState({ quality: 0.72, rhythmSync: 0.74 }), createMockAdaptiveState(), i * 1.0);
    }
    const state = agent.getCurrentState();
    expect(state.lastDecision.intent).toBe('MAINTAIN');
    expect(state.performance.trend).toBe('STABLE');
  });

  // TEST 11: Improving trend -> PROGRESS candidate
  it('TEST 11: Consistently improving trend slope triggers PROGRESS recommendation', () => {
    // Gradually ramp performance from 0.70 to 0.90
    for (let i = 0; i < 8; i++) {
      const q = 0.70 + (i * 0.03);
      agent.observe(createMockMovementState({ quality: q, rhythmSync: q }), createMockAdaptiveState(), i * 1.0);
    }
    const state = agent.getCurrentState();
    expect(state.performance.trend).toBe('IMPROVING');
    expect(state.lastDecision.intent).toBe('PROGRESS');
  });

  // TEST 12: Declining trend -> RECOVER candidate
  it('TEST 12: Declining trend slope triggers RECOVER recommendation', () => {
    // Gradually decline performance from 0.85 down to 0.55
    for (let i = 0; i < 8; i++) {
      const q = 0.85 - (i * 0.04);
      agent.observe(createMockMovementState({ quality: q, rhythmSync: q }), createMockAdaptiveState(), i * 1.0);
    }
    const state = agent.getCurrentState();
    expect(state.performance.trend).toBe('DECLINING');
    expect(state.lastDecision.intent).toBe('RECOVER');
  });

  // TEST 13: Memory relevance ranking
  it('TEST 13: Memory relevance ranking correctly scores parameter and exercise similarity', () => {
    const memoryA = { tempo: 80, exerciseType: 'gait_trainer', ageInSessions: 1, outcome: 'POSITIVE' };
    const memoryB = { tempo: 120, exerciseType: 'finger_tapping', ageInSessions: 10, outcome: 'NEGATIVE' };

    const current = { tempo: 82, exerciseType: 'gait_trainer' };

    const scoreA = agent.calculateMemoryRelevance(memoryA, current);
    const scoreB = agent.calculateMemoryRelevance(memoryB, current);

    expect(scoreA).toBeGreaterThan(scoreB);
  });

  // TEST 14: Memory decay
  it('TEST 14: Memory decay applies exponential discount to older sessions', () => {
    const recentMemory = { tempo: 80, exerciseType: 'gait_trainer', ageInSessions: 1, outcome: 'POSITIVE' };
    const oldMemory = { tempo: 80, exerciseType: 'gait_trainer', ageInSessions: 20, outcome: 'POSITIVE' };

    const current = { tempo: 80, exerciseType: 'gait_trainer' };

    const relRecent = agent.calculateMemoryRelevance(recentMemory, current);
    const relOld = agent.calculateMemoryRelevance(oldMemory, current);

    expect(relRecent).toBeGreaterThan(relOld);
  });

  // TEST 15: Long session memory remains bounded
  it('TEST 15: Running hundreds of observations maintains strictly bounded memory', () => {
    for (let i = 0; i < 300; i++) {
      agent.observe(createMockMovementState(), createMockAdaptiveState(), i * 1.0);
    }
    const history = agent.getDecisionHistory();
    expect(history.length).toBeLessThanOrEqual(NURO_AGENT_CONFIG.maxWorkingMemoryHistory);
    expect(agent.performanceHistory.length).toBeLessThanOrEqual(NURO_AGENT_CONFIG.historyCapacity);
    expect(agent.getEventTimeline().length).toBeLessThanOrEqual(NURO_AGENT_CONFIG.maxTimelineEvents);
  });

  // TEST 16: State machine transitions
  it('TEST 16: State machine correctly transitions through agentic cycle', () => {
    agent.observe(createMockMovementState(), createMockAdaptiveState(), 1.0);
    const state = agent.getCurrentState();
    // After execution of cycle, agent returns to OBSERVE state waiting for next window
    expect(state.mode).toBe('OBSERVE');
  });

  // TEST 17: P2 fallback verified (agent never halts if external reasoner errors)
  it('TEST 17: P2 adaptive engine continues functioning even if agent encounter unexpected input', () => {
    expect(() => {
      agent.observe(null, null, 1.0);
      agent.observe({}, {}, 2.0);
      agent.observe(undefined, undefined, 3.0);
    }).not.toThrow();
  });

  // TEST 18: Schema validation on all agent decisions
  it('TEST 18: Every decision adheres strictly to required action schema', () => {
    for (let i = 0; i < 5; i++) {
      agent.observe(createMockMovementState(), createMockAdaptiveState(), i * 1.0);
    }
    const state = agent.getCurrentState();
    const d = state.lastDecision;

    expect(d).toHaveProperty('intent');
    expect(d).toHaveProperty('target');
    expect(d).toHaveProperty('action');
    expect(d).toHaveProperty('magnitude');
    expect(d).toHaveProperty('reason');
    expect(d).toHaveProperty('confidence');
    expect(['PROGRESS', 'MAINTAIN', 'RECOVER', 'EXPLORE', 'OBSERVE']).toContain(d.intent);
    expect(typeof d.reason).toBe('string');
  });
});
