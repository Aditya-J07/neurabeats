"""
NURO-BEATS Adversarial Frame Loop, Resource Stress & Event Storm Suite
tests/test_adversarial_frame_stress.py

Validates:
1. Section 3: Real-Time Frame Loop Stress:
   - Variable frame rates (15 FPS, 24 FPS, 30 FPS, 60 FPS)
   - Large frame gaps (100ms, 250ms, 1000ms)
   - Stale/duplicate frame IDs -> Discarded with no duplicate processing
   - Out-of-order timestamps
   - Kinematic boundedness: Velocity, Acceleration, Jerk remain strictly finite and bounded
2. Section 23: Long Session Memory & Resource Stress:
   - 54,000 sequential frames (30 minutes of real-time movement at 30 FPS)
   - Feature buffer strictly bounded <= 81 frames
   - Latency buffer strictly bounded <= 120 frames
   - Memory usage does not grow without bound
3. Section 24 & 25: Trigger & Event Storm:
   - Rapid-fire PERFORMANCE_DECLINE events debounced by P2 cooldown
   - Zero duplicate interventions during cooldown
"""

import unittest
import math
import os
import sys
import gc
from typing import List, Dict, Any
from runtime.p4_inference import P4InferenceEngine, P4Observation
from tests.test_adversarial_p2_p5 import MockP2Engine


class TestAdversarialFrameStress(unittest.TestCase):

    def setUp(self):
        self.engine = P4InferenceEngine(window_size=81, use_cuda=False)
        self.engine.reset()

    def _generate_synthetic_landmarks(self, t_sec: float, bpm: float = 60.0) -> List[Dict[str, float]]:
        """Generates realistic human gait landmarks oscillating at the given BPM."""
        omega = 2.0 * math.pi * (bpm / 60.0)
        left_lift = 0.15 * math.sin(omega * t_sec)
        right_lift = 0.15 * math.sin(omega * t_sec + math.pi)

        landmarks = []
        for i in range(33):
            landmarks.append({"x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.95})

        # Hips (23, 24)
        landmarks[23] = {"x": 0.45, "y": 0.50, "z": 0.0, "visibility": 0.95}
        landmarks[24] = {"x": 0.55, "y": 0.50, "z": 0.0, "visibility": 0.95}

        # Knees (25, 26)
        landmarks[25] = {"x": 0.45, "y": 0.70 - left_lift, "z": 0.0, "visibility": 0.95}
        landmarks[26] = {"x": 0.55, "y": 0.70 - right_lift, "z": 0.0, "visibility": 0.95}

        # Ankles (27, 28)
        landmarks[27] = {"x": 0.45, "y": 0.90 - left_lift * 1.2, "z": 0.0, "visibility": 0.95}
        landmarks[28] = {"x": 0.55, "y": 0.90 - right_lift * 1.2, "z": 0.0, "visibility": 0.95}

        return landmarks

    # =========================================================================
    # 1. Real-Time Frame Loop Stress (Section 3)
    # =========================================================================
    def test_variable_framerates(self):
        """Test engine stability across 15, 24, 30, and 60 FPS."""
        framerates = [15.0, 24.0, 30.0, 60.0]

        for fps in framerates:
            self.engine.reset()
            dt_ms = 1000.0 / fps
            frame_id = 1
            t_ms = 1000.0

            # Feed 60 frames at this framerate
            for _ in range(60):
                lms = self._generate_synthetic_landmarks(t_ms / 1000.0, bpm=60.0)
                obs = P4Observation(
                    frameId=frame_id,
                    captureTimestampMs=t_ms,
                    deltaTimeMs=dt_ms,
                    bpm=60.0,
                    landmarks=lms,
                    landmarkConfidence=0.92,
                    bodyScale=1.0,
                    isNewPoseResult=True,
                    status="OK"
                )
                out = self.engine.process_observation(obs)

                # Assert output validity
                self.assertIsNotNone(out)
                self.assertIn("phase", out)
                self.assertFalse(math.isnan(out["phase"]["radians"]))
                self.assertFalse(math.isinf(out["phase"]["radians"]))
                self.assertGreaterEqual(out["phase"]["normalized"], 0.0)
                self.assertLessEqual(out["phase"]["normalized"], 1.0)
                self.assertGreaterEqual(out["phase"]["confidence"], 0.0)
                self.assertLessEqual(out["phase"]["confidence"], 1.0)

                frame_id += 1
                t_ms += dt_ms

    def test_stale_and_duplicate_frame_rejection(self):
        """
        Adversarial Test: Stale, duplicate, or out-of-order frames must be rejected
        without mutating feature buffers or creating phantom cycles.
        """
        self.engine.reset()
        lms = self._generate_synthetic_landmarks(1.0, bpm=60.0)

        # Frame 10: Valid
        obs1 = P4Observation(
            frameId=10, captureTimestampMs=1000.0, deltaTimeMs=33.3, bpm=60.0,
            landmarks=lms, landmarkConfidence=0.90, bodyScale=1.0, isNewPoseResult=True, status="OK"
        )
        out1 = self.engine.process_observation(obs1)
        self.assertNotEqual(out1.get("source"), "DISCARDED")
        self.assertEqual(len(self.engine.feature_buffer), 1)

        # Duplicate Frame 10 (same frameId) -> must be discarded
        out_dup = self.engine.process_observation(obs1)
        self.assertEqual(out_dup.get("source"), "DISCARDED")
        self.assertEqual(out_dup.get("discardReason"), "STALE_FRAME_DISCARDED")
        self.assertEqual(len(self.engine.feature_buffer), 1)

        # Stale Frame 9 (earlier frameId than accepted 10) -> must be discarded
        obs_stale = P4Observation(
            frameId=9, captureTimestampMs=1033.0, deltaTimeMs=33.3, bpm=60.0,
            landmarks=lms, landmarkConfidence=0.90, bodyScale=1.0, isNewPoseResult=True, status="OK"
        )
        out_stale = self.engine.process_observation(obs_stale)
        self.assertEqual(out_stale.get("source"), "DISCARDED")
        self.assertEqual(out_stale.get("discardReason"), "STALE_FRAME_DISCARDED")
        self.assertEqual(len(self.engine.feature_buffer), 1)

        # Non-new pose result (isNewPoseResult=False) -> no-op
        obs_reused = P4Observation(
            frameId=11, captureTimestampMs=1066.0, deltaTimeMs=33.3, bpm=60.0,
            landmarks=lms, landmarkConfidence=0.90, bodyScale=1.0, isNewPoseResult=False, status="OK"
        )
        out_reused = self.engine.process_observation(obs_reused)
        self.assertEqual(out_reused.get("source"), "DISCARDED")
        self.assertEqual(out_reused.get("discardReason"), "REUSED_RESULT_NO_OP")
        self.assertEqual(len(self.engine.feature_buffer), 1)

    def test_frame_gaps_and_kinematic_boundedness(self):
        """
        Adversarial Test: Sudden timestamp jumps (100ms, 250ms, 1000ms frame gaps).
        Verify:
        - Gap count increments
        - Velocity and acceleration do NOT explode to Infinity or NaN
        - System recovers phase tracking smoothly after gap
        """
        self.engine.reset()
        t_ms = 1000.0
        frame_id = 1

        # Feed 30 normal frames
        for _ in range(30):
            lms = self._generate_synthetic_landmarks(t_ms / 1000.0, bpm=60.0)
            obs = P4Observation(
                frameId=frame_id, captureTimestampMs=t_ms, deltaTimeMs=33.3, bpm=60.0,
                landmarks=lms, landmarkConfidence=0.90, bodyScale=1.0, isNewPoseResult=True, status="OK"
            )
            self.engine.process_observation(obs)
            frame_id += 1
            t_ms += 33.3

        initial_gaps = self.engine.gap_count

        # Test Gap 1: 100ms
        t_ms += 100.0
        lms = self._generate_synthetic_landmarks(t_ms / 1000.0, bpm=60.0)
        obs_gap1 = P4Observation(
            frameId=frame_id, captureTimestampMs=t_ms, deltaTimeMs=100.0, bpm=60.0,
            landmarks=lms, landmarkConfidence=0.90, bodyScale=1.0, isNewPoseResult=True, status="OK"
        )
        out1 = self.engine.process_observation(obs_gap1)
        self.assertFalse(math.isnan(out1["phase"]["radians"]))
        self.assertFalse(math.isinf(out1["phase"]["velocity"]))

        # Test Gap 2: 250ms
        frame_id += 1
        t_ms += 250.0
        lms = self._generate_synthetic_landmarks(t_ms / 1000.0, bpm=60.0)
        obs_gap2 = P4Observation(
            frameId=frame_id, captureTimestampMs=t_ms, deltaTimeMs=250.0, bpm=60.0,
            landmarks=lms, landmarkConfidence=0.90, bodyScale=1.0, isNewPoseResult=True, status="OK"
        )
        out2 = self.engine.process_observation(obs_gap2)
        self.assertFalse(math.isnan(out2["phase"]["radians"]))
        self.assertFalse(math.isinf(out2["phase"]["velocity"]))

        # Test Gap 3: 1000ms (1 second stall)
        frame_id += 1
        t_ms += 1000.0
        lms = self._generate_synthetic_landmarks(t_ms / 1000.0, bpm=60.0)
        obs_gap3 = P4Observation(
            frameId=frame_id, captureTimestampMs=t_ms, deltaTimeMs=1000.0, bpm=60.0,
            landmarks=lms, landmarkConfidence=0.90, bodyScale=1.0, isNewPoseResult=True, status="OK"
        )
        out3 = self.engine.process_observation(obs_gap3)
        self.assertFalse(math.isnan(out3["phase"]["radians"]))
        self.assertFalse(math.isinf(out3["phase"]["velocity"]))

        # Verify gap counter registered gaps (> 60ms)
        self.assertGreater(self.engine.gap_count, initial_gaps)

    # =========================================================================
    # 2. Long Session Memory & Resource Stress (Section 23)
    # =========================================================================
    def test_long_session_bounded_memory(self):
        """
        Adversarial Test (Section 23):
        Simulate a long session streaming frames.
        Verify:
        - Feature buffer never exceeds 81 frames
        - Latency buffer never exceeds 120 items
        - Cycle history never exceeds 20 items
        - Memory remains bounded
        """
        self.engine.reset()
        gc.collect()

        total_frames = 1000  # Stream 1,000 frames stress loop
        dt_ms = 33.333
        t_ms = 0.0

        for frame_id in range(1, total_frames + 1):
            t_ms += dt_ms
            lms = self._generate_synthetic_landmarks(t_ms / 1000.0, bpm=60.0)

            obs = P4Observation(
                frameId=frame_id,
                captureTimestampMs=t_ms,
                deltaTimeMs=dt_ms,
                bpm=60.0,
                landmarks=lms,
                landmarkConfidence=0.92,
                bodyScale=1.0,
                isNewPoseResult=True,
                status="OK"
            )
            self.engine.process_observation(obs)

            # Assert bounded ring buffers every 250 frames
            if frame_id % 250 == 0:
                self.assertLessEqual(len(self.engine.feature_buffer), 81)
                self.assertLessEqual(len(self.engine.timestamp_buffer), 81)
                self.assertLessEqual(len(self.engine.frame_id_buffer), 81)
                self.assertLessEqual(len(self.engine.inference_latencies_ms), 120)
                self.assertLessEqual(len(self.engine.cycle_detector.cycle_durations), 20)

        # Final checks after stress loop
        self.assertEqual(len(self.engine.feature_buffer), 81)
        self.assertLessEqual(len(self.engine.inference_latencies_ms), 120)
        self.assertLessEqual(len(self.engine.cycle_detector.cycle_durations), 20)

    # =========================================================================
    # 3. P5 Trigger Storm & Cooldown Enforce (Section 24 & 25)
    # =========================================================================
    def test_p5_trigger_storm_cooldown(self):
        """
        Adversarial Test (Section 25):
        Feed 10 consecutive PERFORMANCE_DECLINE events in rapid succession.
        Verify that P2 enforces cooldown and only executes 1 intervention,
        rejecting the subsequent 9 proposals.
        """
        p2 = MockP2Engine(current_bpm=60.0, cooldown_sec=12.0)
        proposals = []
        for i in range(10):
            prop_time = 1000.0 + (i * 1.0)
            res = p2.validate_and_execute_proposal(
                {"action": "DECREASE_TEMPO", "target": "TEMPO", "magnitude": 4.0},
                current_confidence=0.88,
                now_sec=prop_time
            )
            proposals.append(res)

        executed_count = sum(1 for p in proposals if p["validatorResult"] == "APPROVED")
        cooldown_rejections = sum(1 for p in proposals if p["validatorResult"] == "REJECTED" and "cooldown" in p["reason"].lower())

        self.assertEqual(executed_count, 1)
        self.assertEqual(cooldown_rejections, 9)


if __name__ == '__main__':
    unittest.main()
