/**
 * Deterministic Movement Event State Machine
 * Detects biological gait events (swing initiation, peak, heel strike/plant)
 * using trajectory, velocity zero-crossings, hysteresis, and debounce windows.
 */

import { MovementEventType } from './PoseTypes';
import { POSE_CONFIG } from './PoseConfig';

const LegPhase = Object.freeze({
  STANCE: 'STANCE',
  SWING_UP: 'SWING_UP',
  SWING_PEAK: 'SWING_PEAK',
  SWING_DOWN: 'SWING_DOWN',
});

class LegTracker {
  constructor(side, config) {
    this.side = side; // 'LEFT' or 'RIGHT'
    this.config = config;
    this.phase = LegPhase.STANCE;

    this.baselineY = null;
    this.peakLift = 0;
    this.peakVelocity = 0;
    this.swingStartTime = 0;
    this.lastStepTime = -999;

    this.historyY = [];
    this.historyVy = [];
  }

  reset() {
    this.phase = LegPhase.STANCE;
    this.baselineY = null;
    this.peakLift = 0;
    this.peakVelocity = 0;
    this.swingStartTime = 0;
    this.lastStepTime = -999;
    this.historyY = [];
    this.historyVy = [];
  }

  /**
   * Process a single frame for this leg
   * @param {number} y - Normalized vertical coordinate (positive = upward)
   * @param {number} vy - Normalized vertical velocity (positive = upward)
   * @param {number} timestamp - Frame timestamp in seconds
   * @param {number} confidence - Landmark confidence
   * @returns {Object|null} Step event if foot strike detected
   */
  update(y, vy, timestamp, confidence) {
    if (this.baselineY === null) {
      this.baselineY = y;
    } else if (this.phase === LegPhase.STANCE) {
      // Slow adaptive baseline tracking when resting in stance
      this.baselineY = 0.95 * this.baselineY + 0.05 * y;
    }

    const liftFromBaseline = y - this.baselineY;
    const timeSinceLastStepMs = (timestamp - this.lastStepTime) * 1000;

    let detectedStep = null;

    switch (this.phase) {
      case LegPhase.STANCE:
        // Initiate swing when upward velocity exceeds threshold and lift is noticeable
        if (vy > 0.15 && liftFromBaseline > this.config.verticalLiftThreshold) {
          this.phase = LegPhase.SWING_UP;
          this.swingStartTime = timestamp;
          this.peakLift = liftFromBaseline;
          this.peakVelocity = vy;
        }
        break;

      case LegPhase.SWING_UP:
        this.peakLift = Math.max(this.peakLift, liftFromBaseline);
        this.peakVelocity = Math.max(this.peakVelocity, vy);

        // Zero-crossing from upward to downward velocity indicates peak swing
        if (vy <= 0.02) {
          this.phase = LegPhase.SWING_PEAK;
        }
        break;

      case LegPhase.SWING_PEAK:
        // Transition to descending phase
        if (vy < -0.10) {
          this.phase = LegPhase.SWING_DOWN;
        }
        break;

      case LegPhase.SWING_DOWN: {
        // Foot strike detected when foot approaches baseline floor AND downward velocity slows/arrests
        const returnedNearFloor = liftFromBaseline <= this.config.verticalLiftThreshold * 1.2;
        const velocityDecelerated = vy > -0.12; // Deceleration / impact arrest

        if (returnedNearFloor && velocityDecelerated) {
          // Check debounce window: must satisfy minStepInterval
          if (timeSinceLastStepMs >= this.config.minStepIntervalMs) {
            this.lastStepTime = timestamp;
            const eventType = this.side === 'LEFT' ? MovementEventType.LEFT_STEP : MovementEventType.RIGHT_STEP;
            const swingDuration = Math.max(0.1, timestamp - this.swingStartTime);

            detectedStep = {
              type: eventType,
              side: this.side,
              timestamp: Number(timestamp.toFixed(3)),
              confidence: Number(Math.min(1.0, confidence * 0.95).toFixed(3)),
              peakLift: Number(this.peakLift.toFixed(3)),
              peakVelocity: Number(this.peakVelocity.toFixed(3)),
              duration: Number(swingDuration.toFixed(3)),
            };
          }

          // Return to stance
          this.phase = LegPhase.STANCE;
          this.baselineY = y;
          this.peakLift = 0;
          this.peakVelocity = 0;
        }
        break;
      }
    }

    return detectedStep;
  }
}

export class MovementDetector {
  constructor(config = POSE_CONFIG.movement) {
    this.config = config;
    this.leftTracker = new LegTracker('LEFT', this.config);
    this.rightTracker = new LegTracker('RIGHT', this.config);

    this.lastGlobalStepTime = -999;
    this.lastStepSide = null;
    this.isMoving = false;
    this.lastMovementActivityTime = 0;

    this.totalLeftSteps = 0;
    this.totalRightSteps = 0;
  }

  reset() {
    this.leftTracker.reset();
    this.rightTracker.reset();
    this.lastGlobalStepTime = -999;
    this.lastStepSide = null;
    this.isMoving = false;
    this.lastMovementActivityTime = 0;
    this.totalLeftSteps = 0;
    this.totalRightSteps = 0;
  }

  /**
   * Process movement features and return any new movement events
   * @param {Object} features - Biomechanical movement features from MovementFeatureExtractor
   * @param {boolean} isUsable - Pose quality gate verdict
   * @returns {Array<Object>} List of events generated this frame
   */
  process(features, isUsable = true) {
    const events = [];
    if (!isUsable || !features) {
      return events;
    }

    const { timestamp, left, right, combinedVelocity, movementConfidence } = features;

    // Movement state start / stop tracking
    const hasActiveMotion = combinedVelocity > 0.12;
    if (hasActiveMotion) {
      this.lastMovementActivityTime = timestamp;
      if (!this.isMoving) {
        this.isMoving = true;
        events.push({
          type: MovementEventType.MOVEMENT_START,
          timestamp: Number(timestamp.toFixed(3)),
          confidence: movementConfidence,
        });
      }
    } else if (this.isMoving && (timestamp - this.lastMovementActivityTime) > 2.0) {
      this.isMoving = false;
      events.push({
        type: MovementEventType.MOVEMENT_STOP,
        timestamp: Number(timestamp.toFixed(3)),
        confidence: movementConfidence,
      });
    }

    // Process Left Leg
    const leftStep = this.leftTracker.update(
      left.verticalLift,
      left.verticalVelocity,
      timestamp,
      movementConfidence
    );

    // Process Right Leg
    const rightStep = this.rightTracker.update(
      right.verticalLift,
      right.verticalVelocity,
      timestamp,
      movementConfidence
    );

    // Check step candidates against alternating interval and global cadence bounds
    const evaluateStepCandidate = (candidate) => {
      if (!candidate) return;

      const timeSinceLastGlobalStepMs = (candidate.timestamp - this.lastGlobalStepTime) * 1000;
      
      // Prevent impossible rapid double firing across alternate feet
      if (timeSinceLastGlobalStepMs < this.config.minAlternatingIntervalMs) {
        return;
      }

      this.lastGlobalStepTime = candidate.timestamp;
      this.lastStepSide = candidate.side;

      if (candidate.side === 'LEFT') {
        this.totalLeftSteps += 1;
        candidate.stepNumber = this.totalLeftSteps + this.totalRightSteps;
      } else {
        this.totalRightSteps += 1;
        candidate.stepNumber = this.totalLeftSteps + this.totalRightSteps;
      }

      events.push(candidate);
    };

    evaluateStepCandidate(leftStep);
    evaluateStepCandidate(rightStep);

    return events;
  }

  getStepCounts() {
    return {
      left: this.totalLeftSteps,
      right: this.totalRightSteps,
      total: this.totalLeftSteps + this.totalRightSteps,
    };
  }
}
