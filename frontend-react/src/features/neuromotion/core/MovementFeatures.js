/**
 * Movement Feature Extraction
 * Extracts biomechanical vectors, velocities, accelerations, joint angles, and step candidate signals.
 */

import { LANDMARKS } from './PoseTypes';
import { VectorMath } from './BodyNormalizer';

export class MovementFeatureExtractor {
  constructor() {
    this.prevNormalizedLandmarks = null;
    this.prevVelocities = new Map();
    this.prevTime = null;
  }

  reset() {
    this.prevNormalizedLandmarks = null;
    this.prevVelocities.clear();
    this.prevTime = null;
  }

  /**
   * Extracts comprehensive movement features for the current frame
   * @param {Array<Object>} normalizedLandmarks - Normalized 33 landmarks
   * @param {Array<Object>} rawLandmarks - Original landmarks (for reference/confidence)
   * @param {number} timestamp - Current frame timestamp in seconds
   * @returns {Object} Structured MovementFeatures
   */
  extract(normalizedLandmarks, rawLandmarks, timestamp) {
    if (!normalizedLandmarks || normalizedLandmarks.length < 33) {
      return this.createDefaultFeatures(timestamp);
    }

    let dt = 0.033; // Default ~30fps
    if (this.prevTime !== null && timestamp > this.prevTime) {
      dt = Math.max(0.005, Math.min(0.2, timestamp - this.prevTime));
    }

    // Key anatomical landmarks (Normalized)
    const lHip = normalizedLandmarks[LANDMARKS.LEFT_HIP];
    const rHip = normalizedLandmarks[LANDMARKS.RIGHT_HIP];
    const lShoulder = normalizedLandmarks[LANDMARKS.LEFT_SHOULDER];
    const rShoulder = normalizedLandmarks[LANDMARKS.RIGHT_SHOULDER];
    const lKnee = normalizedLandmarks[LANDMARKS.LEFT_KNEE];
    const rKnee = normalizedLandmarks[LANDMARKS.RIGHT_KNEE];
    const lAnkle = normalizedLandmarks[LANDMARKS.LEFT_ANKLE];
    const rAnkle = normalizedLandmarks[LANDMARKS.RIGHT_ANKLE];
    const lHeel = normalizedLandmarks[LANDMARKS.LEFT_HEEL];
    const rHeel = normalizedLandmarks[LANDMARKS.RIGHT_HEEL];
    const lFoot = normalizedLandmarks[LANDMARKS.LEFT_FOOT_INDEX];
    const rFoot = normalizedLandmarks[LANDMARKS.RIGHT_FOOT_INDEX];

    // Compute Angles using 3D vector geometry
    const leftKneeAngle = VectorMath.angleBetween(lHip, lKnee, lAnkle);
    const rightKneeAngle = VectorMath.angleBetween(rHip, rKnee, rAnkle);
    const leftHipAngle = VectorMath.angleBetween(lShoulder, lHip, lKnee);
    const rightHipAngle = VectorMath.angleBetween(rShoulder, rHip, rKnee);
    const leftAnkleAngle = VectorMath.angleBetween(lKnee, lAnkle, lFoot);
    const rightAnkleAngle = VectorMath.angleBetween(rKnee, rAnkle, rFoot);

    // Compute Velocities for ankles and feet
    const calcVelocity = (curr, prev) => {
      if (!prev) return { x: 0, y: 0, z: 0, mag: 0 };
      const vx = (curr.x - prev.x) / dt;
      const vy = (curr.y - prev.y) / dt; // In normalized space, positive vy is upward
      const vz = ((curr.z ?? 0) - (prev.z ?? 0)) / dt;
      const mag = Math.sqrt(vx * vx + vy * vy + vz * vz);
      return { x: vx, y: vy, z: vz, mag };
    };

    const prevLAnkle = this.prevNormalizedLandmarks ? this.prevNormalizedLandmarks[LANDMARKS.LEFT_ANKLE] : null;
    const prevRAnkle = this.prevNormalizedLandmarks ? this.prevNormalizedLandmarks[LANDMARKS.RIGHT_ANKLE] : null;
    const prevLFoot = this.prevNormalizedLandmarks ? this.prevNormalizedLandmarks[LANDMARKS.LEFT_FOOT_INDEX] : null;
    const prevRFoot = this.prevNormalizedLandmarks ? this.prevNormalizedLandmarks[LANDMARKS.RIGHT_FOOT_INDEX] : null;

    const leftAnkleVel = calcVelocity(lAnkle, prevLAnkle);
    const rightAnkleVel = calcVelocity(rAnkle, prevRAnkle);
    const leftFootVel = calcVelocity(lFoot, prevLFoot);
    const rightFootVel = calcVelocity(rFoot, prevRFoot);

    // Compute Acceleration for left/right ankles
    const prevLVel = this.prevVelocities.get('leftAnkle') || { x: 0, y: 0, z: 0 };
    const prevRVel = this.prevVelocities.get('rightAnkle') || { x: 0, y: 0, z: 0 };
    const leftAnkleAccel = {
      x: (leftAnkleVel.x - prevLVel.x) / dt,
      y: (leftAnkleVel.y - prevLVel.y) / dt,
      z: (leftAnkleVel.z - prevLVel.z) / dt,
    };
    const rightAnkleAccel = {
      x: (rightAnkleVel.x - prevRVel.x) / dt,
      y: (rightAnkleVel.y - prevRVel.y) / dt,
      z: (rightAnkleVel.z - prevRVel.z) / dt,
    };

    this.prevVelocities.set('leftAnkle', leftAnkleVel);
    this.prevVelocities.set('rightAnkle', rightAnkleVel);

    // Step Candidate Signals
    // Vertical position of feet relative to hip: y is inverted so lower y is further down
    // Amplitude represents vertical lift from floor
    const leftLiftAmplitude = Math.max(0, lAnkle.y - (lHeel?.y ?? lAnkle.y));
    const rightLiftAmplitude = Math.max(0, rAnkle.y - (rHeel?.y ?? rAnkle.y));

    // Foot-to-foot clearance / stride width
    const footSeparation = VectorMath.distance2D(lAnkle, rAnkle);

    // Confidence of lower-body landmarks
    const lowerBodyIndices = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
    let confSum = 0;
    for (const idx of lowerBodyIndices) {
      const raw = rawLandmarks?.[idx];
      confSum += ((raw?.visibility ?? 1.0) + (raw?.presence ?? 1.0)) / 2;
    }
    const landmarkConfidence = confSum / lowerBodyIndices.length;

    // Movement velocity magnitude (average of both ankles)
    const combinedVelocity = (leftAnkleVel.mag + rightAnkleVel.mag) / 2;

    // Update history
    this.prevNormalizedLandmarks = normalizedLandmarks;
    this.prevTime = timestamp;

    return {
      timestamp,
      dt,
      left: {
        anklePos: lAnkle,
        heelPos: lHeel,
        footPos: lFoot,
        ankleVelocity: leftAnkleVel,
        ankleAcceleration: leftAnkleAccel,
        footVelocity: leftFootVel,
        kneeAngle: Number(leftKneeAngle.toFixed(1)),
        hipAngle: Number(leftHipAngle.toFixed(1)),
        ankleAngle: Number(leftAnkleAngle.toFixed(1)),
        verticalVelocity: leftAnkleVel.y,
        verticalLift: lAnkle.y,
        liftAmplitude: Number(leftLiftAmplitude.toFixed(3)),
      },
      right: {
        anklePos: rAnkle,
        heelPos: rHeel,
        footPos: rFoot,
        ankleVelocity: rightAnkleVel,
        ankleAcceleration: rightAnkleAccel,
        footVelocity: rightFootVel,
        kneeAngle: Number(rightKneeAngle.toFixed(1)),
        hipAngle: Number(rightHipAngle.toFixed(1)),
        ankleAngle: Number(rightAnkleAngle.toFixed(1)),
        verticalVelocity: rightAnkleVel.y,
        verticalLift: rAnkle.y,
        liftAmplitude: Number(rightLiftAmplitude.toFixed(3)),
      },
      angles: {
        leftKnee: Number(leftKneeAngle.toFixed(1)),
        rightKnee: Number(rightKneeAngle.toFixed(1)),
        leftHip: Number(leftHipAngle.toFixed(1)),
        rightHip: Number(rightHipAngle.toFixed(1)),
      },
      footSeparation: Number(footSeparation.toFixed(3)),
      combinedVelocity: Number(combinedVelocity.toFixed(4)),
      landmarkConfidence: Number(landmarkConfidence.toFixed(3)),
      movementConfidence: Number(Math.min(1.0, landmarkConfidence * (combinedVelocity > 0.05 ? 1.0 : 0.85)).toFixed(3)),
    };
  }

  createDefaultFeatures(timestamp) {
    const zeroVec = { x: 0, y: 0, z: 0, mag: 0 };
    return {
      timestamp,
      dt: 0.033,
      left: {
        anklePos: { x: -0.2, y: -1.0, z: 0 },
        heelPos: { x: -0.2, y: -1.05, z: 0 },
        footPos: { x: -0.2, y: -1.08, z: 0 },
        ankleVelocity: zeroVec,
        ankleAcceleration: zeroVec,
        footVelocity: zeroVec,
        kneeAngle: 180,
        hipAngle: 180,
        ankleAngle: 90,
        verticalVelocity: 0,
        verticalLift: 0,
      },
      right: {
        anklePos: { x: 0.2, y: -1.0, z: 0 },
        heelPos: { x: 0.2, y: -1.05, z: 0 },
        footPos: { x: 0.2, y: -1.08, z: 0 },
        ankleVelocity: zeroVec,
        ankleAcceleration: zeroVec,
        footVelocity: zeroVec,
        kneeAngle: 180,
        hipAngle: 180,
        ankleAngle: 90,
        verticalVelocity: 0,
        verticalLift: 0,
      },
      angles: { leftKnee: 180, rightKnee: 180, leftHip: 180, rightHip: 180 },
      footSeparation: 0.4,
      combinedVelocity: 0,
      landmarkConfidence: 0,
      movementConfidence: 0,
    };
  }
}
