/**
 * NuroMotion - Deterministic Movement & Step Detection
 * Pipeline: pose landmarks -> normalize -> smooth -> velocity -> peak detection -> step event
 * Event shape: { timestamp, type: "STEP", side: "LEFT"|"RIGHT", confidence }
 */

class NuroMotion {
    constructor(onStepCallback) {
        this.onStepCallback = onStepCallback;
        this.isTracking = false;
        this.isDemoMode = false;
        
        // Landmark smoothing
        this.prevLeftAnkle = null;
        this.prevRightAnkle = null;
        this.prevTime = null;
        
        // Velocity history for peak detection
        this.leftVelocity = 0;
        this.rightVelocity = 0;
        this.prevLeftVelocity = 0;
        this.prevRightVelocity = 0;
        
        // Cooldown between steps on the same foot to prevent double-counting
        this.lastLeftStepTime = 0;
        this.lastRightStepTime = 0;
        this.minStepCooldown = 0.35; // seconds
        
        // Demo mode state
        this.demoTimer = null;
        this.demoSide = 'LEFT';
        this.demoStepCount = 0;
    }

    processLandmarks(landmarks, timestampSec) {
        if (!landmarks || landmarks.length < 33) return null;
        const now = timestampSec || (performance.now() / 1000);

        // Extract key lower limb landmarks
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const leftAnkle = landmarks[27];
        const rightAnkle = landmarks[28];

        if (!leftAnkle || !rightAnkle) return null;

        // Normalization reference: hip distance
        const hipDist = Math.hypot(
            (leftHip ? leftHip.x : 0) - (rightHip ? rightHip.x : 0),
            (leftHip ? leftHip.y : 0) - (rightHip ? rightHip.y : 0)
        ) || 0.2;

        // Normalizing vertical ankle coordinates
        const normLeftY = leftAnkle.y / hipDist;
        const normRightY = rightAnkle.y / hipDist;

        // Temporal smoothing (Exponential Moving Average)
        const alpha = 0.65;
        const smoothLeftY = this.prevLeftAnkle !== null 
            ? alpha * normLeftY + (1 - alpha) * this.prevLeftAnkle 
            : normLeftY;
        const smoothRightY = this.prevRightAnkle !== null 
            ? alpha * normRightY + (1 - alpha) * this.prevRightAnkle 
            : normRightY;

        if (this.prevTime !== null) {
            const dt = Math.max(0.01, now - this.prevTime);

            // Vertical velocity (positive = moving downwards towards foot strike)
            this.leftVelocity = (smoothLeftY - (this.prevLeftAnkle || smoothLeftY)) / dt;
            this.rightVelocity = (smoothRightY - (this.prevRightAnkle || smoothRightY)) / dt;

            // Deterministic Peak Detection (velocity was positive and now crosses below threshold)
            // Left foot strike
            if (this.prevLeftVelocity > 0.8 && this.leftVelocity <= 0.8) {
                if (now - this.lastLeftStepTime > this.minStepCooldown) {
                    this.lastLeftStepTime = now;
                    this.emitStep("LEFT", now, Math.min(1.0, (leftAnkle.visibility || 0.9)));
                }
            }

            // Right foot strike
            if (this.prevRightVelocity > 0.8 && this.rightVelocity <= 0.8) {
                if (now - this.lastRightStepTime > this.minStepCooldown) {
                    this.lastRightStepTime = now;
                    this.emitStep("RIGHT", now, Math.min(1.0, (rightAnkle.visibility || 0.9)));
                }
            }

            this.prevLeftVelocity = this.leftVelocity;
            this.prevRightVelocity = this.rightVelocity;
        }

        this.prevLeftAnkle = smoothLeftY;
        this.prevRightAnkle = smoothRightY;
        this.prevTime = now;

        return {
            leftAnkle: { x: leftAnkle.x, y: leftAnkle.y },
            rightAnkle: { x: rightAnkle.x, y: rightAnkle.y },
            leftKnee: leftKnee ? { x: leftKnee.x, y: leftKnee.y } : null,
            rightKnee: rightKnee ? { x: rightKnee.x, y: rightKnee.y } : null
        };
    }

    emitStep(side, timestamp, confidence = 0.92) {
        const stepEvent = {
            timestamp: Number(timestamp.toFixed(3)),
            type: "STEP",
            side: side,
            confidence: Number(confidence.toFixed(2)),
            isDemo: this.isDemoMode
        };

        if (typeof this.onStepCallback === 'function') {
            this.onStepCallback(stepEvent);
        }
    }

    startDemoMode(currentBpm = 60) {
        this.isDemoMode = true;
        this.stopDemoMode();

        const scheduleStep = () => {
            if (!this.isDemoMode) return;

            // Generate deterministic realistic human step interval based on current BPM (±20ms natural variance)
            const baseIntervalSec = 60 / currentBpm;
            const variance = ((Math.sin(performance.now() / 800) * 0.5) * 0.04);
            const intervalMs = Math.max(350, (baseIntervalSec + variance) * 1000);

            this.demoTimer = setTimeout(() => {
                const now = performance.now() / 1000;
                this.demoSide = this.demoSide === 'LEFT' ? 'RIGHT' : 'LEFT';
                this.emitStep(this.demoSide, now, 0.96);
                scheduleStep();
            }, intervalMs);
        };

        scheduleStep();
    }

    stopDemoMode() {
        if (this.demoTimer) {
            clearTimeout(this.demoTimer);
            this.demoTimer = null;
        }
    }

    stop() {
        this.isTracking = false;
        this.stopDemoMode();
        this.prevLeftAnkle = null;
        this.prevRightAnkle = null;
        this.prevTime = null;
    }
}

// Global instance if needed
window.NuroMotion = NuroMotion;
