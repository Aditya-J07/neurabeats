/**
 * Pose Quality Gate
 * Evaluates landmark visibility, presence, anatomical completeness, and tracking state.
 * Prevents downstream movement calculation when input signals are unreliable.
 */

import { LANDMARKS, TrackingState, FramingStatus, FramingFeedback } from './PoseTypes';
import { POSE_CONFIG } from './PoseConfig';

export class PoseQualityGate {
  constructor(config = POSE_CONFIG.qualityGate) {
    this.config = config;
  }

  /**
   * Evaluates patient body positioning, distance, and completeness within the camera frame.
   * Directly feeds into Pose Quality Gate decision logic.
   * @param {Array<Object>} landmarks - 33 MediaPipe pose landmarks
   * @returns {{
   *   status: string,
   *   feedback: string,
   *   isOptimallyFramed: boolean,
   *   feetVisible: boolean,
   *   bodyBounds: Object,
   *   score: number
   * }}
   */
  evaluateFraming(landmarks) {
    if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 33) {
      return {
        status: FramingStatus.NO_PERSON,
        feedback: FramingFeedback[FramingStatus.NO_PERSON],
        isOptimallyFramed: false,
        feetVisible: false,
        bodyBounds: { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, centerX: 0.5, centerY: 0.5 },
        score: 0,
      };
    }

    const nose = landmarks[LANDMARKS.NOSE];
    const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[LANDMARKS.RIGHT_SHOULDER];
    const leftHip = landmarks[LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
    const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
    const rightKnee = landmarks[LANDMARKS.RIGHT_KNEE];
    const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE];
    const rightAnkle = landmarks[LANDMARKS.RIGHT_ANKLE];
    const leftHeel = landmarks[LANDMARKS.LEFT_HEEL];
    const rightHeel = landmarks[LANDMARKS.RIGHT_HEEL];
    const leftFoot = landmarks[LANDMARKS.LEFT_FOOT_INDEX];
    const rightFoot = landmarks[LANDMARKS.RIGHT_FOOT_INDEX];

    // Check hips visibility
    const hipsVis = Math.min(leftHip?.visibility ?? 0, rightHip?.visibility ?? 0);
    if (hipsVis < 0.35) {
      return {
        status: FramingStatus.NO_PERSON,
        feedback: FramingFeedback[FramingStatus.NO_PERSON],
        isOptimallyFramed: false,
        feetVisible: false,
        bodyBounds: { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, centerX: 0.5, centerY: 0.5 },
        score: 0,
      };
    }

    // Determine bounding coordinates
    const relevantLandmarks = [
      nose, leftShoulder, rightShoulder, leftHip, rightHip,
      leftKnee, rightKnee, leftAnkle, rightAnkle, leftHeel, rightHeel, leftFoot, rightFoot
    ].filter(lm => lm && (lm.visibility ?? 1) >= 0.20);

    const top = Math.min(...relevantLandmarks.map(lm => lm.y));
    const bottom = Math.max(...relevantLandmarks.map(lm => lm.y));
    const left = Math.min(...relevantLandmarks.map(lm => lm.x));
    const right = Math.max(...relevantLandmarks.map(lm => lm.x));

    const width = Math.max(0.01, right - left);
    const height = Math.max(0.01, bottom - top);
    const centerX = (leftHip.x + rightHip.x) / 2;
    const centerY = (top + bottom) / 2;

    const bodyBounds = {
      top: Number(top.toFixed(3)),
      bottom: Number(bottom.toFixed(3)),
      left: Number(left.toFixed(3)),
      right: Number(right.toFixed(3)),
      width: Number(width.toFixed(3)),
      height: Number(height.toFixed(3)),
      centerX: Number(centerX.toFixed(3)),
      centerY: Number(centerY.toFixed(3)),
    };

    // Check feet visibility and positioning
    const anklesVis = Math.min(leftAnkle?.visibility ?? 0, rightAnkle?.visibility ?? 0);
    const feetIndexVis = Math.min(leftFoot?.visibility ?? 0, rightFoot?.visibility ?? 0);
    const feetAtBottomEdge = bottom >= 0.96; // within 4% of camera bottom indicates truncation
    const feetVisible = anklesVis >= 0.35 && feetIndexVis >= 0.30 && !feetAtBottomEdge;

    // Rule 1: Feet must be visible for gait tracking
    if (!feetVisible) {
      return {
        status: FramingStatus.FEET_NOT_VISIBLE,
        feedback: FramingFeedback[FramingStatus.FEET_NOT_VISIBLE],
        isOptimallyFramed: false,
        feetVisible: false,
        bodyBounds,
        score: Math.max(20, Math.round(50 - (feetAtBottomEdge ? 20 : 0))),
      };
    }

    // Rule 2: Move Farther Away (body height > 84% or head/feet touching edges)
    if (height > 0.84 || (top <= 0.04 && bottom >= 0.94)) {
      return {
        status: FramingStatus.MOVE_FARTHER,
        feedback: FramingFeedback[FramingStatus.MOVE_FARTHER],
        isOptimallyFramed: false,
        feetVisible,
        bodyBounds,
        score: 60,
      };
    }

    // Rule 3: Move Closer (body height < 38%)
    if (height < 0.38) {
      return {
        status: FramingStatus.MOVE_CLOSER,
        feedback: FramingFeedback[FramingStatus.MOVE_CLOSER],
        isOptimallyFramed: false,
        feetVisible,
        bodyBounds,
        score: 60,
      };
    }

    // Rule 4: Center Yourself (center X < 0.32 or > 0.68)
    if (centerX < 0.32 || centerX > 0.68) {
      return {
        status: FramingStatus.CENTER_BODY,
        feedback: FramingFeedback[FramingStatus.CENTER_BODY],
        isOptimallyFramed: false,
        feetVisible,
        bodyBounds,
        score: 75,
      };
    }

    // Rule 5: Full Body Detected & Well Framed
    return {
      status: FramingStatus.FULL_BODY_DETECTED,
      feedback: FramingFeedback[FramingStatus.FULL_BODY_DETECTED],
      isOptimallyFramed: true,
      feetVisible: true,
      bodyBounds,
      score: 100,
    };
  }

  /**
   * Evaluates usability and tracking state of landmark collection
   * @param {Array<Object>} landmarks - 33 MediaPipe pose landmarks
   * @param {number} [recentVelocity=0] - Estimated lower-body velocity
   * @returns {{
   *   state: string,
   *   confidence: number,
   *   isUsable: boolean,
   *   missingRegions: string[],
   *   framing: Object,
   *   details: Object
   * }}
   */
  evaluate(landmarks, recentVelocity = 0) {
    if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 33) {
      return {
        state: TrackingState.LOST,
        confidence: 0.0,
        isUsable: false,
        missingRegions: ['entire_body'],
        framing: {
          status: FramingStatus.NO_PERSON,
          feedback: FramingFeedback[FramingStatus.NO_PERSON],
          isOptimallyFramed: false,
          feetVisible: false,
          bodyBounds: { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, centerX: 0.5, centerY: 0.5 },
          score: 0,
        },
        details: { reason: 'No landmarks detected' },
      };
    }

    const {
      minVisibilityThreshold,
      minPresenceThreshold,
      minOverallConfidence,
      requiredLandmarks,
      stationaryVelocityThreshold,
      movingVelocityThreshold,
    } = this.config;

    const missingRegions = [];
    let validCount = 0;
    let totalConfidenceSum = 0;

    // Evaluate Body Framing Guide
    const framing = this.evaluateFraming(landmarks);
    if (framing.status === FramingStatus.FEET_NOT_VISIBLE) {
      missingRegions.push('feet_visibility');
    }

    // Check hips
    const leftHip = landmarks[LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[LANDMARKS.RIGHT_HIP];
    const hipsVisible =
      (leftHip?.visibility ?? 0) >= minVisibilityThreshold &&
      (rightHip?.visibility ?? 0) >= minVisibilityThreshold;

    if (!hipsVisible) {
      missingRegions.push('hips');
    }

    // Check knees
    const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
    const rightKnee = landmarks[LANDMARKS.RIGHT_KNEE];
    const kneesVisible =
      (leftKnee?.visibility ?? 0) >= minVisibilityThreshold &&
      (rightKnee?.visibility ?? 0) >= minVisibilityThreshold;

    if (!kneesVisible) {
      missingRegions.push('knees');
    }

    // Check ankles and feet
    const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE];
    const rightAnkle = landmarks[LANDMARKS.RIGHT_ANKLE];
    const anklesVisible =
      (leftAnkle?.visibility ?? 0) >= minVisibilityThreshold &&
      (rightAnkle?.visibility ?? 0) >= minVisibilityThreshold;

    if (!anklesVisible) {
      missingRegions.push('ankles');
    }

    const leftFoot = landmarks[LANDMARKS.LEFT_FOOT_INDEX];
    const rightFoot = landmarks[LANDMARKS.RIGHT_FOOT_INDEX];
    const feetVisible =
      (leftFoot?.visibility ?? 0) >= minVisibilityThreshold &&
      (rightFoot?.visibility ?? 0) >= minVisibilityThreshold;

    if (!feetVisible) {
      missingRegions.push('feet');
    }

    // Compute average confidence across all required landmarks
    for (const idx of requiredLandmarks) {
      const lm = landmarks[idx];
      if (lm) {
        const vis = lm.visibility ?? 1.0;
        const pres = lm.presence ?? 1.0;
        const conf = (vis + pres) / 2;
        totalConfidenceSum += conf;

        if (vis >= minVisibilityThreshold && pres >= minPresenceThreshold) {
          validCount += 1;
        }
      }
    }

    const avgConfidence = totalConfidenceSum / requiredLandmarks.length;
    const completenessRatio = validCount / requiredLandmarks.length;

    // Determine state
    let state = TrackingState.LOST;
    let isUsable = false;

    if (!hipsVisible) {
      state = TrackingState.LOST;
      isUsable = false;
    } else if (completenessRatio < 0.75 || avgConfidence < minOverallConfidence || !framing.feetVisible) {
      state = TrackingState.UNCERTAIN;
      isUsable = false;
    } else {
      isUsable = true;
      if (recentVelocity >= movingVelocityThreshold) {
        state = TrackingState.MOVING;
      } else if (recentVelocity <= stationaryVelocityThreshold) {
        state = TrackingState.STATIONARY;
      } else {
        state = TrackingState.TRACKING;
      }
    }

    return {
      state,
      confidence: Number(avgConfidence.toFixed(3)),
      isUsable,
      missingRegions,
      framing,
      details: {
        completenessRatio: Number(completenessRatio.toFixed(3)),
        hipsVisible,
        kneesVisible,
        anklesVisible,
        feetVisible: framing.feetVisible,
        framingStatus: framing.status,
        framingFeedback: framing.feedback,
        isOptimallyFramed: framing.isOptimallyFramed,
        framingScore: framing.score,
        recentVelocity: Number(recentVelocity.toFixed(4)),
      },
    };
  }
}

