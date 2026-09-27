/**
 * Pose and Movement Tracking Type Definitions & Landmark Constants
 * Based on MediaPipe 33-landmark Pose Topology
 */

export const LANDMARKS = Object.freeze({
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
});

/**
 * Anatomical skeleton segment connections for rendering
 */
export const SKELETON_SEGMENTS = Object.freeze({
  TORSO: [
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER],
    [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_HIP],
    [LANDMARKS.RIGHT_HIP, LANDMARKS.LEFT_HIP],
    [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_SHOULDER],
  ],
  LEFT_ARM: [
    [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_ELBOW],
    [LANDMARKS.LEFT_ELBOW, LANDMARKS.LEFT_WRIST],
  ],
  RIGHT_ARM: [
    [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_ELBOW],
    [LANDMARKS.RIGHT_ELBOW, LANDMARKS.RIGHT_WRIST],
  ],
  LEFT_LEG: [
    [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_KNEE],
    [LANDMARKS.LEFT_KNEE, LANDMARKS.LEFT_ANKLE],
    [LANDMARKS.LEFT_ANKLE, LANDMARKS.LEFT_HEEL],
    [LANDMARKS.LEFT_HEEL, LANDMARKS.LEFT_FOOT_INDEX],
    [LANDMARKS.LEFT_ANKLE, LANDMARKS.LEFT_FOOT_INDEX],
  ],
  RIGHT_LEG: [
    [LANDMARKS.RIGHT_HIP, LANDMARKS.RIGHT_KNEE],
    [LANDMARKS.RIGHT_KNEE, LANDMARKS.RIGHT_ANKLE],
    [LANDMARKS.RIGHT_ANKLE, LANDMARKS.RIGHT_HEEL],
    [LANDMARKS.RIGHT_HEEL, LANDMARKS.RIGHT_FOOT_INDEX],
    [LANDMARKS.RIGHT_ANKLE, LANDMARKS.RIGHT_FOOT_INDEX],
  ],
  HEAD: [
    [LANDMARKS.LEFT_EAR, LANDMARKS.LEFT_EYE_OUTER],
    [LANDMARKS.LEFT_EYE_OUTER, LANDMARKS.LEFT_EYE],
    [LANDMARKS.LEFT_EYE, LANDMARKS.LEFT_EYE_INNER],
    [LANDMARKS.LEFT_EYE_INNER, LANDMARKS.NOSE],
    [LANDMARKS.NOSE, LANDMARKS.RIGHT_EYE_INNER],
    [LANDMARKS.RIGHT_EYE_INNER, LANDMARKS.RIGHT_EYE],
    [LANDMARKS.RIGHT_EYE, LANDMARKS.RIGHT_EYE_OUTER],
    [LANDMARKS.RIGHT_EYE_OUTER, LANDMARKS.RIGHT_EAR],
    [LANDMARKS.MOUTH_LEFT, LANDMARKS.MOUTH_RIGHT],
  ]
});

/**
 * Tracking quality states
 */
export const TrackingState = Object.freeze({
  TRACKING: 'TRACKING',
  MOVING: 'MOVING',
  STATIONARY: 'STATIONARY',
  UNCERTAIN: 'UNCERTAIN',
  LOST: 'LOST',
});

/**
 * Patient Body Framing Guide States
 */
export const FramingStatus = Object.freeze({
  NO_PERSON: 'NO_PERSON',
  MOVE_FARTHER: 'MOVE_FARTHER',
  MOVE_CLOSER: 'MOVE_CLOSER',
  CENTER_BODY: 'CENTER_BODY',
  FEET_NOT_VISIBLE: 'FEET_NOT_VISIBLE',
  FULL_BODY_DETECTED: 'FULL_BODY_DETECTED',
});

/**
 * User-facing instructional feedback strings
 */
export const FramingFeedback = Object.freeze({
  [FramingStatus.NO_PERSON]: 'Step into camera view',
  [FramingStatus.MOVE_FARTHER]: 'Move farther away',
  [FramingStatus.MOVE_CLOSER]: 'Move closer',
  [FramingStatus.CENTER_BODY]: 'Center yourself',
  [FramingStatus.FEET_NOT_VISIBLE]: 'Make sure your feet are visible',
  [FramingStatus.FULL_BODY_DETECTED]: 'Full body detected',
});


/**
 * Deterministic movement event types
 */
export const MovementEventType = Object.freeze({
  LEFT_STEP: 'LEFT_STEP',
  RIGHT_STEP: 'RIGHT_STEP',
  LEFT_MOVEMENT: 'LEFT_MOVEMENT',
  RIGHT_MOVEMENT: 'RIGHT_MOVEMENT',
  MOVEMENT_START: 'MOVEMENT_START',
  MOVEMENT_STOP: 'MOVEMENT_STOP',
});

/**
 * Creates a strongly typed Landmark object with default fallbacks
 */
export function createLandmark(x = 0, y = 0, z = 0, visibility = 0, presence = 0) {
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
    visibility: Number.isFinite(visibility) ? Math.max(0, Math.min(1, visibility)) : 0,
    presence: Number.isFinite(presence) ? Math.max(0, Math.min(1, presence)) : 0,
  };
}
