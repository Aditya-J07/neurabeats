/**
 * Movement Quality & Bilateral Balance Analysis
 * Deterministic telemetry calculations for left/right gait symmetry and quality scoring.
 * NOTE: These are movement telemetry metrics only; not a clinical or medical diagnosis.
 */

export class MovementQualityEvaluator {
  constructor() {
    this.leftStepTimes = [];
    this.rightStepTimes = [];
    this.leftLifts = [];
    this.rightLifts = [];
  }

  reset() {
    this.leftStepTimes = [];
    this.rightStepTimes = [];
    this.leftLifts = [];
    this.rightLifts = [];
  }

  recordStep(stepEvent) {
    if (!stepEvent) return;
    const { side, timestamp, peakLift } = stepEvent;

    if (side === 'LEFT') {
      this.leftStepTimes.push(timestamp);
      if (Number.isFinite(peakLift)) this.leftLifts.push(peakLift);
      if (this.leftStepTimes.length > 10) this.leftStepTimes.shift();
      if (this.leftLifts.length > 10) this.leftLifts.shift();
    } else if (side === 'RIGHT') {
      this.rightStepTimes.push(timestamp);
      if (Number.isFinite(peakLift)) this.rightLifts.push(peakLift);
      if (this.rightStepTimes.length > 10) this.rightStepTimes.shift();
      if (this.rightLifts.length > 10) this.rightLifts.shift();
    }
  }

  /**
   * Computes bilateral balance telemetry
   * @returns {{
   *   leftSteps: number,
   *   rightSteps: number,
   *   timingDiffMs: number,
   *   leftAvgLift: number,
   *   rightAvgLift: number,
   *   balanceScore: number
   * }}
   */
  calculateBalance(leftCount = 0, rightCount = 0) {
    const total = leftCount + rightCount;
    if (total < 2) {
      return {
        leftSteps: leftCount,
        rightSteps: rightCount,
        timingDiffMs: 0,
        leftAvgLift: 0,
        rightAvgLift: 0,
        balanceScore: 100,
      };
    }

    // Step count balance ratio (ideal = 1.0)
    const countRatio = Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount, 1);

    // Compute average inter-step intervals for left vs right
    const calcIntervals = (times) => {
      const ints = [];
      for (let i = 1; i < times.length; i++) {
        ints.push(times[i] - times[i - 1]);
      }
      return ints.length > 0 ? ints.reduce((a, b) => a + b, 0) / ints.length : null;
    };

    const leftMeanInt = calcIntervals(this.leftStepTimes);
    const rightMeanInt = calcIntervals(this.rightStepTimes);

    let timingDiffMs = 0;
    let timingFactor = 1.0;
    if (leftMeanInt !== null && rightMeanInt !== null) {
      timingDiffMs = Math.round(Math.abs(leftMeanInt - rightMeanInt) * 1000);
      timingFactor = Math.max(0, 1.0 - Math.min(1.0, timingDiffMs / 600));
    }

    // Amplitude balance
    const leftAvgLift = this.leftLifts.length > 0
      ? this.leftLifts.reduce((a, b) => a + b, 0) / this.leftLifts.length
      : 0;
    const rightAvgLift = this.rightLifts.length > 0
      ? this.rightLifts.reduce((a, b) => a + b, 0) / this.rightLifts.length
      : 0;

    let ampFactor = 1.0;
    if (leftAvgLift > 0 && rightAvgLift > 0) {
      ampFactor = Math.min(leftAvgLift, rightAvgLift) / Math.max(leftAvgLift, rightAvgLift);
    }

    // Weighted balance score [0, 100]
    const balanceScore = Math.round(
      (countRatio * 0.40 + timingFactor * 0.35 + ampFactor * 0.25) * 100
    );

    return {
      leftSteps: leftCount,
      rightSteps: rightCount,
      timingDiffMs,
      leftAvgLift: Number(leftAvgLift.toFixed(3)),
      rightAvgLift: Number(rightAvgLift.toFixed(3)),
      balanceScore: Math.max(0, Math.min(100, balanceScore)),
    };
  }

  /**
   * Deterministic movement quality score
   * @param {Object} params
   * @param {number} params.poseConfidence [0, 1]
   * @param {number} params.movementConfidence [0, 1]
   * @param {number} params.cadenceStability [0, 1]
   * @param {number} params.balanceScore [0, 100]
   * @param {number} params.stepRegularity [0, 1]
   * @returns {{ qualityScore: number, confidence: number }}
   */
  evaluateQuality({
    poseConfidence = 0.8,
    movementConfidence = 0.8,
    cadenceStability = 0.8,
    balanceScore = 90,
    stepRegularity = 0.85,
  }) {
    // Weighted deterministic combination
    const rawScore =
      0.25 * (poseConfidence * 100) +
      0.25 * (cadenceStability * 100) +
      0.25 * balanceScore +
      0.25 * (stepRegularity * 100);

    const qualityScore = Math.round(Math.max(0, Math.min(100, rawScore)));
    const overallConfidence = Number(
      Math.max(0, Math.min(1.0, (poseConfidence + movementConfidence) / 2)).toFixed(3)
    );

    return {
      qualityScore,
      confidence: overallConfidence,
    };
  }
}
