/**
 * Centralized Configuration for NuroMotion Sensing Pipeline
 * Eliminates magic numbers across detection, filtering, cadence, and quality gates.
 */

export const POSE_CONFIG = Object.freeze({
  // MediaPipe Model Options
  model: {
    primaryModelName: 'pose_landmarker_full.task',
    localModelPath: '/models/pose_landmarker_full.task',
    remoteModelUrl: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
    localWasmPath: '/wasm',
    remoteWasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    runningMode: 'VIDEO',
  },

  // Camera Settings
  camera: {
    idealWidth: 1280,
    idealHeight: 720,
    fallbackWidth: 640,
    fallbackHeight: 480,
    targetFps: 30,
    facingMode: 'user',
  },

  // Pose Quality Gate
  qualityGate: {
    minVisibilityThreshold: 0.50, // Minimum visibility for critical joints
    minPresenceThreshold: 0.50,
    minOverallConfidence: 0.45,   // Minimum average confidence for usable tracking
    requiredLandmarks: [
      23, // LEFT_HIP
      24, // RIGHT_HIP
      25, // LEFT_KNEE
      26, // RIGHT_KNEE
      27, // LEFT_ANKLE
      28, // RIGHT_ANKLE
      29, // LEFT_HEEL
      30, // RIGHT_HEEL
      31, // LEFT_FOOT_INDEX
      32, // RIGHT_FOOT_INDEX
    ],
    torsoLandmarks: [11, 12, 23, 24],
    stationaryVelocityThreshold: 0.08, // Below this normalized velocity, body is STATIONARY
    movingVelocityThreshold: 0.16,     // Above this normalized velocity, body is MOVING
  },

  // One Euro Filter Parameters (Adaptive Low-Latency Smoothing)
  filter: {
    minCutoff: 1.0,   // Hz: lower cutoff when stationary (jitter reduction)
    beta: 0.007,      // speed coefficient: raises cutoff during fast motion (lag reduction)
    dCutoff: 1.0,     // Hz: derivative cutoff for velocity estimation
  },

  // Movement Feature Extraction & Event Detection
  movement: {
    minStepIntervalMs: 280,       // Minimum time between steps on same foot (prevents impossible bounce rates)
    minAlternatingIntervalMs: 180,// Minimum time between alternating feet
    maxStepIntervalMs: 4000,      // Max interval before considering movement stopped
    verticalLiftThreshold: 0.06,  // Normalized displacement required for swing initiate
    stepStrikeDecelThreshold: -0.4, // Downward velocity deceleration threshold for foot strike
    velocityPeakHysteresis: 0.04, // Hysteresis band for peak detection
    footDistanceThreshold: 0.05,  // Minimum foot clearance
  },

  // Cadence Estimation
  cadence: {
    windowSize: 6,                // Number of steps in rolling window
    minStepsForCadence: 2,        // Minimum steps before calculating cadence
    minPlausibleCadenceSpm: 20,   // SPM lower bound
    maxPlausibleCadenceSpm: 200,  // SPM upper bound
    stabilityThreshold: 0.18,     // Normalized std dev threshold for high stability
  },

  // Audio / Microphone Sensing
  audio: {
    fftSize: 512,
    smoothingTimeConstant: 0.8,
    speechThresholdRms: 0.025,
    beatOnsetThreshold: 0.15,
    minBeatIntervalMs: 250,
  },

  // Telemetry Emission
  telemetry: {
    emitRateHz: 10,               // 10 updates per second to backend/UI
    bufferCapacity: 60,           // Buffer up to 6 seconds of data
  },
});
