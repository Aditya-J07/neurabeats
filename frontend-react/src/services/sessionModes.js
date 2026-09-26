/**
 * Canonical Session Mode Configuration for NeuroBeat AI React Frontend
 */

export const SESSION_MODES = Object.freeze({
  gait_trainer: {
    key: "gait_trainer",
    title: "Gait Trainer",
    icon: "activity",
    subtitle: "Synchronize your steps with the beat with full-body camera motion guidance and fused ML leg tracking",
    cameraRequired: true,
    microphoneRequired: false,
    trackingMode: "gait",
    metricGroup: "gait",
    cameraView: "full-body",
    cameraLabel: "Full-Body / Movement View",
    cameraModeLabel: "Fused Leg Tracking",
    guideFrame: "full-body",
    guideLabel: "Position Full Body or Legs in Frame",
    instructions: "Walk in place or around the room, synchronizing each step with the beat. Ensure your lower limbs and body are visible in the camera frame for fused ML leg tracking, step counting, and gait symmetry.",
    primaryMetricLabel: "Steps (L/R)",
    secondaryMetricLabel: "Symmetry",
    cadenceUnit: "BPM"
  },
  balance_training: {
    key: "balance_training",
    title: "Balance Training",
    icon: "shield",
    subtitle: "Improve stability, posture alignment, and center-of-gravity balance with rhythmic auditory cues and posture tracking",
    cameraRequired: true,
    microphoneRequired: false,
    trackingMode: "balance",
    metricGroup: "balance",
    cameraView: "full-body",
    cameraLabel: "Posture & Balance View",
    cameraModeLabel: "Posture & Stability Tracking",
    guideFrame: "full-body",
    guideLabel: "Position your full body in frame",
    instructions: "Stand with feet shoulder-width apart or sit centered. Follow the rhythmic cues and maintain balanced weight distribution and center-of-gravity alignment while the AI tracks postural stability.",
    primaryMetricLabel: "Posture Sway",
    secondaryMetricLabel: "Stability",
    cadenceUnit: "BPM"
  },
  finger_tapping: {
    key: "finger_tapping",
    title: "Finger Tapping",
    icon: "move",
    subtitle: "Enhance fine motor coordination and finger tapping speed aligned with auditory rhythmic stimulation",
    cameraRequired: false,
    microphoneRequired: false,
    trackingMode: "tapping",
    metricGroup: "tapping",
    cameraView: "none",
    cameraLabel: null,
    cameraModeLabel: null,
    guideFrame: null,
    guideLabel: null,
    instructions: "Tap rhythmically on your screen, tap pad, or press the Spacebar in sync with each auditory beat to stimulate fine-motor coordination and reduce motor freeze.",
    primaryMetricLabel: "Total Taps",
    secondaryMetricLabel: "Tap Cadence",
    cadenceUnit: "BPM"
  },
  speech_rhythm: {
    key: "speech_rhythm",
    title: "Speech Rhythm",
    icon: "mic",
    subtitle: "Practice speech rhythm with syllable timing, audio rhythm synchronization, and vocal exercise",
    cameraRequired: false,
    microphoneRequired: true,
    trackingMode: "speech",
    metricGroup: "speech",
    cameraView: "none",
    cameraLabel: null,
    cameraModeLabel: null,
    guideFrame: null,
    guideLabel: null,
    instructions: "Speak the syllables rhythmically into your microphone in sync with each auditory beat. Practice clear vowel articulation, breath control, and steady speech cadence.",
    primaryMetricLabel: "Pacing (SPM)",
    secondaryMetricLabel: "Vocal Sync",
    cadenceUnit: "SPM"
  },
  melodic_intonation: {
    key: "melodic_intonation",
    title: "Melodic Intonation",
    icon: "music",
    subtitle: "Use singing and melodic intonation to improve speech fluency with auditory rhythm cues",
    cameraRequired: false,
    microphoneRequired: true,
    trackingMode: "speech",
    metricGroup: "speech",
    cameraView: "none",
    cameraLabel: null,
    cameraModeLabel: null,
    guideFrame: null,
    guideLabel: null,
    instructions: "Sing along with the melodic patterns. Use your voice and intonation to follow the musical phrases in rhythm with the audio cues.",
    primaryMetricLabel: "Pacing (SPM)",
    secondaryMetricLabel: "Vocal Sync",
    cadenceUnit: "SPM"
  },
  upper_limb_motor: {
    key: "upper_limb_motor",
    title: "Upper Limb Motor",
    icon: "activity",
    subtitle: "Coordinate arm and hand movements with rhythmic beats and real-time skeleton motion tracking",
    cameraRequired: true,
    microphoneRequired: false,
    trackingMode: "upper_limb",
    metricGroup: "upper_limb",
    cameraView: "upper-body",
    cameraLabel: "Upper-Body / Arm Movement View",
    cameraModeLabel: "Arm Tracking",
    guideFrame: "upper-body",
    guideLabel: "Frame Upper Body & Arms",
    instructions: "Move your arms and hands to the rhythm. Keep your upper body and arms visible in the camera frame to track movement synchronization and range of motion.",
    primaryMetricLabel: "Arm Movement",
    secondaryMetricLabel: "Range",
    cadenceUnit: "BPM"
  },
  cognitive_rhythm: {
    key: "cognitive_rhythm",
    title: "Cognitive Rhythm",
    icon: "zap",
    subtitle: "Enhance attention, memory, and cognitive sequencing through rhythmic auditory stimulation",
    cameraRequired: false,
    microphoneRequired: false,
    trackingMode: "cognitive",
    metricGroup: "cognitive",
    cameraView: "none",
    cameraLabel: null,
    cameraModeLabel: null,
    guideFrame: null,
    guideLabel: null,
    instructions: "Follow the rhythmic patterns while performing mental sequencing tasks. Focus on attention and memory exercises synchronized with the beat.",
    primaryMetricLabel: "Sequencing",
    secondaryMetricLabel: "Accuracy",
    cadenceUnit: "BPM"
  }
});

export const UNKNOWN_SESSION_MODE = Object.freeze({
  key: "unknown",
  title: "Therapy Session",
  icon: "activity",
  subtitle: "Personalized rhythmic neurorehabilitation therapy session",
  cameraRequired: false,
  microphoneRequired: false,
  trackingMode: "none",
  metricGroup: "general",
  cameraView: "none",
  cameraLabel: null,
  cameraModeLabel: null,
  guideFrame: null,
  guideLabel: null,
  instructions: "Follow the auditory rhythm cues to stimulate neuroplasticity.",
  primaryMetricLabel: "Progress",
  secondaryMetricLabel: "Accuracy",
  cadenceUnit: "BPM"
});

const NORMALIZATION_MAP = {
  "gait_trainer": "gait_trainer",
  "gait": "gait_trainer",
  "walking": "gait_trainer",
  "balance_training": "balance_training",
  "balance": "balance_training",
  "posture": "balance_training",
  "finger_tapping": "finger_tapping",
  "finger-tapping": "finger_tapping",
  "tapping": "finger_tapping",
  "speech_rhythm": "speech_rhythm",
  "speech": "speech_rhythm",
  "vocal": "speech_rhythm",
  "melodic_intonation": "melodic_intonation",
  "melodic": "melodic_intonation",
  "upper_limb_motor": "upper_limb_motor",
  "upper_limb": "upper_limb_motor",
  "arm": "upper_limb_motor",
  "cognitive_rhythm": "cognitive_rhythm",
  "cognitive": "cognitive_rhythm"
};

export function normalizeSessionType(value) {
  if (!value || typeof value !== 'string') return "unknown";
  const clean = value.trim().toLowerCase();
  return NORMALIZATION_MAP[clean] || "unknown";
}

export function getSessionMode(sessionType) {
  const normalized = normalizeSessionType(sessionType);
  if (SESSION_MODES[normalized]) {
    return { ...SESSION_MODES[normalized] };
  }
  return { ...UNKNOWN_SESSION_MODE };
}

export function cameraRequired(sessionType) {
  const mode = getSessionMode(sessionType);
  return Boolean(mode && mode.cameraRequired);
}

export function microphoneRequired(sessionType) {
  const mode = getSessionMode(sessionType);
  return Boolean(mode && mode.microphoneRequired);
}

export function trackingMode(sessionType) {
  const mode = getSessionMode(sessionType);
  return (mode && mode.trackingMode) || "none";
}

export function transformLandmarkToCanvas(
  landmark,
  videoWidth,
  videoHeight,
  canvasWidth,
  canvasHeight,
  renderMode = 'contain',
  mirrored = false
) {
  if (!landmark) return null;

  const vW = videoWidth > 0 ? videoWidth : 640;
  const vH = videoHeight > 0 ? videoHeight : 480;
  const cW = canvasWidth > 0 ? canvasWidth : vW;
  const cH = canvasHeight > 0 ? canvasHeight : vH;

  let renderW = cW;
  let renderH = cH;
  let offsetX = 0;
  let offsetY = 0;

  if (renderMode === 'contain') {
    const videoRatio = vW / vH;
    const canvasRatio = cW / cH;
    if (canvasRatio > videoRatio) {
      renderH = cH;
      renderW = cH * videoRatio;
      offsetX = (cW - renderW) / 2;
      offsetY = 0;
    } else {
      renderW = cW;
      renderH = cW / videoRatio;
      offsetX = 0;
      offsetY = (cH - renderH) / 2;
    }
  } else if (renderMode === 'cover') {
    const videoRatio = vW / vH;
    const canvasRatio = cW / cH;
    if (canvasRatio > videoRatio) {
      renderW = cW;
      renderH = cW / videoRatio;
      offsetX = 0;
      offsetY = (cH - renderH) / 2;
    } else {
      renderH = cH;
      renderW = cH * videoRatio;
      offsetX = (cW - renderW) / 2;
      offsetY = 0;
    }
  }

  const normX = mirrored ? (1 - landmark.x) : landmark.x;
  const normY = landmark.y;

  return {
    x: offsetX + normX * renderW,
    y: offsetY + normY * renderH,
    z: landmark.z || 0,
    visibility: typeof landmark.visibility === 'number' ? landmark.visibility : 1.0,
    renderRect: {
      width: renderW,
      height: renderH,
      offsetX,
      offsetY
    }
  };
}
