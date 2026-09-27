/**
 * NuroAgent - P3 Closed-Loop Agentic Intelligence Layer
 * 
 * Architecture:
 * OBSERVE -> UNDERSTAND -> REMEMBER -> REASON -> PLAN -> ACT -> MEASURE OUTCOME -> REFLECT -> UPDATE MEMORY -> ADAPT NEXT ACTION
 * 
 * Logical Submodules:
 * - StateObserver: Continuous temporal state tracking from P1 & P2
 * - ContextBuilder: Compact structured context generation for reasoning
 * - Planner: Structured candidate action generation & deterministic reasoning
 * - DecisionValidator (NuroActionValidator): Strict safety, schema, and confidence bounds
 * - FeedbackGenerator: User-facing explainability and rationale (No medical claims)
 * - OutcomeEvaluator: Empirical adaptation response measurement (POSITIVE / NEUTRAL / NEGATIVE / INCONCLUSIVE)
 * - MemoryManager: Working Memory (within-session) & Long-Term Structured Memory (cross-session relevance)
 * 
 * Strictly deterministic core. LLM-advisory with zero-latency deterministic fallback.
 * Zero medical or diagnostic claims: Engineering & application-level adaptation only.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exports = factory();
        root.NuroAgent = exports.NuroAgent;
        root.NuroActionValidator = exports.NuroActionValidator;
        root.NuroReasoner = exports.NuroReasoner;
        root.NURO_AGENT_CONFIG = exports.NURO_AGENT_CONFIG;
        root.nuroAgent = new exports.NuroAgent();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const NURO_AGENT_CONFIG = {
        // Evaluation & Window Timing
        evaluationWindowSeconds: 1.0,
        historyCapacity: 20,
        baselineWindowsRequired: 4,
        cooldownSeconds: 12.0,
        adaptationObservationSamples: 3, // Windows to observe post-adaptation response

        // Performance Weights (Section 5)
        weights: {
            movement: 0.40,
            rhythm: 0.30,
            stability: 0.20,
            confidence: 0.10
        },

        // Trend Classification Thresholds (Section 6)
        trendSlopeImproving: 0.015,
        trendSlopeDeclining: -0.015,
        trendScale: 0.05,
        volatilityCvThreshold: 0.25,

        // Adaptation Outcome Thresholds (Section 10)
        outcomePositiveDelta: 0.04,
        outcomeNegativeDelta: -0.04,
        minOutcomeConfidence: 0.45,

        // Safety Guardrails & Engineering Bounds (Section 39)
        minBpm: 40,
        maxBpm: 140,
        minRepetitions: 4,
        maxRepetitions: 30,
        minRomTarget: 0.30,
        maxRomTarget: 0.95,
        maxStepMagnitude: 0.08,
        minTrackingConfidence: 0.45,

        // Memory & Decay (Sections 19, 20, 33)
        memoryDecayLambda: 0.10,
        maxMemoryInfluence: 0.35,
        maxWorkingMemoryHistory: 50,
        maxTimelineEvents: 15
    };

    /**
     * Action Validator enforcing engineering bounds, schema validity, and safety.
     */
    class NuroActionValidator {
        static validate(actionObj, currentState, config = NURO_AGENT_CONFIG) {
            if (!actionObj || typeof actionObj !== 'object') {
                return { accepted: false, reason: 'Action object is null or not an object.' };
            }

            const allowedIntents = ['PROGRESS', 'MAINTAIN', 'RECOVER', 'EXPLORE', 'OBSERVE'];
            const allowedTargets = ['TEMPO', 'MOVEMENT', 'REPETITIONS', 'RHYTHM', 'NONE'];
            const allowedActions = [
                'INCREASE_TEMPO', 'DECREASE_TEMPO',
                'INCREASE_MOVEMENT_TARGET', 'DECREASE_MOVEMENT_TARGET',
                'INCREASE_REPETITIONS', 'DECREASE_REPETITIONS',
                'MAINTAIN', 'REQUEST_MORE_OBSERVATION'
            ];

            const intent = actionObj.intent || 'MAINTAIN';
            const target = actionObj.target || 'NONE';
            const action = actionObj.action || 'MAINTAIN';

            if (!allowedIntents.includes(intent)) {
                return { accepted: false, reason: `Invalid intent: ${intent}` };
            }
            if (!allowedTargets.includes(target)) {
                return { accepted: false, reason: `Invalid target: ${target}` };
            }
            if (!allowedActions.includes(action)) {
                return { accepted: false, reason: `Invalid action: ${action}` };
            }

            // Gating: Tracking Confidence Failure
            const currentConfidence = currentState ? (currentState.confidence || 0) : 1.0;
            if (currentConfidence < config.minTrackingConfidence && intent !== 'MAINTAIN' && intent !== 'OBSERVE') {
                return { accepted: false, reason: 'Tracking confidence below adaptation threshold.' };
            }

            // Gating: Numeric Parameter Clamping
            let clampedMagnitude = Number(actionObj.magnitude || 0);
            if (Math.abs(clampedMagnitude) > config.maxStepMagnitude) {
                clampedMagnitude = Math.sign(clampedMagnitude) * config.maxStepMagnitude;
            }

            // Gating: Target Specific Bounds
            if (target === 'TEMPO') {
                const currentTempo = currentState ? (currentState.tempo || 60) : 60;
                let candidateTempo = currentTempo;
                if (action === 'INCREASE_TEMPO') candidateTempo += Math.max(1, Math.round(clampedMagnitude * 50));
                if (action === 'DECREASE_TEMPO') candidateTempo -= Math.max(1, Math.round(clampedMagnitude * 50));

                if (candidateTempo < config.minBpm || candidateTempo > config.maxBpm) {
                    return {
                        accepted: false,
                        reason: `Target BPM ${candidateTempo} violates safety bounds [${config.minBpm}, ${config.maxBpm}].`,
                        clampedValue: Math.max(config.minBpm, Math.min(config.maxBpm, candidateTempo))
                    };
                }
            }

            return {
                accepted: true,
                validatedAction: {
                    ...actionObj,
                    magnitude: clampedMagnitude
                }
            };
        }
    }

    /**
     * NuroReasoner - Provider abstraction for advisory reasoning.
     * Features full deterministic reasoning core with zero latency.
     */
    class NuroReasoner {
        constructor(config = NURO_AGENT_CONFIG) {
            this.config = config;
        }

        /**
         * Pure deterministic reasoning based on structured context.
         */
        reasonDeterministic(context) {
            const current = context.current || {};
            const perf = context.performance || {};
            const adaptive = context.adaptive || {};
            const trend = perf.trend || 'STABLE';
            const stability = perf.stability !== undefined ? perf.stability : 0.8;
            const confidence = current.confidence !== undefined ? current.confidence : 0.9;
            const score = perf.score !== undefined ? perf.score : 0.8;

            // Low tracking confidence -> FREEZE / OBSERVE
            if (confidence < this.config.minTrackingConfidence) {
                return {
                    intent: 'OBSERVE',
                    target: 'NONE',
                    action: 'REQUEST_MORE_OBSERVATION',
                    magnitude: 0,
                    reason: 'Tracking confidence is insufficient for reliable adaptation. Maintaining stable challenge.',
                    confidence: Number(confidence.toFixed(2))
                };
            }

            // Improving trend + High score + High stability -> PROGRESS
            if ((trend === 'IMPROVING' || score >= 0.82) && stability >= 0.70 && score >= 0.78) {
                // Multi-dimensional targeting: If rhythm is exceptional, advance tempo; else movement
                const target = (current.rhythmSync || 0.8) >= 0.82 ? 'TEMPO' : 'MOVEMENT';
                const action = target === 'TEMPO' ? 'INCREASE_TEMPO' : 'INCREASE_MOVEMENT_TARGET';
                return {
                    intent: 'PROGRESS',
                    target: target,
                    action: action,
                    magnitude: 0.05,
                    reason: `High performance (${Math.round(score * 100)}%) with ${trend.toLowerCase()} trend and stable rhythm synchronization.`,
                    confidence: Number(Math.min(0.98, confidence * 0.95).toFixed(2))
                };
            }

            // Declining trend or Low score -> RECOVER
            if (trend === 'DECLINING' || score < 0.58) {
                // If rhythm synchronization suffered most, ease tempo
                const target = (current.rhythmSync || 0.6) < 0.65 ? 'TEMPO' : 'MOVEMENT';
                const action = target === 'TEMPO' ? 'DECREASE_TEMPO' : 'DECREASE_MOVEMENT_TARGET';
                return {
                    intent: 'RECOVER',
                    target: target,
                    action: action,
                    magnitude: 0.05,
                    reason: `Performance declined (${Math.round(score * 100)}%) across recent windows. Adjusting challenge for motor recovery.`,
                    confidence: Number(Math.min(0.95, confidence * 0.90).toFixed(2))
                };
            }

            // Controlled Exploration: If highly stable for extended windows and no recent negative outcomes
            if (stability >= 0.90 && score >= 0.75 && (context.lastOutcome === 'POSITIVE' || !context.lastOutcome)) {
                const historySummary = context.historySummary || {};
                if ((historySummary.recentNegativeActions || 0) === 0 && (historySummary.recentSuccessfulActions || 0) >= 2) {
                    return {
                        intent: 'EXPLORE',
                        target: 'TEMPO',
                        action: 'INCREASE_TEMPO',
                        magnitude: 0.03,
                        reason: 'Performance is highly consolidated. Probing upper stable motor boundary with controlled increment.',
                        confidence: Number((confidence * 0.88).toFixed(2))
                    };
                }
            }

            // Default: Stable within target zone -> MAINTAIN
            return {
                intent: 'MAINTAIN',
                target: 'NONE',
                action: 'MAINTAIN',
                magnitude: 0,
                reason: `Performance remains consolidated within target zone (${Math.round(score * 100)}% performance, ${trend.toLowerCase()} trend).`,
                confidence: Number((confidence * 0.92).toFixed(2))
            };
        }

        /**
         * Asynchronous reasoner call with guaranteed zero-latency fallback.
         */
        async reason(context, endpointUrl = '/api/nuro-agent/reason') {
            const deterministicFallback = this.reasonDeterministic(context);

            if (typeof fetch === 'undefined') {
                return deterministicFallback;
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2s timeout

                const response = await fetch(endpointUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ context: context }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    return deterministicFallback;
                }

                const data = await response.json();
                if (data && data.decision && typeof data.decision === 'object') {
                    // Validate schema
                    const val = NuroActionValidator.validate(data.decision, context.current, this.config);
                    if (val.accepted) {
                        return val.validatedAction;
                    }
                }
                return deterministicFallback;
            } catch (err) {
                // Timeout, network disconnect, or offline -> zero-latency fallback
                return deterministicFallback;
            }
        }
    }

    /**
     * NuroAgent - Complete Closed-Loop Intelligence Agent
     */
    class NuroAgent {
        constructor(config = {}) {
            this.config = {
                ...NURO_AGENT_CONFIG,
                ...config,
                weights: { ...NURO_AGENT_CONFIG.weights, ...(config.weights || {}) }
            };

            this.reasoner = new NuroReasoner(this.config);
            this.reset();
        }

        /**
         * Initialize/Reset working memory, lifecycle state machine, and history.
         */
        reset(sessionId = null) {
            this.sessionId = sessionId || `session_${Date.now()}`;
            this.stateMachineMode = 'OBSERVE'; // OBSERVE -> ANALYZE -> PLAN -> VALIDATE -> ACT -> EVALUATE -> REFLECT

            // Working Memory: Temporal Evaluation History
            // [{ timestamp, performance, movementQuality, rhythmSync, consistency, confidence, tempo, difficulty }]
            this.performanceHistory = [];

            // Session Baseline (Section 7)
            this.sessionBaseline = null;
            this.baselineCandidates = [];

            // Causal Adaptation Experiments (Sections 9, 10, 34)
            // [{ id, timestamp, action, before, observationWindow, after, delta, outcome }]
            this.adaptationExperiments = [];
            this.pendingExperiment = null;

            // Decision Log & Episodic Memory (Section 27)
            this.decisionHistory = [];
            this.lastDecision = null;

            // Personal Performance Envelope (Section 17)
            this.performanceEnvelope = {
                tempo: { minSuccessful: null, maxSuccessful: null, current: 60 },
                difficulty: { minSuccessful: null, maxSuccessful: null, current: 0.50 }
            };

            // Active Hypothesis Lifecycle (Sections 36, 37)
            // { id, hypothesis, evidence, confidence, status: 'FORMED' | 'TESTING' | 'SUPPORTED' | 'REFUTED' }
            this.activeHypothesis = null;

            // Event Stream for UI Demo Timeline & Durable Persistence (Section 25)
            this.eventTimeline = [];
            this.pendingEventsQueue = [];
            this.lastEventFlushSec = 0;

            // Last Evaluation Timestamp
            this.lastEvaluationTimeSec = -Infinity;
            this.lastActionTimestampSec = -Infinity;

            // Long-Term Memory Storage (simulated or cross-session store)
            this.longTermMemories = [];

            // Demo Mode Flag
            this.isDemoMode = false;

            this.recordEvent('Session initialized. Observing baseline movement kinematics.', 'LIFECYCLE');
        }

        setDemoMode(enabled) {
            this.isDemoMode = !!enabled;
            this.recordEvent(`Demo mode ${this.isDemoMode ? 'activated' : 'deactivated'}.`, 'CONFIG');
        }

        /**
         * Load learned personal envelope from previous sessions
         */
        setPersonalEnvelope(env) {
            if (!env || typeof env !== 'object') return;
            if (env.stable_bpm_min !== undefined) this.performanceEnvelope.tempo.minSuccessful = env.stable_bpm_min;
            if (env.stable_bpm_max !== undefined) this.performanceEnvelope.tempo.maxSuccessful = env.stable_bpm_max;
            if (env.typical_cadence !== undefined) this.performanceEnvelope.tempo.current = env.typical_cadence;
            this.recordEvent(`Loaded personalized motor envelope: ${this.performanceEnvelope.tempo.minSuccessful || 45}-${this.performanceEnvelope.tempo.maxSuccessful || 72} BPM.`, 'PERSONALIZATION');
        }

        /**
         * Record a human-readable event for the live event timeline and durable persistence.
         */
        recordEvent(message, eventType = 'GENERAL', payload = {}) {
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0];
            const nowMs = Date.now();
            const nowSec = Number((performance.now() / 1000.0).toFixed(3));

            this.eventTimeline.push({
                time: timeStr,
                timestamp: nowMs,
                message: message
            });

            if (this.eventTimeline.length > this.config.maxTimelineEvents) {
                this.eventTimeline.shift();
            }

            // Queue for durable backend persistence
            this.pendingEventsQueue.push({
                timestamp: nowSec,
                event_type: eventType,
                source: 'P5',
                severity: 'INFO',
                payload: { message, ...payload },
                idempotency_key: `${this.sessionId}_${eventType}_${nowMs}_${Math.random().toString(36).substring(2, 7)}`
            });

            if (this.pendingEventsQueue.length >= 5 || (nowSec - this.lastEventFlushSec > 5.0)) {
                this.flushPendingEvents();
            }
        }

        async flushPendingEvents() {
            if (typeof fetch === 'undefined' || this.pendingEventsQueue.length === 0) return;
            this.lastEventFlushSec = performance.now() / 1000.0;
            const batch = this.pendingEventsQueue.splice(0, 10);

            try {
                await fetch(`/api/session/${this.sessionId}/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ events: batch })
                });
            } catch (e) {
                if (this.pendingEventsQueue.length < 30) {
                    this.pendingEventsQueue.unshift(...batch);
                }
            }
        }

        getEventTimeline() {
            return [...this.eventTimeline];
        }

        /**
         * Performance Index (Section 5)
         * P = wm * M + wr * R + ws * S + wc * C
         */
        calculatePerformanceIndex(movementQuality, rhythmSync, consistency, confidence) {
            const w = this.config.weights;
            const p = (w.movement * movementQuality) +
                      (w.rhythm * rhythmSync) +
                      (w.stability * consistency) +
                      (w.confidence * confidence);
            return Math.max(0.0, Math.min(1.0, p));
        }

        /**
         * Performance Stability (Section 8)
         * stability = 1 - normalizedCoefficientOfVariation(history)
         */
        calculateStability() {
            if (this.performanceHistory.length < 3) return 0.85;

            const scores = this.performanceHistory.map(h => h.performance);
            const n = scores.length;
            const mean = scores.reduce((a, b) => a + b, 0) / n;
            if (mean <= 0.001) return 0.0;

            const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (n - 1);
            const sd = Math.sqrt(variance);
            const cv = sd / mean;

            const normalizedCv = Math.min(1.0, cv / 0.5);
            return Math.max(0.0, Math.min(1.0, 1.0 - normalizedCv));
        }

        /**
         * Trend Analysis (Section 6)
         * Linear regression slope over recent evaluation windows.
         */
        calculateTrend() {
            const n = this.performanceHistory.length;
            if (n < 3) {
                return {
                    trend: 'INSUFFICIENT_DATA',
                    slope: 0.0,
                    mean: n > 0 ? this.performanceHistory[n - 1].performance : 0.0,
                    std: 0.0
                };
            }

            const recent = this.performanceHistory.slice(-10);
            const count = recent.length;

            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            for (let i = 0; i < count; i++) {
                const x = i;
                const y = recent[i].performance;
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            }

            const denominator = (count * sumXX - sumX * sumX);
            const slope = denominator !== 0 ? (count * sumXY - sumX * sumY) / denominator : 0.0;

            const mean = sumY / count;
            const variance = recent.reduce((sum, r) => sum + Math.pow(r.performance - mean, 2), 0) / (count - 1);
            const std = Math.sqrt(variance);

            let trend = 'STABLE';
            if (slope > this.config.trendSlopeImproving) {
                trend = 'IMPROVING';
            } else if (slope < this.config.trendSlopeDeclining) {
                trend = 'DECLINING';
            } else if (std > this.config.volatilityCvThreshold) {
                trend = 'VOLATILE';
            }

            return {
                trend: trend,
                slope: Number(slope.toFixed(4)),
                mean: Number(mean.toFixed(3)),
                std: Number(std.toFixed(3))
            };
        }

        /**
         * Evidence Strength Formula (Section 32)
         */
        calculateEvidenceStrength(confidence, trendSlope, stability) {
            const historySufficiency = Math.min(1.0, this.performanceHistory.length / this.config.historyCapacity);
            const trendStrength = Math.min(1.0, Math.abs(trendSlope) / this.config.trendScale);

            const es = (0.35 * confidence) +
                       (0.25 * historySufficiency) +
                       (0.20 * trendStrength) +
                       (0.20 * stability);
            return Math.max(0.0, Math.min(1.0, es));
        }

        /**
         * Agent Decision Confidence (Section 15)
         */
        calculateDecisionConfidence(confidence, stability, evidenceStrength) {
            const historySufficiency = Math.min(1.0, this.performanceHistory.length / this.config.historyCapacity);
            const adc = (0.35 * confidence) +
                        (0.25 * historySufficiency) +
                        (0.20 * stability) +
                        (0.20 * evidenceStrength);
            return Math.max(0.0, Math.min(1.0, adc));
        }

        /**
         * Observe Movement State & Execute Closed Loop
         */
        observe(movementState, adaptiveState = null, timestampSec = null) {
            const nowSec = timestampSec !== null ? timestampSec : (performance.now() / 1000.0);

            if (!movementState || typeof movementState !== 'object') {
                return this.getCurrentState();
            }

            // Extract P1 Metrics
            const m = movementState.movement || {};
            const r = movementState.rhythm || {};
            const movementQuality = Number(m.quality !== undefined ? m.quality : 0.70);
            const rhythmSync = Number(r.sync !== undefined ? r.sync : 0.75);
            const consistency = Number(m.consistency !== undefined ? m.consistency : 0.75);
            const trackingConfidence = Number(movementState.confidence !== undefined ? movementState.confidence : 0.90);

            // Extract P2 Adaptive State if provided
            const currentTempo = adaptiveState ? (adaptiveState.tempo || 60) : 60;
            const currentDifficulty = adaptiveState ? (adaptiveState.difficulty || 0.50) : 0.50;

            // Throttle evaluation windows (Section 29: Window-level reasoning)
            if ((nowSec - this.lastEvaluationTimeSec) < this.config.evaluationWindowSeconds) {
                return this.getCurrentState();
            }
            this.lastEvaluationTimeSec = nowSec;

            // Extract P4 Temporal State if provided
            const temporal = movementState.temporal || null;

            // 1. Calculate Performance Index
            const perfIndex = this.calculatePerformanceIndex(movementQuality, rhythmSync, consistency, trackingConfidence);

            // 2. Manage Rolling History
            this.performanceHistory.push({
                timestamp: Math.round(nowSec * 1000),
                performance: Number(perfIndex.toFixed(3)),
                movementQuality: Number(movementQuality.toFixed(3)),
                rhythmSync: Number(rhythmSync.toFixed(3)),
                consistency: Number(consistency.toFixed(3)),
                confidence: Number(trackingConfidence.toFixed(3)),
                tempo: currentTempo,
                difficulty: currentDifficulty,
                phaseState: temporal?.phase?.state || 'UNKNOWN',
                cycleDurationMs: temporal?.cycle?.durationMs || null
            });

            if (temporal && temporal.cycle && temporal.cycle.index > 0 && temporal.cycle.index !== this.lastRecordedCycleIndex) {
                this.lastRecordedCycleIndex = temporal.cycle.index;
                const devMs = temporal.cycle.deviationMs || 0;
                if (Math.abs(devMs) > 150) {
                    this.recordEvent(`Temporal cycle ${temporal.cycle.index} completed with ${Math.round(devMs)}ms timing deviation.`);
                }
            }

            if (this.performanceHistory.length > this.config.historyCapacity) {
                this.performanceHistory.shift();
            }

            // 3. Establish Session Baseline
            if (!this.sessionBaseline) {
                this.baselineCandidates.push(perfIndex);
                if (this.baselineCandidates.length >= this.config.baselineWindowsRequired) {
                    const avgPerf = this.baselineCandidates.reduce((a, b) => a + b, 0) / this.baselineCandidates.length;
                    this.sessionBaseline = {
                        performance: Number(avgPerf.toFixed(3)),
                        movementQuality: movementQuality,
                        rhythmSync: rhythmSync,
                        establishedAt: Math.round(nowSec * 1000)
                    };
                    this.recordEvent(`Session baseline established at ${Math.round(avgPerf * 100)}% performance.`);
                }
            }

            // 4. Closed Loop: Evaluate Outcome of Pending Experiment (Sections 9, 10, 34)
            this.evaluatePendingExperiment(nowSec, trackingConfidence);

            // 5. State Machine Transition: ANALYZE -> PLAN -> VALIDATE
            this.stateMachineMode = 'ANALYZE';
            const trendInfo = this.calculateTrend();
            const stability = this.calculateStability();
            const evidenceStrength = this.calculateEvidenceStrength(trackingConfidence, trendInfo.slope, stability);
            const agentConfidence = this.calculateDecisionConfidence(trackingConfidence, stability, evidenceStrength);

            // Check if P2 triggered an adaptation that needs tracking
            if (adaptiveState && adaptiveState.adaptation && adaptiveState.adaptation.direction !== 'MAINTAIN' && adaptiveState.adaptation.direction !== 'FREEZE') {
                const lastAdapt = adaptiveState.adaptation;
                if (!this.pendingExperiment || (nowSec - this.pendingExperiment.timestampSec > 2.0)) {
                    this.beginExperiment({
                        parameter: lastAdapt.parameter,
                        previousValue: currentTempo,
                        newValue: adaptiveState.tempo,
                        direction: lastAdapt.direction
                    }, nowSec, perfIndex, movementQuality, rhythmSync);
                }
            }

            // 6. Build Compact Context & Plan Reasoning (Sections 12, 13, 30)
            this.stateMachineMode = 'PLAN';
            const context = this.buildCompactContext(movementState, adaptiveState, perfIndex, trendInfo, stability);

            // Deterministic Decision Generation (P5 Proposal)
            const decision = this.reasoner.reasonDeterministic(context);

            // 7. Authoritative P2 Execution Gateway (Section 10 & 21)
            this.stateMachineMode = 'VALIDATE';
            let p2Result = null;
            if (window.adaptiveEngine && typeof window.adaptiveEngine.validateAndExecuteProposal === 'function') {
                p2Result = window.adaptiveEngine.validateAndExecuteProposal(
                    decision,
                    trackingConfidence,
                    this.performanceEnvelope,
                    nowSec
                );
            }

            const validation = NuroActionValidator.validate(decision, {
                confidence: trackingConfidence,
                tempo: currentTempo,
                difficulty: currentDifficulty
            }, this.config);

            const finalDecision = (p2Result && p2Result.executedAction) ? p2Result.executedAction : (validation.accepted ? validation.validatedAction : {
                intent: 'MAINTAIN',
                target: 'NONE',
                action: 'MAINTAIN',
                magnitude: 0,
                reason: `Rejected by safety validator: ${validation.reason}`,
                confidence: Number(trackingConfidence.toFixed(2))
            });

            this.stateMachineMode = 'ACT';
            this.recordDecision(nowSec, decision, p2Result, perfIndex);

            // Check if P2 executed a non-maintain adaptation
            if (p2Result && p2Result.executedAction && p2Result.executedAction.direction !== 'MAINTAIN' && p2Result.executedAction.direction !== 'FREEZE') {
                if (!this.pendingExperiment || (nowSec - this.pendingExperiment.timestampSec > 2.0)) {
                    this.beginExperiment({
                        parameter: p2Result.executedAction.parameter,
                        previousValue: p2Result.executedAction.previousBpm,
                        newValue: p2Result.executedAction.executedBpm,
                        direction: p2Result.executedAction.direction,
                        validatorResult: p2Result.validatorResult,
                        clampReason: p2Result.executedAction.clampReason
                    }, nowSec, perfIndex, movementQuality, rhythmSync);
                }
            }

            // 8. Update Hypothesis Lifecycle (Sections 36, 37)
            this.updateHypothesisLifecycle(decision, trendInfo, perfIndex);

            this.stateMachineMode = 'OBSERVE';
            return this.getCurrentState();
        }

        /**
         * Begin tracking an adaptation experiment (Sections 9 & 10)
         */
        beginExperiment(action, timestampSec, perf, mQual, rSync) {
            this.pendingExperiment = {
                id: `exp_${Date.now()}`,
                timestampSec: timestampSec,
                action: action,
                before: {
                    performance: Number(perf.toFixed(3)),
                    movementQuality: Number(mQual.toFixed(3)),
                    rhythmSync: Number(rSync.toFixed(3))
                },
                observationSamples: [],
                requiredSamples: this.config.adaptationObservationSamples
            };

            const clampNote = action.clampReason ? ` [${action.clampReason}]` : '';
            this.recordEvent(`Testing adaptation: ${action.parameter} ${action.direction} (${action.previousValue} -> ${action.newValue})${clampNote}.`, 'ADAPTATION');
        }

        /**
         * Evaluate response to an ongoing adaptation experiment (Section 10)
         */
        evaluatePendingExperiment(nowSec, trackingConfidence) {
            if (!this.pendingExperiment) return;

            const n = this.performanceHistory.length;
            if (n === 0) return;

            const latestSample = this.performanceHistory[n - 1];
            this.pendingExperiment.observationSamples.push(latestSample);

            if (this.pendingExperiment.observationSamples.length >= this.pendingExperiment.requiredSamples) {
                this.stateMachineMode = 'EVALUATE';

                // Check confidence gating
                const avgConfidence = this.pendingExperiment.observationSamples.reduce((a, b) => a + b.confidence, 0) / this.pendingExperiment.observationSamples.length;
                if (avgConfidence < this.config.minOutcomeConfidence) {
                    this.finalizeExperiment('INCONCLUSIVE', 0.0, 0.0, 0.0);
                    return;
                }

                // Compute post-adaptation averages
                const afterPerf = this.pendingExperiment.observationSamples.reduce((a, b) => a + b.performance, 0) / this.pendingExperiment.observationSamples.length;
                const afterMQual = this.pendingExperiment.observationSamples.reduce((a, b) => a + b.movementQuality, 0) / this.pendingExperiment.observationSamples.length;
                const afterRSync = this.pendingExperiment.observationSamples.reduce((a, b) => a + b.rhythmSync, 0) / this.pendingExperiment.observationSamples.length;

                const deltaPerf = afterPerf - this.pendingExperiment.before.performance;
                const deltaMQual = afterMQual - this.pendingExperiment.before.movementQuality;
                const deltaRSync = afterRSync - this.pendingExperiment.before.rhythmSync;

                let outcome = 'NEUTRAL';
                if (deltaPerf > this.config.outcomePositiveDelta) {
                    outcome = 'POSITIVE';
                } else if (deltaPerf < this.config.outcomeNegativeDelta) {
                    outcome = 'NEGATIVE';
                }

                this.finalizeExperiment(outcome, deltaPerf, deltaMQual, deltaRSync, afterPerf, afterMQual, afterRSync);
            }
        }

        /**
         * Finalize adaptation experiment and record to causal memory.
         */
        finalizeExperiment(outcome, deltaPerf, deltaMQual, deltaRSync, afterPerf = 0, afterMQual = 0, afterRSync = 0) {
            const exp = {
                id: this.pendingExperiment.id,
                timestamp: Math.round(this.pendingExperiment.timestampSec * 1000),
                action: this.pendingExperiment.action,
                before: this.pendingExperiment.before,
                observationWindow: {
                    samples: this.pendingExperiment.observationSamples.length
                },
                after: {
                    performance: Number(afterPerf.toFixed(3)),
                    movementQuality: Number(afterMQual.toFixed(3)),
                    rhythmSync: Number(afterRSync.toFixed(3))
                },
                delta: {
                    performance: Number(deltaPerf.toFixed(3)),
                    movementQuality: Number(deltaMQual.toFixed(3)),
                    rhythmSync: Number(deltaRSync.toFixed(3))
                },
                outcome: outcome
            };

            this.adaptationExperiments.push(exp);
            if (this.adaptationExperiments.length > this.config.maxWorkingMemoryHistory) {
                this.adaptationExperiments.shift();
            }

            // Update Personal Performance Envelope (Section 17)
            if (outcome === 'POSITIVE') {
                const tempo = exp.action.newValue || exp.after.tempo;
                if (tempo) {
                    if (this.performanceEnvelope.tempo.minSuccessful === null || tempo < this.performanceEnvelope.tempo.minSuccessful) {
                        this.performanceEnvelope.tempo.minSuccessful = tempo;
                    }
                    if (this.performanceEnvelope.tempo.maxSuccessful === null || tempo > this.performanceEnvelope.tempo.maxSuccessful) {
                        this.performanceEnvelope.tempo.maxSuccessful = tempo;
                    }
                }
            }

            // Reflect on Hypothesis
            if (this.activeHypothesis && this.activeHypothesis.status === 'TESTING') {
                if (outcome === 'POSITIVE') {
                    this.activeHypothesis.status = 'SUPPORTED';
                    this.recordEvent(`Hypothesis confirmed: Adaptation outcome was POSITIVE.`, 'OUTCOME');
                } else if (outcome === 'NEGATIVE') {
                    this.activeHypothesis.status = 'REFUTED';
                    this.recordEvent(`Hypothesis refuted: Adaptation outcome was NEGATIVE.`, 'OUTCOME');
                }
            }

            this.recordEvent(`Adaptation evaluated: ${outcome} outcome (ΔP: ${deltaPerf > 0 ? '+' : ''}${Math.round(deltaPerf * 100)}%).`, 'OUTCOME', {
                outcome, deltaPerf, deltaMQual, deltaRSync
            });

            // Relational Persistence: Push Intervention & Outcome to Backend
            this.persistInterventionOutcome(exp);

            this.pendingExperiment = null;
        }

        async persistInterventionOutcome(exp) {
            if (typeof fetch === 'undefined') return;
            try {
                // 1. Create intervention
                const res = await fetch(`/api/session/${this.sessionId}/interventions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        target_parameter: exp.action.parameter || 'TEMPO',
                        action_taken: `${exp.action.direction || 'PROGRESS'}_${exp.action.parameter || 'TEMPO'}`,
                        previous_value: exp.action.previousValue || 60,
                        new_value: exp.action.newValue || 64,
                        pre_performance: exp.before.performance,
                        pre_rhythm_sync: exp.before.rhythmSync,
                        pre_movement_quality: exp.before.movementQuality,
                        observation_window_cycles: exp.observationWindow.samples
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    const intId = data.intervention_id;
                    if (intId) {
                        // 2. Record outcome
                        await fetch(`/api/intervention/${intId}/outcome`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                post_performance: exp.after.performance,
                                post_rhythm_sync: exp.after.rhythmSync,
                                post_movement_quality: exp.after.movementQuality,
                                delta_performance: exp.delta.performance,
                                delta_rhythm_sync: exp.delta.rhythmSync,
                                delta_movement_quality: exp.delta.movementQuality,
                                response_score: (0.50 * exp.delta.performance) + (0.25 * exp.delta.rhythmSync) + (0.25 * exp.delta.movementQuality),
                                classification: exp.outcome,
                                confidence: 0.90,
                                evaluation_window_cycles: exp.observationWindow.samples
                            })
                        });
                    }
                }
            } catch (e) {
                // Non-blocking persistence failure
            }
        }

        /**
         * Hypothesis Lifecycle (Sections 36, 37)
         */
        updateHypothesisLifecycle(decision, trendInfo, perfIndex) {
            if (decision.intent === 'PROGRESS' && (!this.activeHypothesis || this.activeHypothesis.status !== 'TESTING')) {
                this.activeHypothesis = {
                    id: `hyp_${Date.now()}`,
                    hypothesis: 'User is consolidating movement and can comfortably tolerate tempo progression.',
                    evidence: [
                        `Trend slope: ${trendInfo.slope}`,
                        `Performance score: ${Math.round(perfIndex * 100)}%`
                    ],
                    confidence: decision.confidence,
                    status: 'TESTING'
                };
            } else if (decision.intent === 'RECOVER' && (!this.activeHypothesis || this.activeHypothesis.status !== 'TESTING')) {
                this.activeHypothesis = {
                    id: `hyp_${Date.now()}`,
                    hypothesis: 'Fatigue or motor difficulty is emerging; challenge reduction will stabilize performance.',
                    evidence: [
                        `Trend: ${trendInfo.trend}`,
                        `Performance score: ${Math.round(perfIndex * 100)}%`
                    ],
                    confidence: decision.confidence,
                    status: 'TESTING'
                };
            }
        }

        /**
         * Record decision in episodic memory.
         */
        recordDecision(timestampSec, proposal, p2Result, performance) {
            this.lastDecision = {
                ...proposal,
                validatorResult: p2Result ? p2Result.validatorResult : 'APPROVED',
                executedAction: p2Result ? p2Result.executedAction : proposal,
                timestamp: Math.round(timestampSec * 1000),
                performance: Number(performance.toFixed(3))
            };

            this.decisionHistory.push(this.lastDecision);
            if (this.decisionHistory.length > this.config.maxWorkingMemoryHistory) {
                this.decisionHistory.shift();
            }
        }

        /**
         * Build compact context for reasoning (Section 12, 30)
         */
        buildCompactContext(movementState, adaptiveState, perfIndex, trendInfo, stability) {
            const m = movementState.movement || {};
            const r = movementState.rhythm || {};
            const basePerf = this.sessionBaseline ? this.sessionBaseline.performance : perfIndex;

            const positiveCount = this.adaptationExperiments.filter(e => e.outcome === 'POSITIVE').length;
            const negativeCount = this.adaptationExperiments.filter(e => e.outcome === 'NEGATIVE').length;

            return {
                current: {
                    movementQuality: Number((m.quality || 0.70).toFixed(2)),
                    rhythmSync: Number((r.sync || 0.75).toFixed(2)),
                    symmetry: Number((m.symmetry || 0.90).toFixed(2)),
                    smoothness: Number((m.smoothness || 0.75).toFixed(2)),
                    consistency: Number((m.consistency || 0.75).toFixed(2)),
                    confidence: Number((movementState.confidence || 0.90).toFixed(2))
                },
                performance: {
                    score: Number(perfIndex.toFixed(2)),
                    trend: trendInfo.trend,
                    trendSlope: trendInfo.slope,
                    stability: Number(stability.toFixed(2)),
                    deltaFromBaseline: Number((perfIndex - basePerf).toFixed(2))
                },
                adaptive: {
                    difficulty: adaptiveState ? adaptiveState.difficulty : 0.50,
                    tempo: adaptiveState ? adaptiveState.tempo : 60,
                    lastAction: adaptiveState && adaptiveState.adaptation ? `${adaptiveState.adaptation.parameter} ${adaptiveState.adaptation.direction}` : 'NONE'
                },
                lastOutcome: this.adaptationExperiments.length > 0 ? this.adaptationExperiments[this.adaptationExperiments.length - 1].outcome : null,
                historySummary: {
                    successfulTempoRange: this.performanceEnvelope.tempo.minSuccessful ? `${this.performanceEnvelope.tempo.minSuccessful}-${this.performanceEnvelope.tempo.maxSuccessful}` : 'Unestablished',
                    recentSuccessfulActions: positiveCount,
                    recentNegativeActions: negativeCount
                }
            };
        }

        /**
         * Memory Retrieval Relevance Ranking (Sections 19, 20, 33)
         * relevance = 0.40 * paramSim + 0.30 * exSim + 0.20 * recency + 0.10 * outcomeRel
         * memoryInfluence = min(0.35, currentConfidence * relevance)
         */
        calculateMemoryRelevance(memoryRecord, currentContext) {
            if (!memoryRecord || !currentContext) return 0;

            const paramSim = 1.0 - Math.min(1.0, Math.abs((memoryRecord.tempo || 60) - (currentContext.tempo || 60)) / 40.0);
            const exSim = (memoryRecord.exerciseType === currentContext.exerciseType) ? 1.0 : 0.5;

            // Exponential Recency Decay: recencyWeight = exp(-lambda * age)
            const age = memoryRecord.ageInSessions !== undefined ? memoryRecord.ageInSessions : 1;
            const recencyWeight = Math.exp(-this.config.memoryDecayLambda * age);

            const outcomeRel = memoryRecord.outcome === 'POSITIVE' ? 1.0 : (memoryRecord.outcome === 'NEUTRAL' ? 0.6 : 0.2);

            const relevance = (0.40 * paramSim) + (0.30 * exSim) + (0.20 * recencyWeight) + (0.10 * outcomeRel);
            return Math.max(0.0, Math.min(1.0, relevance));
        }

        /**
         * Memory Influence Formula with Safety Cap (Section 33)
         */
        calculateMemoryInfluence(relevance, currentConfidence) {
            const rawInfluence = currentConfidence * relevance;
            return Math.min(this.config.maxMemoryInfluence, rawInfluence);
        }

        /**
         * Produce Session Reflection Summary (Sections 18, 22)
         */
        generateSessionSummary() {
            const n = this.performanceHistory.length;
            const startingPerf = n > 0 ? this.performanceHistory[0].performance : 0;
            const endingPerf = n > 0 ? this.performanceHistory[n - 1].performance : 0;
            const avgQuality = n > 0 ? (this.performanceHistory.reduce((a, b) => a + b.movementQuality, 0) / n) : 0;
            const avgSync = n > 0 ? (this.performanceHistory.reduce((a, b) => a + b.rhythmSync, 0) / n) : 0;
            const avgConfidence = n > 0 ? (this.performanceHistory.reduce((a, b) => a + b.confidence, 0) / n) : 0;

            const positiveExp = this.adaptationExperiments.filter(e => e.outcome === 'POSITIVE');
            const negativeExp = this.adaptationExperiments.filter(e => e.outcome === 'NEGATIVE');

            const bestTempo = this.performanceEnvelope.tempo.maxSuccessful || (n > 0 ? this.performanceHistory[n - 1].tempo : 60);

            return {
                sessionId: this.sessionId,
                timestamp: Date.now(),
                startingPerformance: Number(startingPerf.toFixed(2)),
                endingPerformance: Number(endingPerf.toFixed(2)),
                improvement: Number((endingPerf - startingPerf).toFixed(2)),
                averageMovementQuality: Number(avgQuality.toFixed(2)),
                averageRhythmSync: Number(avgSync.toFixed(2)),
                averageConfidence: Number(avgConfidence.toFixed(2)),
                bestTempo: Math.round(bestTempo),
                successfulTempoRange: this.performanceEnvelope.tempo.minSuccessful ? `${this.performanceEnvelope.tempo.minSuccessful}-${this.performanceEnvelope.tempo.maxSuccessful} BPM` : `${Math.round(bestTempo)} BPM`,
                successfulAdaptations: positiveExp.length,
                unsuccessfulAdaptations: negativeExp.length,
                performanceTrend: this.calculateTrend().trend,
                performanceEnvelope: { ...this.performanceEnvelope },
                activeHypothesis: this.activeHypothesis ? { ...this.activeHypothesis } : null,
                importantObservations: [
                    `Rhythm synchronization averaged ${Math.round(avgSync * 100)}% across ${n} evaluation windows.`,
                    `Movement quality maintained at ${Math.round(avgQuality * 100)}%.`,
                    positiveExp.length > 0 ? `Demonstrated positive motor response to ${positiveExp.length} tempo progression(s).` : 'Maintained steady baseline cadence.'
                ]
            };
        }

        // =========================================================================
        // Public State & Contract APIs
        // =========================================================================

        getCurrentState() {
            const n = this.performanceHistory.length;
            const latest = n > 0 ? this.performanceHistory[n - 1] : {};
            const trendInfo = this.calculateTrend();

            return {
                timestamp: Date.now(),
                sessionId: this.sessionId,
                mode: this.stateMachineMode,
                currentState: {
                    movementQuality: latest.movementQuality || 0.70,
                    rhythmSync: latest.rhythmSync || 0.75,
                    consistency: latest.consistency || 0.75,
                    confidence: latest.confidence || 0.90
                },
                performance: {
                    score: latest.performance || 0.75,
                    trend: trendInfo.trend,
                    trendSlope: trendInfo.slope,
                    stability: Number(this.calculateStability().toFixed(2))
                },
                baseline: this.sessionBaseline || { performance: 0.75 },
                lastDecision: this.lastDecision,
                lastOutcome: this.adaptationExperiments.length > 0 ? this.adaptationExperiments[this.adaptationExperiments.length - 1].outcome : null,
                hypothesis: this.activeHypothesis,
                envelope: this.performanceEnvelope,
                eventTimeline: this.getEventTimeline()
            };
        }

        getCurrentReasoning() {
            return {
                lastDecision: this.lastDecision,
                activeHypothesis: this.activeHypothesis,
                trend: this.calculateTrend(),
                stability: this.calculateStability(),
                lastExperiment: this.adaptationExperiments.length > 0 ? this.adaptationExperiments[this.adaptationExperiments.length - 1] : null
            };
        }

        getDecisionHistory() {
            return [...this.decisionHistory];
        }

        getAdaptationExperiments() {
            return [...this.adaptationExperiments];
        }

        getPerformanceEnvelope() {
            return { ...this.performanceEnvelope };
        }
    }

    return {
        NuroAgent,
        NuroActionValidator,
        NuroReasoner,
        NURO_AGENT_CONFIG
    };
}));
