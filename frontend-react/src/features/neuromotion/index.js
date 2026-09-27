/**
 * NuroMotion Feature Module Index
 * Clean public exports for Phase 1 Movement Tracking & Audio Sensing
 */

export { NuroMotion, nuroMotionInstance } from './core/NuroMotion';
export { PoseEngine } from './core/PoseEngine';
export { POSE_CONFIG } from './core/PoseConfig';
export { LANDMARKS, SKELETON_SEGMENTS, TrackingState, MovementEventType, createLandmark } from './core/PoseTypes';
export { PoseQualityGate } from './core/PoseQuality';
export { LowPassFilter, OneEuroFilter, PoseLandmarkFilter } from './core/TemporalFilter';
export { BodyNormalizer, VectorMath } from './core/BodyNormalizer';
export { MovementFeatureExtractor } from './core/MovementFeatures';
export { MovementDetector } from './core/MovementDetector';
export { CadenceEstimator } from './core/CadenceEstimator';
export { MovementQualityEvaluator } from './core/MovementQuality';
export { MovementIntelligence, MOVEMENT_INTELLIGENCE_CONFIG } from './core/MovementIntelligence';
export { AdaptiveEngine, ADAPTIVE_ENGINE_CONFIG } from './core/AdaptiveEngine';
export { NuroAgent, NuroActionValidator, NuroReasoner, NURO_AGENT_CONFIG } from './core/NuroAgent';
export { PhaseIntelligence, CircularPhaseResolver, PhaseStateMachine, MultiSignalCycleDetector, PersonalMovementBaseline } from './core/PhaseIntelligence';

export { MediaPipePoseProvider, ProviderStatus } from './providers/MediaPipePoseProvider';
export { NuroAudio } from './audio/NuroAudio';
export { createTelemetryPacket, serializeTelemetry } from './telemetry/TelemetryTypes';
export { TelemetryBuffer } from './telemetry/TelemetryBuffer';

export { useNuroMotion } from './hooks/useNuroMotion';

// UI Components
export { default as NuroMotionPanel } from './components/NuroMotionPanel';
export { default as CameraView } from './components/CameraView';
export { default as SkeletonOverlay } from './components/SkeletonOverlay';
export { default as MovementMetrics } from './components/MovementMetrics';
export { default as AudioStatus } from './components/AudioStatus';
