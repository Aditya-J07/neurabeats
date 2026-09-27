/**
 * AdaptiveEngine - Deterministic Adaptive Intelligence Engine (P2)
 * 
 * Implements a closed-loop adaptive controller:
 * Observe -> Movement Intelligence -> Rhythm Intelligence -> Performance State ->
 * Adaptive Decision -> Next Exercise Parameters -> User Performs -> Adapt Again
 * 
 * Strictly deterministic and explainable. No LLM dependency for numerical logic.
 * Zero medical/diagnostic claims: application-level adaptive progression only.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const exports = factory();
        root.AdaptiveEngine = exports.AdaptiveEngine;
        root.ADAPTIVE_ENGINE_CONFIG = exports.ADAPTIVE_ENGINE_CONFIG;
        root.adaptiveEngine = new exports.AdaptiveEngine();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const ADAPTIVE_ENGINE_CONFIG = {
        // Evaluation Timing
        minEvaluationIntervalSec: 1.0,   // Minimum interval between evaluation windows
        historyWindowSize: 12,           // Rolling evaluation history capacity (8 to 20 windows)
        baselineWindowCount: 4,          // Number of initial evaluation windows to lock baseline
        cooldownSeconds: 12.0,           // Cooldown duration after an adaptation change (10 to 30s)
        maxMemoryHistory: 50,            // Bounded decision memory for P3 inspection
        
        // Hysteresis & Anti-Jitter Thresholds
        progressThreshold: 0.82,         // Threshold for PROGRESS decision
        regressThreshold: 0.58,          // Threshold for REGRESS decision
        consecutiveGoodRequired: 3,      // Consecutive windows >= progressThreshold required
        consecutivePoorRequired: 2,      // Consecutive windows < regressThreshold required
        minConfidenceThreshold: 0.45,    // Below this, state = LOW_CONFIDENCE and adaptation freezes
        
        // Adaptation Magnitude & Step Sizes
        maxAdaptationStep: 0.08,         // Maximum change to normalized difficulty per step (0.05-0.10)
        tempoStepBpm: 3,                 // BPM adjustment increment/decrement (3 to 5 BPM)
        romStep: 0.05,                   // ROM target adjustment step
        repsStep: 1,                     // Target repetitions adjustment step
        
        // Safety Guardrails & Bounds
        minBpm: 40,
        maxBpm: 140,
        minRepetitions: 4,
        maxRepetitions: 30,
        minRomTarget: 0.30,
        maxRomTarget: 0.95,
        minDifficulty: 0.10,
        maxDifficulty: 0.95,
        
        // Performance Weights
        weights: {
            movement: 0.45,
            rhythm: 0.35,
            confidence: 0.20
        },
        
        // Initial Target Defaults
        initialDifficulty: 0.50,
        initialTargetReps: 10,
        initialRomTarget: 0.70,
        initialSmoothnessTarget: 0.75,
        initialSymmetryTarget: 0.80,
        initialRhythmSyncTarget: 0.80
    };

    class AdaptiveEngine {
        constructor(config = {}) {
            this.config = {
                ...ADAPTIVE_ENGINE_CONFIG,
                ...config,
                weights: { ...ADAPTIVE_ENGINE_CONFIG.weights, ...(config.weights || {}) }
            };

            this.reset();
        }

        /**
         * Reset engine state, rolling history, baseline, and cooldowns.
         */
        reset() {
            // Rolling evaluation history: [{ timestamp, performance, movementQuality, rhythmSync, confidence }]
            this.performanceHistory = [];

            // Personal Session Baseline
            this.sessionBaseline = null;
            this.baselineCandidates = [];

            // Consecutive window counters for hysteresis
            this.consecutiveGoodWindows = 0;
            this.consecutivePoorWindows = 0;
            this.consecutivePoorRhythmWindows = 0;

            // Cooldown tracking
            this.lastAdaptationTimestamp = -Infinity;
            this.lastEvaluationTimestamp = -Infinity;

            // Multi-dimensional difficulty (0.0 to 1.0)
            this.difficulty = this.config.initialDifficulty;
            this.tempoDifficulty = this.config.initialDifficulty;
            this.movementDifficulty = this.config.initialDifficulty;
            this.enduranceDifficulty = this.config.initialDifficulty;
            this.rhythmDifficulty = this.config.initialDifficulty;

            // Adaptive Targets
            this.targetBpm = 60;
            this.targetRepetitions = this.config.initialTargetReps;
            this.targetRom = this.config.initialRomTarget;
            this.targetSmoothness = this.config.initialSmoothnessTarget;
            this.targetSymmetry = this.config.initialSymmetryTarget;
            this.targetRhythmSync = this.config.initialRhythmSyncTarget;

            // Bounded decision memory for P3 inspection
            this.decisionHistory = [];

            // Last Decision Object
            this.lastDecision = {
                direction: 'MAINTAIN',
                parameter: 'NONE',
                magnitude: 0.0,
                reason: 'System initialized. Observing baseline movement.',
                confidence: 0.50
            };

            // Latest Canonical Adaptive State Object
            this.latestState = this.createDefaultState(performance.now() / 1000.0);
        }

        createDefaultState(timestampSec = 0) {
            return {
                timestamp: Math.round(timestampSec * 1000),
                difficulty: Number(this.difficulty.toFixed(2)),
                tempo: Math.round(this.targetBpm),
                targetRepetitions: Math.round(this.targetRepetitions),
                dimensions: {
                    tempoDifficulty: Number(this.tempoDifficulty.toFixed(2)),
                    movementDifficulty: Number(this.movementDifficulty.toFixed(2)),
                    enduranceDifficulty: Number(this.enduranceDifficulty.toFixed(2)),
                    rhythmDifficulty: Number(this.rhythmDifficulty.toFixed(2))
                },
                movementTarget: {
                    rom: Number(this.targetRom.toFixed(2)),
                    smoothness: Number(this.targetSmoothness.toFixed(2)),
                    symmetry: Number(this.targetSymmetry.toFixed(2))
                },
                rhythmTarget: {
                    sync: Number(this.targetRhythmSync.toFixed(2)),
                    timingErrorMs: Math.round((60000 / Math.max(1, this.targetBpm)) * 0.20)
                },
                adaptation: this.lastDecision,
                performance: {
                    movementQuality: 0.50,
                    rhythmSync: 0.50,
                    confidence: 0.50,
                    overallScore: 0.50,
                    trend: 'STABLE',
                    relativeImprovement: 0.0
                },
                confidence: 0.50,
                recommendation: 'Observing initial movement baseline',
                reason: this.lastDecision.reason
            };
        }

        /**
         * 6. Transparent Performance Score Formulation
         * Weighted composite of movement quality, rhythm sync, and tracking confidence.
         */
        calculatePerformanceScore(movementQuality = 0.5, rhythmSync = 0.5, confidence = 0.5) {
            const w = this.config.weights;
            const rawScore = (w.movement * movementQuality) + (w.rhythm * rhythmSync) + (w.confidence * confidence);
            return Math.max(0.0, Math.min(1.0, rawScore));
        }

        /**
         * 7. Trend and Rolling History Analysis
         * Distinguishes CONSISTENTLY_GOOD, IMPROVING, STABLE, DECLINING, INCONSISTENT, LOW_CONFIDENCE.
         */
        analyzeTrend() {
            if (this.performanceHistory.length < 2) {
                return {
                    rollingPerformance: this.performanceHistory.length > 0 ? this.performanceHistory[0].performance : 0.5,
                    trend: 'STABLE',
                    variance: 0.0,
                    confidenceAvg: this.performanceHistory.length > 0 ? this.performanceHistory[0].confidence : 0.5
                };
            }

            const n = this.performanceHistory.length;
            let sumPerf = 0;
            let sumConf = 0;
            for (let i = 0; i < n; i++) {
                sumPerf += this.performanceHistory[i].performance;
                sumConf += this.performanceHistory[i].confidence;
            }
            const meanPerf = sumPerf / n;
            const meanConf = sumConf / n;

            // Variance
            let sumSqDiff = 0;
            for (let i = 0; i < n; i++) {
                sumSqDiff += Math.pow(this.performanceHistory[i].performance - meanPerf, 2);
            }
            const variance = sumSqDiff / n;

            // Trend direction: Compare recent half vs older half
            const half = Math.floor(n / 2);
            let olderSum = 0;
            let newerSum = 0;
            for (let i = 0; i < half; i++) olderSum += this.performanceHistory[i].performance;
            for (let i = n - half; i < n; i++) newerSum += this.performanceHistory[i].performance;
            const olderAvg = olderSum / half;
            const newerAvg = newerSum / half;
            const delta = newerAvg - olderAvg;

            let trend = 'STABLE';
            if (meanConf < this.config.minConfidenceThreshold) {
                trend = 'LOW_CONFIDENCE';
            } else if (Math.sqrt(variance) > 0.16) {
                trend = 'INCONSISTENT';
            } else if (meanPerf >= this.config.progressThreshold && delta >= -0.02) {
                trend = 'CONSISTENTLY_GOOD';
            } else if (delta > 0.04) {
                trend = 'IMPROVING';
            } else if (delta < -0.04) {
                trend = 'DECLINING';
            }

            return {
                rollingPerformance: meanPerf,
                trend,
                variance,
                confidenceAvg: meanConf
            };
        }

        /**
         * 24. Confidence-Aware Adaptation Score
         * Multi-factor adaptation confidence combining tracking reliability, stability, and history depth.
         */
        calculateAdaptationConfidence(trackingConfidence, variance, historyLength) {
            const historySufficiency = Math.min(1.0, historyLength / this.config.historyWindowSize);
            const stability = Math.max(0.0, 1.0 - Math.min(1.0, Math.sqrt(variance) * 2.5));
            const adaptConf = (0.40 * trackingConfidence) + (0.30 * stability) + (0.30 * historySufficiency);
            return Math.max(0.0, Math.min(1.0, adaptConf));
        }

        /**
         * Core Closed-Loop Evaluation Function
         * Consumes window.latestMovementState from P1.
         * 
         * @param {Object} movementState - Output from MovementIntelligence
         * @param {number} currentBpm - Current metronome BPM from NuroSync / sessionData
         * @param {number|null} timestampSec - Evaluation timestamp
         * @returns {Object} Normalized Adaptive State Object
         */
        evaluate(movementState, currentBpm = 60, timestampSec = null) {
            const now = typeof timestampSec === 'number' && Number.isFinite(timestampSec)
                ? timestampSec
                : (performance.now() / 1000.0);

            if (typeof currentBpm === 'number' && currentBpm >= this.config.minBpm && currentBpm <= this.config.maxBpm) {
                this.targetBpm = currentBpm;
            }

            // Fallback for missing movement state
            if (!movementState) {
                this.latestState = {
                    ...this.latestState,
                    timestamp: Math.round(now * 1000),
                    recommendation: 'Awaiting movement input',
                    reason: 'No valid movement state received'
                };
                return this.latestState;
            }

            // Gating: Enforce evaluation interval to prevent unnecessary CPU churn
            if (this.lastEvaluationTimestamp > 0 && (now - this.lastEvaluationTimestamp) < this.config.minEvaluationIntervalSec) {
                return this.latestState;
            }
            this.lastEvaluationTimestamp = now;

            const trackingConfidence = typeof movementState.confidence === 'number' ? movementState.confidence : 0.0;
            const mQuality = movementState.movement ? (movementState.movement.quality ?? 0.5) : 0.5;
            const rSync = movementState.rhythm ? (movementState.rhythm.sync ?? 0.5) : 0.5;
            const pState = movementState.state || 'ACTIVE';

            // 11. Low Confidence Mode Guard: Freeze adaptation, never penalize camera tracking loss
            if (trackingConfidence < this.config.minConfidenceThreshold || pState === 'LOW_CONFIDENCE') {
                this.consecutiveGoodWindows = 0;
                this.consecutivePoorWindows = 0;
                const decision = {
                    direction: 'FREEZE',
                    parameter: 'NONE',
                    magnitude: 0.0,
                    reason: 'Tracking confidence is insufficient for reliable adaptation',
                    confidence: Number(trackingConfidence.toFixed(2))
                };
                this.lastDecision = decision;
                return this.packageState(now, mQuality, rSync, trackingConfidence, decision, 'LOW_CONFIDENCE', 'Maintain challenge while tracking stabilizes');
            }

            // 12. Idle Handling: User is stationary / resting, do not penalize as poor performance
            if (pState === 'IDLE') {
                const decision = {
                    direction: 'MAINTAIN',
                    parameter: 'NONE',
                    magnitude: 0.0,
                    reason: 'Rest or stationary state detected (IDLE)',
                    confidence: Number(trackingConfidence.toFixed(2))
                };
                this.lastDecision = decision;
                return this.packageState(now, mQuality, rSync, trackingConfidence, decision, 'STABLE', 'Stationary state - maintaining current parameters');
            }

            const temporal = movementState.temporal || null;
            let effQuality = mQuality;
            if (temporal && temporal.motion && typeof temporal.motion.quality === 'number') {
                effQuality = 0.75 * mQuality + 0.25 * temporal.motion.quality;
            }

            // Compute current performance score
            const performanceScore = this.calculatePerformanceScore(effQuality, rSync, trackingConfidence);

            // Append to rolling history
            this.performanceHistory.push({
                timestamp: now,
                performance: performanceScore,
                movementQuality: effQuality,
                rhythmSync: rSync,
                confidence: trackingConfidence,
                temporal: temporal
            });
            while (this.performanceHistory.length > this.config.historyWindowSize) {
                this.performanceHistory.shift();
            }

            // 19. Establish Session Baseline
            if (!this.sessionBaseline && this.baselineCandidates.length < this.config.baselineWindowCount) {
                this.baselineCandidates.push({
                    performance: performanceScore,
                    movementQuality: mQuality,
                    rhythmSync: rSync,
                    confidence: trackingConfidence
                });
                if (this.baselineCandidates.length >= this.config.baselineWindowCount) {
                    let bPerf = 0, bMove = 0, bRhythm = 0, bConf = 0;
                    for (const c of this.baselineCandidates) {
                        bPerf += c.performance;
                        bMove += c.movementQuality;
                        bRhythm += c.rhythmSync;
                        bConf += c.confidence;
                    }
                    const bCount = this.baselineCandidates.length;
                    this.sessionBaseline = {
                        performance: bPerf / bCount,
                        movementQuality: bMove / bCount,
                        rhythmSync: bRhythm / bCount,
                        confidence: bConf / bCount
                    };
                }
            }

            // Analyze rolling trends and confidence
            const { rollingPerformance, trend, variance } = this.analyzeTrend();
            const adaptConfidence = this.calculateAdaptationConfidence(trackingConfidence, variance, this.performanceHistory.length);

            // 18. Cooldown Enforcement
            const timeSinceLastAdapt = now - this.lastAdaptationTimestamp;
            const inCooldown = timeSinceLastAdapt < this.config.cooldownSeconds;

            let decision = null;
            let recommendation = 'Maintain current difficulty';

            if (inCooldown) {
                const cooldownRemain = Math.ceil(this.config.cooldownSeconds - timeSinceLastAdapt);
                decision = {
                    direction: 'MAINTAIN',
                    parameter: 'NONE',
                    magnitude: 0.0,
                    reason: `Adaptation cooldown active (${cooldownRemain}s remaining)`,
                    confidence: Number(adaptConfidence.toFixed(2))
                };
                recommendation = `Observing response to recent adjustment (${cooldownRemain}s cooldown)`;
            } else {
                // Evaluate adaptation rules with Hysteresis & Anti-Jitter
                decision = this.evaluateRules(performanceScore, rollingPerformance, trend, mQuality, rSync, adaptConfidence, now);
                recommendation = this.deriveRecommendation(decision);
            }

            this.lastDecision = decision;

            // 22. Record in bounded session memory for P3
            this.recordDecision(now, decision, performanceScore);

            return this.packageState(now, mQuality, rSync, trackingConfidence, decision, trend, recommendation);
        }

        /**
         * 8, 9, 10, 15, 17. Deterministic Multi-Dimensional Adaptation Rules with Hysteresis
         */
        evaluateRules(currentPerformance, rollingPerformance, trend, mQuality, rSync, adaptConfidence, now) {
            // Require sufficient rolling history before making difficulty changes
            if (this.performanceHistory.length < Math.min(3, this.config.baselineWindowCount)) {
                return {
                    direction: 'MAINTAIN',
                    parameter: 'NONE',
                    magnitude: 0.0,
                    reason: 'Establishing session movement baseline',
                    confidence: Number(adaptConfidence.toFixed(2))
                };
            }

            // 1. Multi-Dimensional Decoupled Adaptation: Good movement + poor rhythm -> adapt rhythm/tempo
            if (mQuality >= 0.75 && rSync < 0.60) {
                this.consecutivePoorRhythmWindows++;
                this.consecutiveGoodWindows = 0;
                this.consecutivePoorWindows = 0;

                if (this.consecutivePoorRhythmWindows >= this.config.consecutivePoorRequired) {
                    this.consecutivePoorRhythmWindows = 0;
                    this.lastAdaptationTimestamp = now;

                    const previousBpm = this.targetBpm;
                    this.targetBpm = Math.max(this.config.minBpm, this.targetBpm - this.config.tempoStepBpm);
                    this.tempoDifficulty = Math.max(this.config.minDifficulty, this.tempoDifficulty - this.config.maxAdaptationStep);
                    this.difficulty = this.recalculateCompositeDifficulty();

                    return {
                        direction: 'REGRESS',
                        parameter: 'TEMPO',
                        magnitude: Number(this.config.maxAdaptationStep.toFixed(2)),
                        adjustedBpm: this.targetBpm,
                        previousBpm: previousBpm,
                        reason: 'Rhythm synchronization declined across recent evaluation windows',
                        confidence: Number(adaptConfidence.toFixed(2))
                    };
                }

                return {
                    direction: 'MAINTAIN',
                    parameter: 'NONE',
                    magnitude: 0.0,
                    reason: `Rhythm difficulty adjustment pending (${this.consecutivePoorRhythmWindows}/${this.config.consecutivePoorRequired} windows)`,
                    confidence: Number(adaptConfidence.toFixed(2))
                };
            }

            // 2. PROGRESS RULE
            if (currentPerformance >= this.config.progressThreshold) {
                this.consecutiveGoodWindows++;
                this.consecutivePoorWindows = 0;
                this.consecutivePoorRhythmWindows = 0;

                if (this.consecutiveGoodWindows >= this.config.consecutiveGoodRequired) {
                    this.consecutiveGoodWindows = 0;
                    this.lastAdaptationTimestamp = now;

                    // Multi-Dimensional Selector: Determine optimal progression parameter
                    if (rSync >= 0.82 && this.targetBpm < this.config.maxBpm && this.rhythmDifficulty <= this.movementDifficulty) {
                        const previousBpm = this.targetBpm;
                        this.targetBpm = Math.min(this.config.maxBpm, this.targetBpm + this.config.tempoStepBpm);
                        this.tempoDifficulty = Math.min(this.config.maxDifficulty, this.tempoDifficulty + this.config.maxAdaptationStep);
                        this.difficulty = this.recalculateCompositeDifficulty();
                        return {
                            direction: 'PROGRESS',
                            parameter: 'TEMPO',
                            magnitude: Number(this.config.maxAdaptationStep.toFixed(2)),
                            adjustedBpm: this.targetBpm,
                            previousBpm: previousBpm,
                            reason: 'Consistent high-quality movement and rhythm synchronization',
                            confidence: Number(adaptConfidence.toFixed(2))
                        };
                    } else if (mQuality >= 0.80 && this.targetRom < this.config.maxRomTarget) {
                        this.targetRom = Math.min(this.config.maxRomTarget, this.targetRom + this.config.romStep);
                        this.movementDifficulty = Math.min(this.config.maxDifficulty, this.movementDifficulty + this.config.maxAdaptationStep);
                        this.difficulty = this.recalculateCompositeDifficulty();
                        return {
                            direction: 'PROGRESS',
                            parameter: 'MOVEMENT',
                            magnitude: Number(this.config.maxAdaptationStep.toFixed(2)),
                            reason: 'Strong kinematic stability, advancing range of motion challenge',
                            confidence: Number(adaptConfidence.toFixed(2))
                        };
                    } else if (this.targetRepetitions < this.config.maxRepetitions) {
                        this.targetRepetitions = Math.min(this.config.maxRepetitions, this.targetRepetitions + this.config.repsStep);
                        this.enduranceDifficulty = Math.min(this.config.maxDifficulty, this.enduranceDifficulty + this.config.maxAdaptationStep);
                        this.difficulty = this.recalculateCompositeDifficulty();
                        return {
                            direction: 'PROGRESS',
                            parameter: 'REPETITIONS',
                            magnitude: Number(this.config.maxAdaptationStep.toFixed(2)),
                            reason: 'Sustained motor consistency, increasing repetition endurance target',
                            confidence: Number(adaptConfidence.toFixed(2))
                        };
                    }
                }

                return {
                    direction: 'MAINTAIN',
                    parameter: 'NONE',
                    magnitude: 0.0,
                    reason: `High performance sustained (${this.consecutiveGoodWindows}/${this.config.consecutiveGoodRequired} windows required for progression)`,
                    confidence: Number(adaptConfidence.toFixed(2))
                };
            }

            // 3. REGRESS / RECOVERY RULE
            if (currentPerformance < this.config.regressThreshold || trend === 'DECLINING') {
                this.consecutivePoorWindows++;
                this.consecutiveGoodWindows = 0;
                this.consecutivePoorRhythmWindows = 0;

                if (this.consecutivePoorWindows >= this.config.consecutivePoorRequired) {
                    this.consecutivePoorWindows = 0;
                    this.lastAdaptationTimestamp = now;

                    if (rSync < 0.60 && this.targetBpm > this.config.minBpm) {
                        const previousBpm = this.targetBpm;
                        this.targetBpm = Math.max(this.config.minBpm, this.targetBpm - this.config.tempoStepBpm);
                        this.tempoDifficulty = Math.max(this.config.minDifficulty, this.tempoDifficulty - this.config.maxAdaptationStep);
                        this.difficulty = this.recalculateCompositeDifficulty();
                        return {
                            direction: 'REGRESS',
                            parameter: 'TEMPO',
                            magnitude: Number(this.config.maxAdaptationStep.toFixed(2)),
                            adjustedBpm: this.targetBpm,
                            previousBpm: previousBpm,
                            reason: 'Rhythm synchronization declined across recent evaluation windows',
                            confidence: Number(adaptConfidence.toFixed(2))
                        };
                    } else if (mQuality < 0.60 && this.targetRom > this.config.minRomTarget) {
                        this.targetRom = Math.max(this.config.minRomTarget, this.targetRom - this.config.romStep);
                        this.movementDifficulty = Math.max(this.config.minDifficulty, this.movementDifficulty - this.config.maxAdaptationStep);
                        this.difficulty = this.recalculateCompositeDifficulty();
                        return {
                            direction: 'REGRESS',
                            parameter: 'MOVEMENT',
                            magnitude: Number(this.config.maxAdaptationStep.toFixed(2)),
                            reason: 'Kinematic quality declined, reducing range of motion target for motor recovery',
                            confidence: Number(adaptConfidence.toFixed(2))
                        };
                    } else if (this.targetRepetitions > this.config.minRepetitions) {
                        this.targetRepetitions = Math.max(this.config.minRepetitions, this.targetRepetitions - this.config.repsStep);
                        this.enduranceDifficulty = Math.max(this.config.minDifficulty, this.enduranceDifficulty - this.config.maxAdaptationStep);
                        this.difficulty = this.recalculateCompositeDifficulty();
                        return {
                            direction: 'REGRESS',
                            parameter: 'REPETITIONS',
                            magnitude: Number(this.config.maxAdaptationStep.toFixed(2)),
                            reason: 'Performance struggle detected, reducing repetition target to prevent fatigue',
                            confidence: Number(adaptConfidence.toFixed(2))
                        };
                    }
                }

                return {
                    direction: 'MAINTAIN',
                    parameter: 'NONE',
                    magnitude: 0.0,
                    reason: `Performance below target zone (${this.consecutivePoorWindows}/${this.config.consecutivePoorRequired} windows for recovery regression)`,
                    confidence: Number(adaptConfidence.toFixed(2))
                };
            }

            // 4. MAINTAIN (Dead Zone between regressThreshold and progressThreshold)
            this.consecutiveGoodWindows = 0;
            this.consecutivePoorWindows = 0;
            this.consecutivePoorRhythmWindows = 0;
            return {
                direction: 'MAINTAIN',
                parameter: 'NONE',
                magnitude: 0.0,
                reason: 'Performance is stable within target zone',
                confidence: Number(adaptConfidence.toFixed(2))
            };
        }

        recalculateCompositeDifficulty() {
            const comp = (0.35 * this.tempoDifficulty) + (0.35 * this.movementDifficulty) + (0.15 * this.enduranceDifficulty) + (0.15 * this.rhythmDifficulty);
            return Math.max(this.config.minDifficulty, Math.min(this.config.maxDifficulty, comp));
        }

        deriveRecommendation(decision) {
            if (decision.direction === 'PROGRESS') {
                return decision.parameter === 'TEMPO' 
                    ? `Tempo advanced to ${this.targetBpm} BPM`
                    : `Exercise target increased (${decision.parameter})`;
            } else if (decision.direction === 'REGRESS') {
                return decision.parameter === 'TEMPO'
                    ? `Tempo eased to ${this.targetBpm} BPM for rhythm recovery`
                    : `Exercise target adjusted for recovery (${decision.parameter})`;
            } else if (decision.direction === 'FREEZE') {
                return 'Tracking confidence low: maintaining stable challenge';
            }
            return 'Steady performance: maintaining target challenge';
        }

        recordDecision(timestampSec, decision, performanceScore) {
            this.decisionHistory.push({
                timestamp: Math.round(timestampSec * 1000),
                decision: { ...decision },
                difficulty: Number(this.difficulty.toFixed(2)),
                tempo: Math.round(this.targetBpm),
                performance: Number(performanceScore.toFixed(2))
            });

            while (this.decisionHistory.length > this.config.maxMemoryHistory) {
                this.decisionHistory.shift();
            }
        }

        packageState(nowSec, mQuality, rSync, trackingConfidence, decision, trend, recommendation) {
            const performanceScore = this.calculatePerformanceScore(mQuality, rSync, trackingConfidence);
            const baselineScore = this.sessionBaseline ? this.sessionBaseline.performance : performanceScore;
            const relImprovement = performanceScore - baselineScore;

            this.latestState = {
                timestamp: Math.round(nowSec * 1000),
                difficulty: Number(this.difficulty.toFixed(2)),
                tempo: Math.round(this.targetBpm),
                targetRepetitions: Math.round(this.targetRepetitions),
                dimensions: {
                    tempoDifficulty: Number(this.tempoDifficulty.toFixed(2)),
                    movementDifficulty: Number(this.movementDifficulty.toFixed(2)),
                    enduranceDifficulty: Number(this.enduranceDifficulty.toFixed(2)),
                    rhythmDifficulty: Number(this.rhythmDifficulty.toFixed(2))
                },
                movementTarget: {
                    rom: Number(this.targetRom.toFixed(2)),
                    smoothness: Number(this.targetSmoothness.toFixed(2)),
                    symmetry: Number(this.targetSymmetry.toFixed(2))
                },
                rhythmTarget: {
                    sync: Number(this.targetRhythmSync.toFixed(2)),
                    timingErrorMs: Math.round((60000 / Math.max(1, this.targetBpm)) * 0.20)
                },
                adaptation: decision,
                performance: {
                    movementQuality: Number(mQuality.toFixed(2)),
                    rhythmSync: Number(rSync.toFixed(2)),
                    confidence: Number(trackingConfidence.toFixed(2)),
                    overallScore: Number(performanceScore.toFixed(2)),
                    trend: trend,
                    relativeImprovement: Number(relImprovement.toFixed(2))
                },
                confidence: decision.confidence,
                recommendation: recommendation,
                reason: decision.reason
            };

            return this.latestState;
        }

        // =========================================================================
        // 31. Future P3 Contract: Public Read APIs for Nuro Agent & Session Memory
        // =========================================================================

        getCurrentState() {
            return this.latestState;
        }

        getHistory() {
            return [...this.decisionHistory];
        }

        getLastDecision() {
            return this.lastDecision;
        }

        explainLastDecision() {
            if (!this.lastDecision) return 'No adaptation decisions recorded.';
            return `[${this.lastDecision.direction}] ${this.lastDecision.reason} (Parameter: ${this.lastDecision.parameter}, Confidence: ${Math.round((this.lastDecision.confidence || 0) * 100)}%)`;
        }

        getBaseLine() {
            return this.sessionBaseline;
        }

        /**
         * Authoritative P2 Execution Gateway for P5 Agent Proposals
         * 
         * P5 suggests -> P2 validates -> APPROVE / CLAMP / REJECT / FREEZE -> Executes if valid
         */
        validateAndExecuteProposal(proposal, currentConfidence = 1.0, personalEnvelope = null, nowSec = null) {
            const now = nowSec !== null ? nowSec : (performance.now() / 1000.0);
            
            // 1. Gating: Low Tracking Confidence -> FREEZE
            if (currentConfidence < this.config.minConfidenceThreshold) {
                return {
                    validatorResult: 'FROZEN',
                    reason: `Tracking confidence (${currentConfidence.toFixed(2)}) is below safety threshold (${this.config.minConfidenceThreshold}). Adaptation frozen.`,
                    executedAction: {
                        direction: 'FREEZE',
                        parameter: 'NONE',
                        previousBpm: this.targetBpm,
                        executedBpm: this.targetBpm,
                        magnitude: 0
                    }
                };
            }

            // 2. Cooldown Enforcement
            const timeSinceLastAdapt = now - this.lastAdaptationTimestamp;
            if (timeSinceLastAdapt < this.config.cooldownSeconds && proposal && proposal.action !== 'MAINTAIN') {
                const cooldownRemain = Math.ceil(this.config.cooldownSeconds - timeSinceLastAdapt);
                return {
                    validatorResult: 'REJECTED',
                    reason: `Adaptation cooldown active (${cooldownRemain}s remaining). Proposal rejected.`,
                    executedAction: {
                        direction: 'MAINTAIN',
                        parameter: 'NONE',
                        previousBpm: this.targetBpm,
                        executedBpm: this.targetBpm,
                        magnitude: 0
                    }
                };
            }

            if (!proposal || typeof proposal !== 'object') {
                return {
                    validatorResult: 'REJECTED',
                    reason: 'Invalid proposal object.',
                    executedAction: { direction: 'MAINTAIN', parameter: 'NONE', previousBpm: this.targetBpm, executedBpm: this.targetBpm, magnitude: 0 }
                };
            }

            // 3. Schema & Target Validation
            const VALID_ACTIONS = new Set([
                'INCREASE_TEMPO', 'DECREASE_TEMPO', 'MAINTAIN', 
                'INCREASE_MOVEMENT_TARGET', 'DECREASE_MOVEMENT_TARGET', 
                'REQUEST_MORE_OBSERVATION', 'OBSERVE', 'RECOVER'
            ]);
            const VALID_TARGETS = new Set(['TEMPO', 'MOVEMENT', 'REPETITIONS', 'ROM', 'NONE']);

            const target = (proposal.target || 'TEMPO').toString().toUpperCase();
            const action = (proposal.action || 'MAINTAIN').toString().toUpperCase();

            if (!VALID_ACTIONS.has(action)) {
                return {
                    validatorResult: 'REJECTED',
                    reason: `Unrecognized action: ${action}. Proposal rejected.`,
                    executedAction: { direction: 'MAINTAIN', parameter: 'NONE', previousBpm: this.targetBpm, executedBpm: this.targetBpm, magnitude: 0 }
                };
            }
            if (!VALID_TARGETS.has(target)) {
                return {
                    validatorResult: 'REJECTED',
                    reason: `Unrecognized target: ${target}. Proposal rejected.`,
                    executedAction: { direction: 'MAINTAIN', parameter: 'NONE', previousBpm: this.targetBpm, executedBpm: this.targetBpm, magnitude: 0 }
                };
            }

            // Check if explicit requested BPM is valid
            const explicitBpm = proposal.requestedBpm !== undefined ? proposal.requestedBpm : proposal.requested_bpm;
            if (explicitBpm !== undefined) {
                const parsedDirect = Number(explicitBpm);
                if (!Number.isFinite(parsedDirect) || isNaN(parsedDirect)) {
                    return {
                        validatorResult: 'REJECTED',
                        reason: 'Requested BPM must be a finite numerical value.',
                        executedAction: { direction: 'MAINTAIN', parameter: 'NONE', previousBpm: this.targetBpm, executedBpm: this.targetBpm, magnitude: 0 }
                    };
                }
            }

            if (action === 'MAINTAIN' || target === 'NONE' || action === 'OBSERVE' || action === 'REQUEST_MORE_OBSERVATION') {
                return {
                    validatorResult: 'APPROVED',
                    reason: proposal.reason || 'Maintained steady challenge.',
                    executedAction: {
                        direction: 'MAINTAIN',
                        parameter: 'NONE',
                        previousBpm: this.targetBpm,
                        executedBpm: this.targetBpm,
                        magnitude: 0
                    }
                };
            }

            // 4. Parameter-Specific Clamping & Execution (TEMPO)
            if (target === 'TEMPO') {
                const previousBpm = Number.isFinite(this.targetBpm) ? this.targetBpm : 60.0;
                let rawRequestedDelta = 0;
                let direction = 'MAINTAIN';

                // Parse and sanitize magnitude
                let magnitude = 1.0;
                if (typeof proposal.magnitude === 'number' && Number.isFinite(proposal.magnitude) && !isNaN(proposal.magnitude)) {
                    magnitude = Math.abs(proposal.magnitude);
                } else if (typeof proposal.magnitude === 'string') {
                    const parsed = parseFloat(proposal.magnitude);
                    magnitude = (Number.isFinite(parsed) && !isNaN(parsed)) ? Math.abs(parsed) : 1.0;
                }

                if (action === 'INCREASE_TEMPO') {
                    direction = 'PROGRESS';
                    rawRequestedDelta = magnitude > 1.0 ? magnitude : Math.max(1.0, Math.round(magnitude * 50));
                } else if (action === 'DECREASE_TEMPO') {
                    direction = 'REGRESS';
                    rawRequestedDelta = magnitude > 1.0 ? -magnitude : -Math.max(1.0, Math.round(magnitude * 50));
                }

                // If explicit BPM was given, compute delta relative to previousBpm
                if (explicitBpm !== undefined) {
                    const reqVal = Number(explicitBpm);
                    rawRequestedDelta = reqVal - previousBpm;
                    direction = rawRequestedDelta >= 0 ? 'PROGRESS' : 'REGRESS';
                }

                const requestedBpm = previousBpm + rawRequestedDelta;
                let clampedDelta = rawRequestedDelta;
                let clampReason = null;

                // Max step bound: max 5 BPM per intervention
                const maxStep = 5.0;
                if (Math.abs(clampedDelta) > maxStep) {
                    clampedDelta = Math.sign(clampedDelta) * maxStep;
                    clampReason = `Requested step (${rawRequestedDelta > 0 ? '+' : ''}${rawRequestedDelta.toFixed(1)} BPM) clamped to maximum allowed step (±${maxStep} BPM).`;
                }

                let candidateBpm = previousBpm + clampedDelta;

                // Safety boundaries [minBpm, maxBpm]
                if (candidateBpm < this.config.minBpm) {
                    candidateBpm = this.config.minBpm;
                    clampReason = (clampReason ? clampReason + ' ' : '') + `Clamped to minimum safety bound (${this.config.minBpm} BPM).`;
                } else if (candidateBpm > this.config.maxBpm) {
                    candidateBpm = this.config.maxBpm;
                    clampReason = (clampReason ? clampReason + ' ' : '') + `Clamped to maximum safety bound (${this.config.maxBpm} BPM).`;
                }

                // Personal envelope bounds check
                if (personalEnvelope && direction === 'PROGRESS') {
                    const envMax = personalEnvelope.stable_bpm_max || personalEnvelope.stableBpmMax;
                    if (envMax && candidateBpm > envMax + 2) {
                        candidateBpm = Math.min(candidateBpm, envMax + 2);
                        clampReason = (clampReason ? clampReason + ' ' : '') + `Restricted by patient stable envelope ceiling (${envMax} BPM).`;
                    }
                }

                const executedBpm = candidateBpm;
                const validatorResult = (executedBpm === requestedBpm) ? 'APPROVED' : 'CLAMPED';

                // Execute modification
                this.targetBpm = executedBpm;
                this.lastAdaptationTimestamp = now;
                this.tempoDifficulty = Math.max(this.config.minDifficulty, Math.min(this.config.maxDifficulty, (executedBpm - this.config.minBpm) / (this.config.maxBpm - this.config.minBpm)));
                this.difficulty = this.recalculateCompositeDifficulty();

                const executedAction = {
                    direction: direction,
                    parameter: 'TEMPO',
                    previousBpm: previousBpm,
                    requestedBpm: requestedBpm,
                    executedBpm: executedBpm,
                    magnitude: Math.abs(executedBpm - previousBpm),
                    reason: proposal.reason || 'P5 proposed adaptation executed.',
                    clampReason: clampReason,
                    confidence: proposal.confidence || currentConfidence
                };

                this.lastDecision = {
                    direction: direction,
                    parameter: 'TEMPO',
                    magnitude: Math.abs(executedBpm - previousBpm) / 50.0,
                    adjustedBpm: executedBpm,
                    previousBpm: previousBpm,
                    reason: executedAction.reason,
                    confidence: executedAction.confidence
                };

                this.recordDecision(now, this.lastDecision, this.latestState ? this.latestState.performance.overallScore : 0.8);

                return {
                    validatorResult: validatorResult,
                    reason: clampReason || 'Proposal approved and executed.',
                    executedAction: executedAction
                };
            }

            return {
                validatorResult: 'APPROVED',
                reason: 'Non-tempo adaptation approved.',
                executedAction: {
                    direction: 'MAINTAIN',
                    parameter: target,
                    previousBpm: this.targetBpm,
                    executedBpm: this.targetBpm,
                    magnitude: 0
                }
            };
        }
    }

    return {
        AdaptiveEngine,
        ADAPTIVE_ENGINE_CONFIG
    };
}));
