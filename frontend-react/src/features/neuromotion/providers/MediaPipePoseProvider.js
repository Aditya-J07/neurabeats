/**
 * MediaPipe Pose Landmarker Provider
 * Official @mediapipe/tasks-vision Web API integration.
 * Primary model: pose_landmarker_full.task (running mode: VIDEO, numPoses: 1)
 * Local-first model and wasm asset loading with graceful remote fallback.
 */

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { POSE_CONFIG } from '../core/PoseConfig';

export const ProviderStatus = Object.freeze({
  IDLE: 'IDLE',
  LOADING_WASM: 'LOADING_WASM',
  LOADING_MODEL: 'LOADING_MODEL',
  READY: 'READY',
  ERROR: 'ERROR',
  CLOSED: 'CLOSED',
});

export class MediaPipePoseProvider {
  constructor(config = POSE_CONFIG.model) {
    this.config = config;
    this.landmarker = null;
    this.status = ProviderStatus.IDLE;
    this.errorMessage = null;
    this.lastProcessedTimestamp = -1;
  }

  /**
   * Initializes the PoseLandmarker using local assets with graceful fallback
   */
  async initialize() {
    if (this.landmarker && this.status === ProviderStatus.READY) {
      return this.landmarker;
    }

    try {
      this.status = ProviderStatus.LOADING_WASM;
      this.errorMessage = null;

      // 1. Resolve WASM Fileset (Try local first, then remote CDN)
      let visionWasm = null;
      try {
        visionWasm = await FilesetResolver.forVisionTasks(this.config.localWasmPath);
      } catch (localWasmErr) {
        console.warn("Could not load local WASM, falling back to CDN:", localWasmErr);
        visionWasm = await FilesetResolver.forVisionTasks(this.config.remoteWasmUrl);
      }

      this.status = ProviderStatus.LOADING_MODEL;

      // 2. Create PoseLandmarker with FULL model asset
      // First attempt local model asset
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(visionWasm, {
          baseOptions: {
            modelAssetPath: this.config.localModelPath,
            delegate: 'GPU',
          },
          runningMode: this.config.runningMode,
          numPoses: this.config.numPoses,
          minPoseDetectionConfidence: this.config.minPoseDetectionConfidence,
          minPosePresenceConfidence: this.config.minPosePresenceConfidence,
          minTrackingConfidence: this.config.minTrackingConfidence,
        });
      } catch (localModelErr) {
        console.warn("Could not load local pose_landmarker_full.task, falling back to remote URL:", localModelErr);
        // Fallback with CPU/GPU on remote model
        this.landmarker = await PoseLandmarker.createFromOptions(visionWasm, {
          baseOptions: {
            modelAssetPath: this.config.remoteModelUrl,
            delegate: 'GPU',
          },
          runningMode: this.config.runningMode,
          numPoses: this.config.numPoses,
          minPoseDetectionConfidence: this.config.minPoseDetectionConfidence,
          minPosePresenceConfidence: this.config.minPosePresenceConfidence,
          minTrackingConfidence: this.config.minTrackingConfidence,
        });
      }

      this.status = ProviderStatus.READY;
      return this.landmarker;
    } catch (err) {
      this.status = ProviderStatus.ERROR;
      this.errorMessage = err?.message || 'Failed to initialize MediaPipe Pose Landmarker';
      console.error("MediaPipe Pose Landmarker initialization failed:", err);
      throw err;
    }
  }

  /**
   * Run inference on a video frame
   * @param {HTMLVideoElement} videoElement
   * @param {number} timestampMs - monotonically increasing timestamp in ms
   * @returns {{ landmarks: Array<Object>, worldLandmarks: Array<Object> } | null}
   */
  detectForVideo(videoElement, timestampMs) {
    if (!this.landmarker || this.status !== ProviderStatus.READY) {
      return null;
    }

    if (!videoElement || videoElement.readyState < 2) {
      return null;
    }

    // Guard: MediaPipe VIDEO mode requires strictly monotonically increasing timestamps
    if (timestampMs <= this.lastProcessedTimestamp) {
      timestampMs = this.lastProcessedTimestamp + 1;
    }
    this.lastProcessedTimestamp = timestampMs;

    try {
      const result = this.landmarker.detectForVideo(videoElement, timestampMs);
      if (result && result.landmarks && result.landmarks.length > 0) {
        return {
          landmarks: result.landmarks[0],
          worldLandmarks: result.worldLandmarks?.[0] || [],
        };
      }
      return { landmarks: [], worldLandmarks: [] };
    } catch (err) {
      console.warn("MediaPipe frame detection error:", err);
      return null;
    }
  }

  close() {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        // ignore
      }
      this.landmarker = null;
    }
    this.status = ProviderStatus.CLOSED;
  }
}
