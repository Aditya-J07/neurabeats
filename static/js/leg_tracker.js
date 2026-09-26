/**
 * Leg Tracker ML & Dual-Layer Sensor Fusion Engine for NeuroBeat
 * 
 * Supports:
 * - Mode-Aware Tracking: 'gait' vs 'balance'
 * - Single Authoritative Coordinate Transform: transformLandmarkToCanvas
 * - Authoritative CAMERA_RENDER_RECT with ResizeObserver
 * - Real-Time Quality Gate checking critical landmarks
 * - Pixel-Perfect Skeleton Drawing
 */

const MOTION_THRESHOLD = 12; // From Tier 1 pixel differencing

/**
 * Single Authoritative Landmark-to-Canvas Projection Function.
 * Translates normalized [0..1] MediaPipe landmark coordinates into pixel coordinates
 * with letterbox/pillarbox/mirror awareness.
 */
function transformLandmarkToCanvas(
    landmark,
    videoWidth,
    videoHeight,
    canvasWidth,
    canvasHeight,
    renderMode = 'fill',
    mirrored = false
) {
    if (!landmark) return null;

    const vW = videoWidth > 0 ? videoWidth : 640;
    const vH = videoHeight > 0 ? videoHeight : 480;
    const cW = canvasWidth > 0 ? canvasWidth : vW;
    const cH = canvasHeight > 0 ? canvasHeight : vH;

    let renderW = cW;
    let renderH = cH;
    let offsetX = 0;
    let offsetY = 0;

    if (renderMode === 'contain') {
        const videoRatio = vW / vH;
        const canvasRatio = cW / cH;
        if (canvasRatio > videoRatio) {
            renderH = cH;
            renderW = cH * videoRatio;
            offsetX = (cW - renderW) / 2;
            offsetY = 0;
        } else {
            renderW = cW;
            renderH = cW / videoRatio;
            offsetX = 0;
            offsetY = (cH - renderH) / 2;
        }
    } else if (renderMode === 'cover') {
        const videoRatio = vW / vH;
        const canvasRatio = cW / cH;
        if (canvasRatio > videoRatio) {
            renderW = cW;
            renderH = cW / videoRatio;
            offsetX = 0;
            offsetY = (cH - renderH) / 2;
        } else {
            renderH = cH;
            renderW = cH * videoRatio;
            offsetX = (cW - renderW) / 2;
            offsetY = 0;
        }
    }

    const normX = mirrored ? (1 - landmark.x) : landmark.x;
    const normY = landmark.y;

    return {
        x: offsetX + normX * renderW,
        y: offsetY + normY * renderH,
        z: landmark.z || 0,
        visibility: typeof landmark.visibility === 'number' ? landmark.visibility : 1.0,
        renderRect: {
            width: renderW,
            height: renderH,
            offsetX: offsetX,
            offsetY: offsetY
        }
    };
}

class LegKinematicsTracker {
    constructor() {
        this.videoElement = null;
        this.canvasElement = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.cameraStage = null;
        this.poseModel = null;
        this.isModelLoaded = false;
        this.isProcessing = false;
        this.resizeObserver = null;
        
        // Active Tracking Mode: 'gait' | 'balance'
        this.trackingMode = 'gait';

        // Authoritative Render Rect
        this.renderRect = {
            width: 640,
            height: 480,
            videoWidth: 640,
            videoHeight: 480,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            mirrored: false // Mirrored visually via stage CSS transform
        };
        
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

        // Balance kinematics state
        this.balanceStabilityScore = 100;
        this.postureSwayHistory = [];
        this.lastWeightDistribution = 'Centered';
        
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
        this.updateDimensions = this.updateDimensions.bind(this);
    }

    setTrackingMode(mode) {
        this.trackingMode = mode === 'balance' ? 'balance' : 'gait';
        console.log(`[TRACKING_MODE] Active sensing mode set to: ${this.trackingMode}`);
    }

    async initialize(videoEl, canvasEl, overlayCanvasEl) {
        this.videoElement = videoEl || document.getElementById('cameraFeed');
        this.canvasElement = canvasEl || document.getElementById('cameraCanvas');
        this.overlayCanvas = overlayCanvasEl || document.getElementById('cameraOverlayCanvas');
        this.cameraStage = document.getElementById('cameraStage') || document.getElementById('cameraBox');

        if (this.overlayCanvas) {
            this.overlayCtx = this.overlayCanvas.getContext('2d');
        }

        // Attach listeners for metadata & resizing to maintain exact geometry
        if (this.videoElement) {
            this.videoElement.addEventListener('loadedmetadata', this.updateDimensions);
            this.videoElement.addEventListener('resize', this.updateDimensions);
        }

        if (this.cameraStage && typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateDimensions();
            });
            this.resizeObserver.observe(this.cameraStage);
        }

        this.updateDimensions();

        // Initialize MediaPipe Pose if available
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
                console.log(`[POSE_INIT] Model initialized for mode=${this.trackingMode}`);
            } catch (err) {
                console.warn('[POSE_INIT] MediaPipe initialization warning:', err);
            }
        }
    }

    updateDimensions() {
        if (!this.videoElement) return;

        const vW = this.videoElement.videoWidth;
        const vH = this.videoElement.videoHeight;

        if (vW > 0 && vH > 0) {
            // Synchronize overlay canvas buffer with native stream resolution
            if (this.overlayCanvas) {
                if (this.overlayCanvas.width !== vW || this.overlayCanvas.height !== vH) {
                    this.overlayCanvas.width = vW;
                    this.overlayCanvas.height = vH;
                }
            }

            // Lock camera stage aspect ratio to stream ratio
            if (this.cameraStage) {
                this.cameraStage.style.setProperty('--camera-aspect-ratio', `${vW} / ${vH}`);
            }

            this.renderRect.videoWidth = vW;
            this.renderRect.videoHeight = vH;
            this.renderRect.width = vW;
            this.renderRect.height = vH;
            console.log(`[CAMERA_DIMENSIONS] Synchronized intrinsic stream dimensions: ${vW}x${vH}`);
        }
    }

    handlePoseResults(results) {
        this.latestResults = results;
        this.isProcessing = false;
    }

    /**
     * Quality Gate: Verifies critical anatomical joints before reporting metrics
     */
    checkQualityGate(landmarks) {
        if (!landmarks || landmarks.length < 33) {
            return { passed: false, reason: "Position your full body in the camera frame." };
        }

        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const leftAnkle = landmarks[27];
        const rightAnkle = landmarks[28];

        const hipVis = ((leftHip?.visibility || 0) + (rightHip?.visibility || 0)) / 2;
        const kneeVis = ((leftKnee?.visibility || 0) + (rightKnee?.visibility || 0)) / 2;
        const ankleVis = ((leftAnkle?.visibility || 0) + (rightAnkle?.visibility || 0)) / 2;

        if (this.trackingMode === 'gait') {
            if (hipVis < 0.35 || kneeVis < 0.35 || ankleVis < 0.35) {
                return {
                    passed: false,
                    reason: "Tracking quality low — reposition yourself in frame so your lower limbs are visible."
                };
            }
        } else if (this.trackingMode === 'balance') {
            const shoulderVis = ((landmarks[11]?.visibility || 0) + (landmarks[12]?.visibility || 0)) / 2;
            if (shoulderVis < 0.35 || hipVis < 0.35) {
                return {
                    passed: false,
                    reason: "Tracking quality low — stand upright with your full body in the frame."
                };
            }
        }

        const avgConfidence = (hipVis + kneeVis + ankleVis) / 3;
        if (avgConfidence < 0.40) {
            return {
                passed: false,
                reason: "Tracking quality low — check room lighting and camera framing."
            };
        }

        return { passed: true, confidence: avgConfidence };
    }

    /**
     * Estimates anatomical movement & landmarks based on active mode
     */
    async estimatePose(videoEl) {
        if (!videoEl || videoEl.readyState < 2) return null;

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

            // Run Quality Gate
            const quality = this.checkQualityGate(lm);
            this.updateQualityBanner(quality);

            // Draw full body skeleton using authoritative coordinate transformation
            this.drawSkeletonOverlay(lm);

            if (!quality.passed) {
                return { qualityPassed: false, confidence: 0 };
            }

            if (this.trackingMode === 'balance') {
                return this.processBalanceKinematics(lm, now);
            } else {
                return this.processGaitKinematics(lm, now);
            }
        }

        return null;
    }

    updateQualityBanner(quality) {
        let banner = document.getElementById('cameraQualityBanner');
        if (!quality.passed) {
            if (!banner) {
                const stage = this.cameraStage || document.getElementById('cameraBox');
                if (stage) {
                    banner = document.createElement('div');
                    banner.id = 'cameraQualityBanner';
                    banner.className = 'camera-quality-banner';
                    stage.appendChild(banner);
                }
            }
            if (banner) {
                banner.textContent = quality.reason;
                banner.style.display = 'block';
            }
        } else {
            if (banner) {
                banner.style.display = 'none';
            }
        }
    }

    /**
     * Gait Mode Kinematics (Legs, Steps, Symmetry)
     */
    processGaitKinematics(lm, now) {
        const leftHip = lm[23];
        const rightHip = lm[24];
        const leftKnee = lm[25];
        const rightKnee = lm[26];
        const leftAnkle = lm[27];
        const rightAnkle = lm[28];

        const leftConf = ((leftHip?.visibility || 0.8) + (leftKnee?.visibility || 0.8) + (leftAnkle?.visibility || 0.8)) / 3;
        const rightConf = ((rightHip?.visibility || 0.8) + (rightKnee?.visibility || 0.8) + (rightAnkle?.visibility || 0.8)) / 3;
        const avgConf = (leftConf + rightConf) / 2;

        const leftAngle = this.calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightAngle = this.calculateAngle(rightHip, rightKnee, rightAnkle);

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

        return {
            mode: 'gait',
            qualityPassed: true,
            leftLeg: {
                angle: leftAngle || 170,
                isStepping: stepLeg === 'left' || stepLeg === 'both' || Math.abs(this.leftVelocity) > 0.5,
                confidence: leftConf
            },
            rightLeg: {
                angle: rightAngle || 170,
                isStepping: stepLeg === 'right' || stepLeg === 'both' || Math.abs(this.rightVelocity) > 0.5,
                confidence: rightConf
            },
            stepDetected: stepDetected,
            stepLeg: stepLeg,
            confidence: avgConf
        };
    }

    /**
     * Balance Mode Kinematics (Center-of-gravity, Postural Sway, Stability Index)
     */
    processBalanceKinematics(lm, now) {
        const leftShoulder = lm[11];
        const rightShoulder = lm[12];
        const leftHip = lm[23];
        const rightHip = lm[24];
        const leftAnkle = lm[27];
        const rightAnkle = lm[28];

        if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
            return { mode: 'balance', qualityPassed: false, confidence: 0 };
        }

        const midShouldersX = (leftShoulder.x + rightShoulder.x) / 2;
        const midHipsX = (leftHip.x + rightHip.x) / 2;
        const trunkCenterX = (midShouldersX + midHipsX) / 2;
        const baseCenterX = ((leftAnkle?.x || midHipsX) + (rightAnkle?.x || midHipsX)) / 2;

        // Lateral displacement proxy
        const lateralDisplacement = trunkCenterX - baseCenterX;

        // Postural sway magnitude
        const swayMagnitude = Math.abs(lateralDisplacement);
        let stabilityScore = 100;
        if (swayMagnitude > 0.03) {
            stabilityScore = Math.max(50, Math.round(100 - (swayMagnitude - 0.03) * 600));
        }

        this.postureSwayHistory.push(stabilityScore);
        if (this.postureSwayHistory.length > 20) this.postureSwayHistory.shift();
        const avgStability = Math.round(this.postureSwayHistory.reduce((a, b) => a + b, 0) / this.postureSwayHistory.length);
        this.balanceStabilityScore = avgStability;

        let weightDist = 'Centered';
        if (lateralDisplacement < -0.04) {
            weightDist = 'Shifted Left';
        } else if (lateralDisplacement > 0.04) {
            weightDist = 'Shifted Right';
        }
        this.lastWeightDistribution = weightDist;

        if (typeof sessionData !== 'undefined') {
            sessionData.accuracyScore = avgStability;
            sessionData.averageSymmetry = avgStability;
            if (typeof updateAccuracyDisplay === 'function') {
                updateAccuracyDisplay(avgStability);
            }
        }

        this.updateBalanceUI({
            weightDistribution: weightDist,
            stability: avgStability,
            swayMagnitude: swayMagnitude
        });

        return {
            mode: 'balance',
            qualityPassed: true,
            stability: avgStability,
            weightDistribution: weightDist,
            confidence: 0.9
        };
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

    /**
     * Authoritative Skeleton Renderer using transformLandmarkToCanvas
     */
    drawSkeletonOverlay(landmarks) {
        if (!this.overlayCanvas || !this.overlayCtx) return;

        this.updateDimensions();

        const w = this.overlayCanvas.width;
        const h = this.overlayCanvas.height;
        const ctx = this.overlayCtx;

        ctx.clearRect(0, 0, w, h);

        if (!landmarks || landmarks.length < 33) return;

        const vW = this.videoElement?.videoWidth || w;
        const vH = this.videoElement?.videoHeight || h;

        // Project landmark using single authoritative coordinate transformation
        const project = (idx) => {
            const rawLm = landmarks[idx];
            if (!rawLm) return null;
            return transformLandmarkToCanvas(
                rawLm,
                vW,
                vH,
                w,
                h,
                'fill',
                false // CSS mirrors the stage media container
            );
        };

        const coreTorso = [
            [11, 12], [11, 23], [12, 24], [23, 24]
        ];

        const headFace = [
            [0, 1], [1, 2], [2, 3], [3, 7],
            [0, 4], [4, 5], [5, 6], [6, 8],
            [9, 10]
        ];

        const leftArm = [
            [11, 13], [13, 15], [15, 17], [15, 19], [15, 21]
        ];

        const rightArm = [
            [12, 14], [14, 16], [16, 18], [16, 20], [16, 22]
        ];

        const leftLeg = [
            [23, 25], [25, 27], [27, 29], [29, 31], [27, 31]
        ];

        const rightLeg = [
            [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]
        ];

        const drawSegment = (connections, strokeStyle, lineWidth) => {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            connections.forEach(([i, j]) => {
                const p1 = project(i);
                const p2 = project(j);
                if (p1 && p2 && p1.visibility > 0.30 && p2.visibility > 0.30) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            });
        };

        // 1. Draw Skeleton Lines
        drawSegment(coreTorso, '#01aac5', 4.5);
        drawSegment(headFace, 'rgba(148, 163, 184, 0.65)', 2);
        drawSegment(leftArm, '#00e5ff', 3.5);
        drawSegment(rightArm, '#10b981', 3.5);
        drawSegment(leftLeg, '#00e5ff', 3.5);
        drawSegment(rightLeg, '#10b981', 3.5);

        // 2. Draw Anatomical Joint Nodes
        for (let i = 0; i < landmarks.length; i++) {
            const pt = project(i);
            if (!pt || pt.visibility <= 0.30) continue;

            let fillColor = '#01aac5';
            let radius = 4;

            if (i >= 11 && i % 2 === 1) {
                // Left side limbs
                fillColor = '#00e5ff';
                radius = (i === 11 || i === 23 || i === 25) ? 6 : 4.5;
            } else if (i >= 12 && i % 2 === 0) {
                // Right side limbs
                fillColor = '#10b981';
                radius = (i === 12 || i === 24 || i === 26) ? 6 : 4.5;
            } else if (i === 0) {
                fillColor = '#38bdf8';
                radius = 4;
            } else if (i <= 10) {
                fillColor = '#94a3b8';
                radius = 2.5;
            }

            // Outer white ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius + 1.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Inner colored node
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = fillColor;
            ctx.fill();
        }
    }

    useLightweightFallback(diffScore) {
        if (this.trackingMode === 'balance') {
            this.updateBalanceUI({
                weightDistribution: 'Centered',
                stability: 95,
                swayMagnitude: 0.01
            });
            return;
        }

        const now = performance.now();
        if (diffScore >= MOTION_THRESHOLD) {
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

            if (this.leftDuration > 0 && this.rightDuration > 0) {
                const maxDur = Math.max(this.leftDuration, this.rightDuration);
                const diffDur = Math.abs(this.leftDuration - this.rightDuration);
                const symmetryScore = Math.max(0, Math.min(100, (1 - (diffDur / maxDur)) * 100));
                
                this.symmetryHistory.push(symmetryScore);
                if (this.symmetryHistory.length > 20) this.symmetryHistory.shift();
                
                const sum = this.symmetryHistory.reduce((a, b) => a + b, 0);
                this.averageSymmetry = Math.round(sum / this.symmetryHistory.length);
            }

            let nearestBeat = now;
            if (typeof window.getNearestBeatTimestamp === 'function') {
                nearestBeat = window.getNearestBeatTimestamp(now);
            } else if (window.audioEngine && typeof window.audioEngine.getNearestBeatTimestamp === 'function') {
                nearestBeat = window.audioEngine.getNearestBeatTimestamp(now);
            }

            const deltaMs = Math.abs(now - nearestBeat);
            let accuracy = 70;
            if (deltaMs < 50) accuracy = 100;
            else if (deltaMs < 150) accuracy = 80;
            else if (deltaMs <= 250) accuracy = Math.max(40, Math.round(80 - ((deltaMs - 150) / 100) * 40));
            else accuracy = Math.max(10, Math.round(30 - Math.min(20, (deltaMs - 250) * 0.1)));

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

    updateLegUI(data) {
        if (this.trackingMode === 'balance') return;

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

    updateBalanceUI(data) {
        const leftBadge = document.getElementById('leftLegBadge');
        const rightBadge = document.getElementById('rightLegBadge');
        const stabilityVal = document.getElementById('gaitSymmetryValue');

        if (leftBadge) {
            if (data.weightDistribution === 'Shifted Left') {
                leftBadge.style.background = '#01aac5';
                leftBadge.textContent = 'Left Weight: Loaded';
            } else {
                leftBadge.style.background = '#64748b';
                leftBadge.textContent = 'Left Weight: Centered';
            }
        }

        if (rightBadge) {
            if (data.weightDistribution === 'Shifted Right') {
                rightBadge.style.background = '#10b981';
                rightBadge.textContent = 'Right Weight: Loaded';
            } else {
                rightBadge.style.background = '#64748b';
                rightBadge.textContent = 'Right Weight: Centered';
            }
        }

        if (stabilityVal) {
            stabilityVal.textContent = `${data.stability}%`;
            if (data.stability >= 85) {
                stabilityVal.className = 'fw-bold text-success';
            } else if (data.stability >= 70) {
                stabilityVal.className = 'fw-bold text-info';
            } else {
                stabilityVal.className = 'fw-bold text-warning';
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
        this.balanceStabilityScore = 100;
        this.postureSwayHistory = [];
        this.prevLeftAnkleY = null;
        this.prevRightAnkleY = null;
        this.prevTime = null;

        if (this.overlayCanvas && this.overlayCtx) {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }

        const banner = document.getElementById('cameraQualityBanner');
        if (banner) banner.style.display = 'none';

        if (this.trackingMode === 'balance') {
            this.updateBalanceUI({ weightDistribution: 'Centered', stability: 100 });
        } else {
            this.updateLegUI({
                status: 'Idle / Standing Still',
                activeLeg: 'None',
                leftConfidence: 0,
                rightConfidence: 0
            });
        }
    }

    teardown() {
        this.reset();
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.videoElement) {
            this.videoElement.removeEventListener('loadedmetadata', this.updateDimensions);
            this.videoElement.removeEventListener('resize', this.updateDimensions);
        }
    }
}

// Global instance
const legTrackerInstance = new LegKinematicsTracker();
window.legTracker = legTrackerInstance;
window.transformLandmarkToCanvas = transformLandmarkToCanvas;

/**
 * Sensor Fusion Entry Point: Combines Tier 1 Pixel Differencing with Tier 2 Full-Body Pose Model
 */
async function runFusedLegTracking(diffScore) {
    const videoElement = document.getElementById('cameraFeed');
    if (!videoElement || videoElement.readyState < 2) return;

    try {
        const poseResults = await legTrackerInstance.estimatePose(videoElement);

        if (diffScore < MOTION_THRESHOLD) {
            if (legTrackerInstance.trackingMode === 'gait') {
                legTrackerInstance.updateLegUI({
                    status: 'Idle / Standing Still',
                    activeLeg: 'None',
                    leftConfidence: 0,
                    rightConfidence: 0
                });
            }
            return;
        }

        if (poseResults && poseResults.qualityPassed) {
            if (legTrackerInstance.trackingMode === 'gait') {
                legTrackerInstance.handleLegStepEvent(poseResults);
            }
        } else {
            legTrackerInstance.useLightweightFallback(diffScore);
        }
    } catch (err) {
        console.warn('Pose tracking error, falling back to pixel motion:', err);
        legTrackerInstance.useLightweightFallback(diffScore);
    }
}

window.runFusedLegTracking = runFusedLegTracking;
