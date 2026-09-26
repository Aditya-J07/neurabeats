/**
 * Leg Tracker ML & Dual-Layer Sensor Fusion Engine for NeuroBeat
 * 
 * Architecture:
 * - Tier 1: Base Motion Gater (Pixel Differencing on 160x120 canvas)
 *   Diff score < 12 -> Idle (skips heavy pose inference, saving CPU/GPU)
 * - Tier 2: Leg Kinematics ML Model (MediaPipe Lower-Limb Estimation)
 *   When Tier 1 confirms movement, performs anatomical tracking:
 *   - Identifies Left Leg vs. Right Leg movement
 *   - Detects foot strikes / step events
 *   - Calculates Bilateral Gait Symmetry Index:
 *     (1 - |LeftDuration - RightDuration| / max(LeftDuration, RightDuration)) * 100
 *   - Calculates Audio Beat Synchronization Accuracy against Tone.js:
 *     delta < 50ms -> 100%, delta < 150ms -> 80%, delta > 250ms -> Out of sync
 * - Fail-Safe Fallback:
 *   Gracefully degrades to lightweight motion simulation if frames drop or confidence < 0.5.
 *   Ensures Tone.js audio never glitches or stutters.
 */

const MOTION_THRESHOLD = 12; // From Tier 1 pixel differencing

class LegKinematicsTracker {
    constructor() {
        this.videoElement = null;
        this.canvasElement = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.poseModel = null;
        this.isModelLoaded = false;
        this.isProcessing = false;
        
        // Landmark cache & kinematics state
        this.latestResults = null;
        this.lastLeftStepTime = 0;
        this.lastRightStepTime = 0;
        this.leftDuration = 0;
        this.rightDuration = 0;
        this.leftStepsCount = 0;
        this.rightStepsCount = 0;
        this.symmetryHistory = [];
        this.averageSymmetry = 100;
        this.minStepCooldown = 350; // ms
        
        // Vertical velocity tracking for peak foot strike detection
        this.prevLeftAnkleY = null;
        this.prevRightAnkleY = null;
        this.prevLeftKneeY = null;
        this.prevRightKneeY = null;
        this.prevTime = null;
        this.leftVelocity = 0;
        this.rightVelocity = 0;
        this.prevLeftVelocity = 0;
        this.prevRightVelocity = 0;
        
        // Fallback state
        this.fallbackCounter = 0;
        this.fallbackLastSide = 'LEFT';
        this.fallbackLastTime = 0;
        
        // Bindings
        this.handlePoseResults = this.handlePoseResults.bind(this);
    }

    async initialize(videoEl, canvasEl, overlayCanvasEl) {
        this.videoElement = videoEl || document.getElementById('cameraFeed');
        this.canvasElement = canvasEl || document.getElementById('cameraCanvas');
        this.overlayCanvas = overlayCanvasEl || document.getElementById('cameraOverlayCanvas');
        if (this.overlayCanvas) {
            this.overlayCtx = this.overlayCanvas.getContext('2d');
        }

        // Initialize MediaPipe Pose if available in global window
        if (typeof Pose !== 'undefined') {
            try {
                this.poseModel = new Pose({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
                });
                this.poseModel.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.poseModel.onResults(this.handlePoseResults);
                this.isModelLoaded = true;
                console.log('Tier 2 Leg Kinematics ML Model (MediaPipe) initialized.');
            } catch (err) {
                console.warn('MediaPipe initialization warning (will use resilient fallback):', err);
            }
        }
    }

    handlePoseResults(results) {
        this.latestResults = results;
        this.isProcessing = false;
    }

    /**
     * Tier 2: Estimates leg landmarks, joint angles, and vertical motion
     */
    async estimateLegs(videoEl) {
        if (!videoEl || videoEl.readyState < 2) return null;

        // If MediaPipe is active, dispatch async inference
        if (this.isModelLoaded && this.poseModel && !this.isProcessing) {
            this.isProcessing = true;
            try {
                await this.poseModel.send({ image: videoEl });
            } catch (e) {
                this.isProcessing = false;
            }
        }

        const now = performance.now();
        const results = this.latestResults;

        if (results && results.poseLandmarks && results.poseLandmarks.length >= 33) {
            const lm = results.poseLandmarks;
            const leftHip = lm[23];
            const rightHip = lm[24];
            const leftKnee = lm[25];
            const rightKnee = lm[26];
            const leftAnkle = lm[27];
            const rightAnkle = lm[28];
            const leftFoot = lm[31];
            const rightFoot = lm[32];

            const leftConf = ((leftHip?.visibility || 0.8) + (leftKnee?.visibility || 0.8) + (leftAnkle?.visibility || 0.8)) / 3;
            const rightConf = ((rightHip?.visibility || 0.8) + (rightKnee?.visibility || 0.8) + (rightAnkle?.visibility || 0.8)) / 3;
            const avgConf = (leftConf + rightConf) / 2;

            // Compute knee joint flexion angles
            const leftAngle = this.calculateAngle(leftHip, leftKnee, leftAnkle);
            const rightAngle = this.calculateAngle(rightHip, rightKnee, rightAnkle);

            // Ankle vertical displacements normalized by hip distance
            const hipDist = Math.hypot(
                (leftHip ? leftHip.x : 0) - (rightHip ? rightHip.x : 0),
                (leftHip ? leftHip.y : 0) - (rightHip ? rightHip.y : 0)
            ) || 0.2;

            const normLeftAnkleY = (leftAnkle?.y || 0) / hipDist;
            const normRightAnkleY = (rightAnkle?.y || 0) / hipDist;

            let stepDetected = false;
            let stepLeg = 'none';

            if (this.prevTime !== null) {
                const dt = Math.max(0.01, (now - this.prevTime) / 1000);
                this.leftVelocity = (normLeftAnkleY - (this.prevLeftAnkleY || normLeftAnkleY)) / dt;
                this.rightVelocity = (normRightAnkleY - (this.prevRightAnkleY || normRightAnkleY)) / dt;

                // Foot strike detection (vertical downward velocity peaks then decelerates into stance)
                if (this.prevLeftVelocity > 0.65 && this.leftVelocity <= 0.65) {
                    if (now - this.lastLeftStepTime > this.minStepCooldown) {
                        stepDetected = true;
                        stepLeg = 'left';
                    }
                }

                if (this.prevRightVelocity > 0.65 && this.rightVelocity <= 0.65) {
                    if (now - this.lastRightStepTime > this.minStepCooldown) {
                        if (stepDetected) {
                            stepLeg = 'both';
                        } else {
                            stepDetected = true;
                            stepLeg = 'right';
                        }
                    }
                }

                this.prevLeftVelocity = this.leftVelocity;
                this.prevRightVelocity = this.rightVelocity;
            }

            this.prevLeftAnkleY = normLeftAnkleY;
            this.prevRightAnkleY = normRightAnkleY;
            this.prevTime = now;

            // Draw visual skeleton if overlay canvas available
            this.drawSkeletonOverlay(lm);

            return {
                leftLeg: {
                    angle: leftAngle || 170,
                    kneeY: leftKnee?.y || 0,
                    ankleY: leftAnkle?.y || 0,
                    isStepping: stepLeg === 'left' || stepLeg === 'both' || Math.abs(this.leftVelocity) > 0.5,
                    confidence: leftConf
                },
                rightLeg: {
                    angle: rightAngle || 170,
                    kneeY: rightKnee?.y || 0,
                    ankleY: rightAnkle?.y || 0,
                    isStepping: stepLeg === 'right' || stepLeg === 'both' || Math.abs(this.rightVelocity) > 0.5,
                    confidence: rightConf
                },
                stepDetected: stepDetected,
                stepLeg: stepLeg,
                confidence: avgConf
            };
        }

        // Return null if landmarks not yet resolved
        return null;
    }

    calculateAngle(p1, p2, p3) {
        if (!p1 || !p2 || !p3) return null;
        const v1x = p1.x - p2.x;
        const v1y = p1.y - p2.y;
        const v2x = p3.x - p2.x;
        const v2y = p3.y - p2.y;
        const dot = v1x * v2x + v1y * v2y;
        const mag1 = Math.hypot(v1x, v1y);
        const mag2 = Math.hypot(v2x, v2y);
        if (mag1 === 0 || mag2 === 0) return null;
        const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
        return Math.round(Math.acos(cosAngle) * (180 / Math.PI));
    }

    drawSkeletonOverlay(landmarks) {
        if (!this.overlayCanvas || !this.overlayCtx) return;
        const w = this.overlayCanvas.width;
        const h = this.overlayCanvas.height;
        const ctx = this.overlayCtx;

        ctx.clearRect(0, 0, w, h);

        const legConnections = [
            [23, 24], // Hip to hip
            [23, 25], [25, 27], [27, 31], // Left leg: hip -> knee -> ankle -> foot
            [24, 26], [26, 28], [28, 32]  // Right leg: hip -> knee -> ankle -> foot
        ];

        ctx.lineWidth = 3;
        ctx.strokeStyle = '#01aac5';
        ctx.fillStyle = '#10b981';

        legConnections.forEach(([i, j]) => {
            const p1 = landmarks[i];
            const p2 = landmarks[j];
            if (p1 && p2 && (p1.visibility || 1) > 0.3 && (p2.visibility || 1) > 0.3) {
                ctx.beginPath();
                ctx.moveTo(p1.x * w, p1.y * h);
                ctx.lineTo(p2.x * w, p2.y * h);
                ctx.stroke();
            }
        });

        [23, 24, 25, 26, 27, 28, 31, 32].forEach(idx => {
            const p = landmarks[idx];
            if (p && (p.visibility || 1) > 0.3) {
                ctx.beginPath();
                ctx.arc(p.x * w, p.y * h, idx >= 27 ? 5 : 4, 0, 2 * Math.PI);
                ctx.fill();
            }
        });
    }

    /**
     * Fail-Safe Fallback: Lightweight motion calculation from diffScore
     */
    useLightweightFallback(diffScore) {
        const now = performance.now();
        if (diffScore >= MOTION_THRESHOLD) {
            // Periodic cadence simulated from movement bursts
            if (now - this.fallbackLastTime > 600) {
                this.fallbackLastTime = now;
                this.fallbackLastSide = this.fallbackLastSide === 'LEFT' ? 'RIGHT' : 'LEFT';
                
                const fallbackResults = {
                    leftLeg: {
                        angle: 165,
                        isStepping: this.fallbackLastSide === 'LEFT',
                        confidence: 0.6
                    },
                    rightLeg: {
                        angle: 165,
                        isStepping: this.fallbackLastSide === 'RIGHT',
                        confidence: 0.6
                    },
                    stepDetected: true,
                    stepLeg: this.fallbackLastSide.toLowerCase(),
                    confidence: 0.6
                };
                this.handleLegStepEvent(fallbackResults);
                return;
            }
        }

        this.updateLegUI({
            status: diffScore >= MOTION_THRESHOLD ? 'Active Movement' : 'Idle / Standing Still',
            activeLeg: diffScore >= MOTION_THRESHOLD ? 'Both' : 'None',
            leftConfidence: diffScore >= MOTION_THRESHOLD ? 0.5 : 0,
            rightConfidence: diffScore >= MOTION_THRESHOLD ? 0.5 : 0
        });
    }

    /**
     * Step event & kinematics processor
     */
    handleLegStepEvent(legResults) {
        const now = performance.now();
        const { stepDetected, stepLeg, leftLeg, rightLeg } = legResults;

        let activeLeg = 'None';
        if (leftLeg?.isStepping && rightLeg?.isStepping) activeLeg = 'Both';
        else if (leftLeg?.isStepping) activeLeg = 'Left';
        else if (rightLeg?.isStepping) activeLeg = 'Right';

        if (stepDetected) {
            if (stepLeg === 'left' || stepLeg === 'both') {
                this.leftStepsCount++;
                if (this.lastLeftStepTime > 0) {
                    this.leftDuration = now - this.lastLeftStepTime;
                }
                this.lastLeftStepTime = now;
            }

            if (stepLeg === 'right' || stepLeg === 'both') {
                this.rightStepsCount++;
                if (this.lastRightStepTime > 0) {
                    this.rightDuration = now - this.lastRightStepTime;
                }
                this.lastRightStepTime = now;
            }

            // Calculate Gait Symmetry Index
            if (this.leftDuration > 0 && this.rightDuration > 0) {
                const maxDur = Math.max(this.leftDuration, this.rightDuration);
                const diffDur = Math.abs(this.leftDuration - this.rightDuration);
                const symmetryScore = Math.max(0, Math.min(100, (1 - (diffDur / maxDur)) * 100));
                
                this.symmetryHistory.push(symmetryScore);
                if (this.symmetryHistory.length > 20) this.symmetryHistory.shift();
                
                const sum = this.symmetryHistory.reduce((a, b) => a + b, 0);
                this.averageSymmetry = Math.round(sum / this.symmetryHistory.length);
            }

            // Calculate Audio Beat Synchronization Accuracy against Tone.js metronome
            let nearestBeat = now;
            if (typeof window.getNearestBeatTimestamp === 'function') {
                nearestBeat = window.getNearestBeatTimestamp(now);
            } else if (window.audioEngine && typeof window.audioEngine.getNearestBeatTimestamp === 'function') {
                nearestBeat = window.audioEngine.getNearestBeatTimestamp(now);
            }

            const deltaMs = Math.abs(now - nearestBeat);
            let accuracy = 70;
            if (deltaMs < 50) {
                accuracy = 100;
            } else if (deltaMs < 150) {
                accuracy = 80;
            } else if (deltaMs <= 250) {
                accuracy = Math.max(40, Math.round(80 - ((deltaMs - 150) / 100) * 40));
            } else {
                accuracy = Math.max(10, Math.round(30 - Math.min(20, (deltaMs - 250) * 0.1)));
            }

            if (typeof sessionData !== 'undefined') {
                sessionData.leftStepsCount = this.leftStepsCount;
                sessionData.rightStepsCount = this.rightStepsCount;
                sessionData.averageSymmetry = this.averageSymmetry;
                sessionData.cameraSyncAccuracy = accuracy;
                sessionData.accuracyScore = Math.round(sessionData.accuracyScore * 0.7 + accuracy * 0.3);
                if (typeof updateAccuracyDisplay === 'function') {
                    updateAccuracyDisplay(sessionData.accuracyScore);
                }
            }
        }

        this.updateLegUI({
            status: activeLeg !== 'None' ? `${activeLeg} Leg Active` : 'Tracking Active',
            activeLeg: activeLeg,
            leftConfidence: leftLeg?.confidence || 0.8,
            rightConfidence: rightLeg?.confidence || 0.8,
            isLeftStepping: leftLeg?.isStepping,
            isRightStepping: rightLeg?.isStepping
        });
    }

    /**
     * Real-Time UI Badges Update
     */
    updateLegUI(data) {
        const leftBadge = document.getElementById('leftLegBadge');
        const leftState = document.getElementById('leftLegState');
        const rightBadge = document.getElementById('rightLegBadge');
        const rightState = document.getElementById('rightLegState');
        const symmetryVal = document.getElementById('gaitSymmetryValue');

        if (leftBadge && leftState) {
            if (data.isLeftStepping || data.activeLeg === 'Left' || data.activeLeg === 'Both') {
                leftBadge.style.background = '#01aac5';
                leftBadge.style.color = '#ffffff';
                leftState.textContent = 'Stepping';
            } else {
                leftBadge.style.background = '#64748b';
                leftBadge.style.color = '#ffffff';
                leftState.textContent = 'Idle';
            }
        }

        if (rightBadge && rightState) {
            if (data.isRightStepping || data.activeLeg === 'Right' || data.activeLeg === 'Both') {
                rightBadge.style.background = '#10b981';
                rightBadge.style.color = '#ffffff';
                rightState.textContent = 'Stepping';
            } else {
                rightBadge.style.background = '#64748b';
                rightBadge.style.color = '#ffffff';
                rightState.textContent = 'Idle';
            }
        }

        if (symmetryVal) {
            if (this.averageSymmetry > 0) {
                symmetryVal.textContent = `${this.averageSymmetry}%`;
                if (this.averageSymmetry >= 80) {
                    symmetryVal.className = 'fw-bold text-success';
                } else if (this.averageSymmetry >= 70) {
                    symmetryVal.className = 'fw-bold text-info';
                } else {
                    symmetryVal.className = 'fw-bold text-warning';
                }
            } else {
                symmetryVal.textContent = '--%';
            }
        }
    }

    reset() {
        this.leftStepsCount = 0;
        this.rightStepsCount = 0;
        this.lastLeftStepTime = 0;
        this.lastRightStepTime = 0;
        this.leftDuration = 0;
        this.rightDuration = 0;
        this.symmetryHistory = [];
        this.averageSymmetry = 100;
        this.prevLeftAnkleY = null;
        this.prevRightAnkleY = null;
        this.prevTime = null;
        this.updateLegUI({
            status: 'Idle / Standing Still',
            activeLeg: 'None',
            leftConfidence: 0,
            rightConfidence: 0
        });
    }
}

// Global instance
const legTrackerInstance = new LegKinematicsTracker();
window.legTracker = legTrackerInstance;

/**
 * Fusion Gating Logic: Combines Tier 1 Pixel Differencing with Tier 2 Leg Model
 */
async function runFusedLegTracking(diffScore) {
    const videoElement = document.getElementById('cameraFeed');

    // 1. If Tier 1 says no movement, skip heavy pose inference & mark idle
    if (diffScore < MOTION_THRESHOLD) {
        legTrackerInstance.updateLegUI({
            status: 'Idle / Standing Still',
            activeLeg: 'None',
            leftConfidence: 0,
            rightConfidence: 0
        });
        return;
    }

    // 2. Tier 1 confirms movement -> Run Leg ML Model
    try {
        const legResults = await legTrackerInstance.estimateLegs(videoElement);
        if (legResults && legResults.confidence > 0.5) {
            legTrackerInstance.handleLegStepEvent(legResults);
        } else {
            // Low confidence fallback: use existing motion calculation
            legTrackerInstance.useLightweightFallback(diffScore);
        }
    } catch (err) {
        console.warn('ML Leg tracking error, falling back to pixel motion:', err);
        legTrackerInstance.useLightweightFallback(diffScore);
    }
}

window.runFusedLegTracking = runFusedLegTracking;
