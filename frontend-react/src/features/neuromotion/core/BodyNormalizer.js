/**
 * Body Normalization & Geometric Vector Utilities
 * Normalizes pose landmarks relative to body pelvis center and torso scale.
 * Provides invariance to camera distance, user height, video aspect ratio, and frame positioning.
 */

import { LANDMARKS } from './PoseTypes';

/**
 * 3D Vector operations
 */
export const VectorMath = {
  distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z ?? 0) - (p2.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  distance2D(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  midpoint(p1, p2) {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
      z: ((p1.z ?? 0) + (p2.z ?? 0)) / 2,
    };
  },

  sub(p1, p2) {
    return {
      x: p1.x - p2.x,
      y: p1.y - p2.y,
      z: (p1.z ?? 0) - (p2.z ?? 0),
    };
  },

  dot(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y + (v1.z ?? 0) * (v2.z ?? 0);
  },

  magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + (v.z ?? 0) * (v.z ?? 0));
  },

  /**
   * Computes angle at vertex B formed by rays BA and BC in degrees
   * @param {Object} a - Point A
   * @param {Object} b - Vertex B
   * @param {Object} c - Point C
   * @returns {number} Angle in degrees [0, 180]
   */
  angleBetween(a, b, c) {
    const vBA = VectorMath.sub(a, b);
    const vBC = VectorMath.sub(c, b);

    const magBA = VectorMath.magnitude(vBA);
    const magBC = VectorMath.magnitude(vBC);

    if (magBA < 1e-6 || magBC < 1e-6) {
      return 180.0;
    }

    const cosine = VectorMath.dot(vBA, vBC) / (magBA * magBC);
    // Clamp to [-1, 1] to prevent NaN from floating point inaccuracies
    const clampedCos = Math.max(-1.0, Math.min(1.0, cosine));
    return (Math.acos(clampedCos) * 180) / Math.PI;
  }
};

export class BodyNormalizer {
  /**
   * Normalizes landmarks into body-centric coordinate frame
   * Origin (0, 0, 0) = Midpoint of Hips
   * Scale S = Torso height (shoulder-to-hip distance) or scaled hip-width fallback
   * Normalized Y: Positive is UPWARD (inverted from screen coordinates)
   * @param {Array<Object>} rawLandmarks - 33 raw landmarks [0, 1]
   * @returns {{
   *   normalizedLandmarks: Array<Object>,
   *   hipCenter: Object,
   *   shoulderCenter: Object,
   *   bodyScale: number,
   *   torsoHeight: number,
   *   hipWidth: number
   * }}
   */
  normalize(rawLandmarks) {
    if (!rawLandmarks || rawLandmarks.length < 33) {
      return {
        normalizedLandmarks: [],
        hipCenter: { x: 0, y: 0, z: 0 },
        shoulderCenter: { x: 0, y: 0, z: 0 },
        bodyScale: 1.0,
        torsoHeight: 1.0,
        hipWidth: 0.2,
      };
    }

    const leftHip = rawLandmarks[LANDMARKS.LEFT_HIP];
    const rightHip = rawLandmarks[LANDMARKS.RIGHT_HIP];
    const leftShoulder = rawLandmarks[LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = rawLandmarks[LANDMARKS.RIGHT_SHOULDER];

    const hipCenter = VectorMath.midpoint(leftHip, rightHip);
    const shoulderCenter = VectorMath.midpoint(leftShoulder, rightShoulder);

    const hipWidth = VectorMath.distance2D(leftHip, rightHip);
    const torsoHeight = VectorMath.distance2D(shoulderCenter, hipCenter);

    // Robust body scale: prefer torso height; fallback to 1.6 * hipWidth
    let bodyScale = torsoHeight;
    if (!Number.isFinite(bodyScale) || bodyScale < 0.05) {
      bodyScale = Math.max(0.05, hipWidth * 1.6);
    }

    const normalizedLandmarks = rawLandmarks.map((lm) => {
      return {
        // Lateral displacement
        x: (lm.x - hipCenter.x) / bodyScale,
        // Vertical displacement: Invert Y so upward motion is positive
        y: -(lm.y - hipCenter.y) / bodyScale,
        // Depth displacement
        z: ((lm.z ?? 0) - hipCenter.z) / bodyScale,
        visibility: lm.visibility ?? 1.0,
        presence: lm.presence ?? 1.0,
      };
    });

    return {
      normalizedLandmarks,
      hipCenter,
      shoulderCenter,
      bodyScale,
      torsoHeight,
      hipWidth,
    };
  }
}
