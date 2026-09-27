"""
Canonical Session Mode Configuration for NeuroBeat AI

Defines the authoritative contract and normalization for therapy session modes:
1. Gait Trainer (gait_trainer)
2. Balance Training (balance_training)
3. Finger Tapping (finger_tapping)
4. Speech Rhythm (speech_rhythm)
Plus supported rehabilitation extensions (melodic_intonation, upper_limb_motor, cognitive_rhythm).
"""

from typing import Dict, Any, Optional
import logging

SESSION_MODES: Dict[str, Dict[str, Any]] = {
    "gait_trainer": {
        "key": "gait_trainer",
        "title": "Gait Trainer",
        "icon": "activity",
        "subtitle": "Synchronize your steps with the beat with full-body camera motion guidance and fused ML leg tracking",
        "camera_required": True,
        "microphone_required": False,
        "tracking_mode": "gait",
        "metric_group": "gait",
        "camera_view": "full-body",
        "camera_label": "Full-Body / Movement View",
        "camera_mode_badge": "Fused Leg Tracking",
        "guide_frame": "full-body",
        "guide_label": "Position Full Body or Legs in Frame",
        "instructions": (
            "Walk in place or around the room, synchronizing each step with the beat. "
            "Ensure your lower limbs and body are visible in the camera frame for fused ML leg tracking, "
            "step counting, and gait symmetry."
        ),
        "primary_metric_label": "Steps (L/R)",
        "secondary_metric_label": "Symmetry",
        "cadence_label": "Current BPM",
        "target_cadence_label": "Target BPM",
        "cadence_unit": "BPM",
        "motion_status_label": "Motion Status"
    },
    "balance_training": {
        "key": "balance_training",
        "title": "Balance Training",
        "icon": "shield",
        "subtitle": "Improve stability, posture alignment, and center-of-gravity balance with rhythmic auditory cues and posture tracking",
        "camera_required": True,
        "microphone_required": False,
        "tracking_mode": "balance",
        "metric_group": "balance",
        "camera_view": "full-body",
        "camera_label": "Posture & Balance View",
        "camera_mode_badge": "Posture & Stability Tracking",
        "guide_frame": "full-body",
        "guide_label": "Position your full body in frame",
        "instructions": (
            "Stand with feet shoulder-width apart or sit centered. Follow the rhythmic cues and maintain "
            "balanced weight distribution and center-of-gravity alignment while the AI tracks postural stability."
        ),
        "primary_metric_label": "Posture Sway",
        "secondary_metric_label": "Stability",
        "cadence_label": "Current BPM",
        "target_cadence_label": "Target BPM",
        "cadence_unit": "BPM",
        "motion_status_label": "Posture Status"
    },
    "finger_tapping": {
        "key": "finger_tapping",
        "title": "Finger Tapping",
        "icon": "move",
        "subtitle": "Enhance fine motor coordination and finger tapping speed aligned with auditory rhythmic stimulation",
        "camera_required": False,
        "microphone_required": False,
        "tracking_mode": "tapping",
        "metric_group": "tapping",
        "camera_view": "none",
        "camera_label": None,
        "camera_mode_badge": None,
        "guide_frame": None,
        "guide_label": None,
        "instructions": (
            "Tap rhythmically on your screen, tap pad, or press the Spacebar in sync with each auditory beat "
            "to stimulate fine-motor coordination and reduce motor freeze."
        ),
        "primary_metric_label": "Total Taps",
        "secondary_metric_label": "Tap Cadence",
        "cadence_label": "Current BPM",
        "target_cadence_label": "Target BPM",
        "cadence_unit": "BPM",
        "motion_status_label": "Tap Status"
    },
    "speech_rhythm": {
        "key": "speech_rhythm",
        "title": "Speech Rhythm",
        "icon": "mic",
        "subtitle": "Practice speech rhythm with syllable timing, audio rhythm synchronization, and vocal exercise",
        "camera_required": False,
        "microphone_required": True,
        "tracking_mode": "speech",
        "metric_group": "speech",
        "camera_view": "none",
        "camera_label": None,
        "camera_mode_badge": None,
        "guide_frame": None,
        "guide_label": None,
        "instructions": (
            "Speak the syllables rhythmically into your microphone in sync with each auditory beat. "
            "Practice clear vowel articulation, breath control, and steady speech cadence."
        ),
        "primary_metric_label": "Pacing (SPM)",
        "secondary_metric_label": "Vocal Sync",
        "cadence_label": "Current SPM",
        "target_cadence_label": "Target SPM",
        "cadence_unit": "SPM",
        "motion_status_label": "Voice Status"
    },
    "melodic_intonation": {
        "key": "melodic_intonation",
        "title": "Melodic Intonation",
        "icon": "music",
        "subtitle": "Use singing and melodic intonation to improve speech fluency with auditory rhythm cues",
        "camera_required": False,
        "microphone_required": True,
        "tracking_mode": "speech",
        "metric_group": "speech",
        "camera_view": "none",
        "camera_label": None,
        "camera_mode_badge": None,
        "guide_frame": None,
        "guide_label": None,
        "instructions": (
            "Sing along with the melodic patterns. Use your voice and intonation to follow "
            "the musical phrases in rhythm with the audio cues."
        ),
        "primary_metric_label": "Pacing (SPM)",
        "secondary_metric_label": "Vocal Sync",
        "cadence_label": "Current SPM",
        "target_cadence_label": "Target SPM",
        "cadence_unit": "SPM",
        "motion_status_label": "Voice Status"
    },
    "upper_limb_motor": {
        "key": "upper_limb_motor",
        "title": "Upper Limb Motor",
        "icon": "activity",
        "subtitle": "Coordinate arm and hand movements with rhythmic beats and real-time skeleton motion tracking",
        "camera_required": True,
        "microphone_required": False,
        "tracking_mode": "upper_limb",
        "metric_group": "upper_limb",
        "camera_view": "upper-body",
        "camera_label": "Upper-Body / Arm Movement View",
        "camera_mode_badge": "Arm Tracking",
        "guide_frame": "upper-body",
        "guide_label": "Frame Upper Body & Arms",
        "instructions": (
            "Move your arms and hands to the rhythm. Keep your upper body and arms visible "
            "in the camera frame to track movement synchronization and range of motion."
        ),
        "primary_metric_label": "Arm Movement",
        "secondary_metric_label": "Range",
        "cadence_label": "Current BPM",
        "target_cadence_label": "Target BPM",
        "cadence_unit": "BPM",
        "motion_status_label": "Motion Status"
    },
    "cognitive_rhythm": {
        "key": "cognitive_rhythm",
        "title": "Cognitive Rhythm",
        "icon": "zap",
        "subtitle": "Enhance attention, memory, and cognitive sequencing through rhythmic auditory stimulation",
        "camera_required": False,
        "microphone_required": False,
        "tracking_mode": "cognitive",
        "metric_group": "cognitive",
        "camera_view": "none",
        "camera_label": None,
        "camera_mode_badge": None,
        "guide_frame": None,
        "guide_label": None,
        "instructions": (
            "Follow the rhythmic patterns while performing mental sequencing tasks. "
            "Focus on attention and memory exercises synchronized with the beat."
        ),
        "primary_metric_label": "Sequencing",
        "secondary_metric_label": "Accuracy",
        "cadence_label": "Current BPM",
        "target_cadence_label": "Target BPM",
        "cadence_unit": "BPM",
        "motion_status_label": "Task Status"
    }
}

UNKNOWN_SESSION_MODE: Dict[str, Any] = {
    "key": "unknown",
    "title": "Therapy Session",
    "icon": "activity",
    "subtitle": "Personalized rhythmic neurorehabilitation therapy session",
    "camera_required": False,
    "microphone_required": False,
    "tracking_mode": "none",
    "metric_group": "general",
    "camera_view": "none",
    "camera_label": None,
    "camera_mode_badge": None,
    "guide_frame": None,
    "guide_label": None,
    "instructions": "Follow the auditory rhythm cues to stimulate neuroplasticity.",
    "primary_metric_label": "Progress",
    "secondary_metric_label": "Accuracy",
    "cadence_label": "Current BPM",
    "target_cadence_label": "Target BPM",
    "cadence_unit": "BPM",
    "motion_status_label": "Status"
}

# Explicit aliases mapping for normalization
NORMALIZATION_MAP: Dict[str, str] = {
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
}

def normalize_session_type(value: Any) -> str:
    """
    Safely normalizes input session type string to canonical key.
    Unknown or invalid types return 'unknown' without falling back to gait_trainer.
    """
    if not value or not isinstance(value, str):
        return "unknown"
    clean = value.strip().lower()
    normalized = NORMALIZATION_MAP.get(clean)
    if not normalized:
        logging.warning(f"[SESSION_MODE] Unrecognized session type '{value}' normalized to 'unknown'.")
        return "unknown"
    return normalized

def get_session_mode(session_type: Any) -> Dict[str, Any]:
    """
    Returns the canonical SessionModeConfig dictionary for the given session_type.
    Never returns Gait Trainer for unknown session types.
    """
    normalized_key = normalize_session_type(session_type)
    mode = SESSION_MODES.get(normalized_key)
    if mode:
        return mode.copy()
    return UNKNOWN_SESSION_MODE.copy()

def is_camera_required(session_type: Any) -> bool:
    """Check if camera access is required for this session type."""
    mode = get_session_mode(session_type)
    return bool(mode.get("camera_required", False))

def is_microphone_required(session_type: Any) -> bool:
    """Check if microphone access is required for this session type."""
    mode = get_session_mode(session_type)
    return bool(mode.get("microphone_required", False))
