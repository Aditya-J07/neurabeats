/**
 * Rolling Cadence Estimator
 * Computes instantaneous and windowed cadence (Steps Per Minute - SPM),
 * interval stability, confidence metrics, and safe representations (no NaN/Infinity).
 */

import { POSE_CONFIG } from './PoseConfig';

export class CadenceEstimator {
  constructor(config = POSE_CONFIG.cadence) {
    this.config = config;
    this.stepTimestamps = [];
    this.stepIntervals = []; // in seconds
    this.leftSteps = 0;
    this.rightSteps = 0;
  }

  reset() {
    this.stepTimestamps = [];
    this.stepIntervals = [];
    this.leftSteps = 0;
    this.rightSteps = 0;
  }

  /**
   * Registers a newly detected step event
   * @param {Object} stepEvent - { timestamp, side, type, confidence }
   */
  recordStep(stepEvent) {
    if (!stepEvent || !Number.isFinite(stepEvent.timestamp)) {
      return;
    }

    if (stepEvent.side === 'LEFT') {
      this.leftSteps += 1;
    } else if (stepEvent.side === 'RIGHT') {
      this.rightSteps += 1;
    }

    const t = stepEvent.timestamp;
    if (this.stepTimestamps.length > 0) {
      const prevT = this.stepTimestamps[this.stepTimestamps.length - 1];
      const dt = t - prevT;

      // Only accept plausible inter-step intervals (0.2s - 3.5s)
      if (dt >= 0.2 && dt <= 3.5) {
        this.stepIntervals.push(dt);
        if (this.stepIntervals.length > this.config.windowSize) {
          this.stepIntervals.shift();
        }
      }
    }

    this.stepTimestamps.push(t);
    if (this.stepTimestamps.length > this.config.windowSize + 2) {
      this.stepTimestamps.shift();
    }
  }

  /**
   * Calculates current cadence metrics
   * @returns {{
   *   instantaneousCadence: number | null,
   *   rollingCadence: number | null,
   *   cadenceConfidence: number,
   *   cadenceStability: number,
   *   leftSteps: number,
   *   rightSteps: number,
   *   totalSteps: number,
   *   isStable: boolean,
   *   displaySpm: string
   * }}
   */
  getCadenceMetrics() {
    const totalSteps = this.leftSteps + this.rightSteps;

    // Check if sufficient observations exist
    if (this.stepIntervals.length < this.config.minStepsForCadence) {
      return {
        instantaneousCadence: null,
        rollingCadence: null,
        cadenceConfidence: 0.0,
        cadenceStability: 0.0,
        leftSteps: this.leftSteps,
        rightSteps: this.rightSteps,
        totalSteps,
        isStable: false,
        displaySpm: '--',
      };
    }

    // Instantaneous cadence from the most recent interval
    const lastInterval = this.stepIntervals[this.stepIntervals.length - 1];
    let instantaneousCadence = null;
    if (lastInterval > 0) {
      const rawInst = 60.0 / lastInterval;
      if (rawInst >= this.config.minPlausibleCadenceSpm && rawInst <= this.config.maxPlausibleCadenceSpm) {
        instantaneousCadence = Number(rawInst.toFixed(1));
      }
    }

    // Rolling cadence: Mean of window intervals
    const sum = this.stepIntervals.reduce((a, b) => a + b, 0);
    const meanInterval = sum / this.stepIntervals.length;

    let rollingCadence = null;
    if (meanInterval > 0) {
      const rawRolling = 60.0 / meanInterval;
      if (rawRolling >= this.config.minPlausibleCadenceSpm && rawRolling <= this.config.maxPlausibleCadenceSpm) {
        rollingCadence = Number(rawRolling.toFixed(1));
      }
    }

    // Stability calculation: coefficient of variation (std dev / mean)
    let variance = 0;
    for (const interval of this.stepIntervals) {
      variance += Math.pow(interval - meanInterval, 2);
    }
    const stdDev = Math.sqrt(variance / this.stepIntervals.length);
    const cv = meanInterval > 0 ? stdDev / meanInterval : 1.0;

    // Stability score [0, 1] where 1 is perfectly metronomic
    const cadenceStability = Number(Math.max(0, Math.min(1.0, 1.0 - cv * 2.5)).toFixed(3));
    const isStable = cadenceStability >= 0.70;

    // Confidence depends on sample count and stability
    const sampleFactor = Math.min(1.0, this.stepIntervals.length / this.config.windowSize);
    const cadenceConfidence = Number((sampleFactor * (0.5 + 0.5 * cadenceStability)).toFixed(3));

    return {
      instantaneousCadence: Number.isFinite(instantaneousCadence) ? instantaneousCadence : null,
      rollingCadence: Number.isFinite(rollingCadence) ? rollingCadence : null,
      cadenceConfidence: Number.isFinite(cadenceConfidence) ? cadenceConfidence : 0,
      cadenceStability: Number.isFinite(cadenceStability) ? cadenceStability : 0,
      leftSteps: this.leftSteps,
      rightSteps: this.rightSteps,
      totalSteps,
      isStable,
      displaySpm: rollingCadence !== null ? `${Math.round(rollingCadence)}` : '--',
    };
  }
}
