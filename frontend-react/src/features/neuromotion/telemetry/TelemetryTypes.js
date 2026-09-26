/**
 * Compact Telemetry Schema Definitions & Serialization
 * Enforces bandwidth-efficient telemetry with no raw camera frames or unbounded landmark payloads.
 */

/**
 * Creates a compact telemetry packet matching the Nuro-Beats Phase 1 specification
 * @param {Object} params
 * @returns {Object} Validated telemetry payload
 */
export function createTelemetryPacket({
  sessionId = null,
  timestamp = performance.now() / 1000,
  pose = {},
  movement = {},
  gait = {},
  sync = {},
  audio = {},
  performance: perf = {},
}) {
  return {
    session_id: sessionId,
    timestamp: Number(timestamp.toFixed(3)),

    pose: {
      confidence: Number((pose.confidence ?? 0).toFixed(3)),
      tracking_state: pose.tracking_state || 'LOST',
    },

    movement: {
      state: movement.state || 'STATIONARY',
      confidence: Number((movement.confidence ?? 0).toFixed(3)),
      quality: Math.round(movement.quality ?? 85),
    },

    gait: {
      cadence_spm: Number.isFinite(gait.cadence_spm) ? Number(gait.cadence_spm.toFixed(1)) : null,
      left_steps: Math.round(gait.left_steps ?? 0),
      right_steps: Math.round(gait.right_steps ?? 0),
      balance: Math.round(gait.balance ?? 100),
    },

    sync: {
      target_bpm: Math.round(sync.target_bpm ?? 60),
      score: Math.round(sync.score ?? 85),
      timing_error_ms: Math.round(sync.timing_error_ms ?? 0),
    },

    audio: {
      level: Number((audio.level ?? 0).toFixed(3)),
      activity: Boolean(audio.activity),
      confidence: Number((audio.confidence ?? 0).toFixed(3)),
    },

    performance: {
      camera_fps: Number((perf.camera_fps ?? 0).toFixed(1)),
      pose_fps: Number((perf.pose_fps ?? 0).toFixed(1)),
      inference_latency_ms: Number((perf.inference_latency_ms ?? 0).toFixed(1)),
      dropped_frames: Math.round(perf.dropped_frames ?? 0),
    },
  };
}

/**
 * Serializes telemetry packet safely to JSON
 */
export function serializeTelemetry(packet) {
  return JSON.stringify(packet);
}
