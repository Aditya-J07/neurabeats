/**
 * NuroSync - Real Deterministic Synchronization Engine
 * Compares real movement timestamps with rhythmic beat timestamps.
 * Computes timing error, mean absolute error, % within tolerance, and true synchronization score.
 * ZERO Math.random() - fully deterministic and reproducible.
 */

class NuroSync {
    constructor(toleranceMs = 250) {
        this.toleranceMs = toleranceMs;
        this.beatTimestamps = [];
        this.stepEvents = [];
        this.timingErrors = []; // in ms
        this.currentSyncScore = 85.0; // default initial score until first steps arrive
        this.totalStepsEvaluated = 0;
        this.synchronizedStepsCount = 0;
    }

    recordBeat(timestampSec) {
        const t = timestampSec || (performance.now() / 1000);
        this.beatTimestamps.push(t);
        // Retain only last 30 beats
        if (this.beatTimestamps.length > 30) {
            this.beatTimestamps.shift();
        }
    }

    evaluateStep(stepEvent) {
        const stepTime = typeof stepEvent === 'object' ? stepEvent.timestamp : stepEvent;
        this.stepEvents.push(stepEvent);
        if (this.stepEvents.length > 50) this.stepEvents.shift();

        if (this.beatTimestamps.length === 0) {
            return {
                timingErrorMs: 0,
                syncScore: this.currentSyncScore,
                isSynchronized: true
            };
        }

        // Find nearest beat timestamp
        let minDiff = Infinity;
        for (let i = 0; i < this.beatTimestamps.length; i++) {
            const diff = Math.abs(stepTime - this.beatTimestamps[i]);
            if (diff < minDiff) {
                minDiff = diff;
            }
        }

        const timingErrorMs = Math.round(minDiff * 1000);
        this.timingErrors.push(timingErrorMs);
        if (this.timingErrors.length > 30) {
            this.timingErrors.shift();
        }

        this.totalStepsEvaluated += 1;
        const isWithinTolerance = timingErrorMs <= this.toleranceMs;
        if (isWithinTolerance) {
            this.synchronizedStepsCount += 1;
        }

        // Deterministic score calculation:
        // Error = 0ms -> 100%
        // Error = toleranceMs -> 0%
        const instantScore = Math.max(0, Math.min(100, Math.round(100 * (1 - timingErrorMs / this.toleranceMs))));

        // Rolling exponential smoothing for stability (alpha = 0.3)
        this.currentSyncScore = Math.round(0.3 * instantScore + 0.7 * this.currentSyncScore);

        return {
            timingErrorMs: timingErrorMs,
            instantScore: instantScore,
            syncScore: this.currentSyncScore,
            isSynchronized: isWithinTolerance
        };
    }

    getCurrentAccuracy() {
        return Math.max(0, Math.min(100, this.currentSyncScore));
    }

    getMetricsSummary() {
        if (this.timingErrors.length === 0) {
            return {
                meanAbsoluteErrorMs: 0,
                percentageWithinTolerance: 100,
                syncScore: this.currentSyncScore,
                totalSteps: this.totalStepsEvaluated
            };
        }

        const sumError = this.timingErrors.reduce((acc, err) => acc + err, 0);
        const meanError = Math.round(sumError / this.timingErrors.length);
        const withinTol = this.timingErrors.filter(e => e <= this.toleranceMs).length;
        const pctWithin = Math.round((withinTol / this.timingErrors.length) * 100);

        return {
            meanAbsoluteErrorMs: meanError,
            percentageWithinTolerance: pctWithin,
            syncScore: this.currentSyncScore,
            totalSteps: this.totalStepsEvaluated
        };
    }

    reset() {
        this.beatTimestamps = [];
        this.stepEvents = [];
        this.timingErrors = [];
        this.currentSyncScore = 85.0;
        this.totalStepsEvaluated = 0;
        this.synchronizedStepsCount = 0;
    }
}

// Global instance
window.nuroSync = new NuroSync();
