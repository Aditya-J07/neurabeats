"""
Unit tests for Authoritative SynchronizationEngine (v2.0)
tests/test_synchronization_engine.py

Verifies all 12 mandatory test cases from the specification:
Test 1: No pose -> accuracy = null
Test 2: Pose but zero movement -> accuracy = null
Test 3: One movement event -> accuracy = null if below minimum sample threshold (3)
Test 4: Several perfectly aligned movements -> near 100%, subject to coverage/confidence
Test 5: Several poorly aligned movements -> low score
Test 6: Mixed timing quality -> intermediate reproducible score
Test 7: Different BPMs -> correct adaptive tolerance
Test 8: Missing beat timestamp -> invalid event handling
Test 9: Left=0, right=0 -> symmetry = null
Test 10: Left=10, right=10 -> symmetry = 100% only when both sides are genuinely detected
Test 11: Left=10, right=5 -> symmetry = 50%
Test 12: Therapy BPM=60 but actual cadence differs -> actual cadence remains the measured cadence
"""

import unittest
from services.synchronization_engine import SynchronizationEngine


class TestSynchronizationEngine(unittest.TestCase):

    def test_01_no_pose(self):
        """Test 1: No pose -> accuracy = null, status = INSUFFICIENT_DATA"""
        payload = {
            "session_id": 101,
            "target_bpm": 60,
            "beat_timestamps_ms": [1000, 2000, 3000, 4000],
            "movement_events": [
                {"timestamp_ms": 1000, "type": "STEP", "side": "LEFT", "confidence": 0.9},
                {"timestamp_ms": 2000, "type": "STEP", "side": "RIGHT", "confidence": 0.9},
                {"timestamp_ms": 3000, "type": "STEP", "side": "LEFT", "confidence": 0.9}
            ],
            "valid_pose_frames": 0,
            "total_pose_frames": 100,
            "pose_confidence": 0.05
        }
        res = SynchronizationEngine.evaluate_session(payload)
        self.assertEqual(res["measurement_status"], "INSUFFICIENT_DATA")
        self.assertIsNone(res["synchronization_accuracy"])
        self.assertIsNone(res["cadence"])
        self.assertIsNone(res["symmetry"])

    def test_02_pose_but_zero_movement(self):
        """Test 2: Pose but zero movement -> accuracy = null, status = INSUFFICIENT_DATA"""
        payload = {
            "session_id": 102,
            "target_bpm": 60,
            "beat_timestamps_ms": [1000, 2000, 3000, 4000],
            "movement_events": [],
            "valid_pose_frames": 100,
            "total_pose_frames": 100,
            "pose_confidence": 0.92
        }
        res = SynchronizationEngine.evaluate_session(payload)
        self.assertEqual(res["measurement_status"], "INSUFFICIENT_DATA")
        self.assertIsNone(res["synchronization_accuracy"])
        self.assertIsNone(res["cadence"])
        self.assertIsNone(res["symmetry"])
        self.assertEqual(res["movement_event_count"], 0)

    def test_03_one_movement_event_below_min_threshold(self):
        """Test 3: One movement event -> accuracy = null if below minimum sample threshold (3)"""
        payload = {
            "session_id": 103,
            "target_bpm": 60,
            "beat_timestamps_ms": [1000, 2000, 3000],
            "movement_events": [
                {"timestamp_ms": 1010, "type": "STEP", "side": "LEFT", "confidence": 0.95}
            ],
            "valid_pose_frames": 90,
            "total_pose_frames": 100,
            "pose_confidence": 0.90
        }
        res = SynchronizationEngine.evaluate_session(payload)
        self.assertEqual(res["measurement_status"], "INSUFFICIENT_DATA")
        self.assertIsNone(res["synchronization_accuracy"])
        self.assertIsNone(res["cadence"])
        self.assertIsNone(res["symmetry"])
        self.assertEqual(res["verified_steps"], 1)

    def test_04_several_perfectly_aligned_movements(self):
        """Test 4: Several perfectly aligned movements -> near 100%"""
        payload = {
            "session_id": 104,
            "target_bpm": 60,
            "beat_timestamps_ms": [10000, 11000, 12000, 13000],
            "movement_events": [
                {"timestamp_ms": 10000, "type": "STEP", "side": "LEFT", "confidence": 1.0},
                {"timestamp_ms": 11000, "type": "STEP", "side": "RIGHT", "confidence": 1.0},
                {"timestamp_ms": 12000, "type": "STEP", "side": "LEFT", "confidence": 1.0},
                {"timestamp_ms": 13000, "type": "STEP", "side": "RIGHT", "confidence": 1.0}
            ],
            "valid_pose_frames": 200,
            "total_pose_frames": 200,
            "pose_confidence": 0.95
        }
        res = SynchronizationEngine.evaluate_session(payload)
        self.assertEqual(res["measurement_status"], "VALID")
        self.assertIsNotNone(res["synchronization_accuracy"])
        self.assertEqual(res["synchronization_accuracy"], 100.0)
        self.assertEqual(res["timing_error_mean_ms"], 0.0)
        self.assertEqual(res["movement_coverage"], 1.0)
        self.assertEqual(res["symmetry"], 100.0)
        self.assertEqual(res["cadence"], 60.0)

    def test_05_several_poorly_aligned_movements(self):
        """Test 5: Several poorly aligned movements -> low score"""
        # Beat interval 1000ms -> tolerance is min(250ms, 250ms) = 250ms
        # Offsets are 240ms, 250ms, 260ms -> score near 0
        payload = {
            "session_id": 105,
            "target_bpm": 60,
            "beat_timestamps_ms": [10000, 11000, 12000, 13000],
            "movement_events": [
                {"timestamp_ms": 10240, "type": "STEP", "side": "LEFT", "confidence": 0.9},
                {"timestamp_ms": 11250, "type": "STEP", "side": "RIGHT", "confidence": 0.9},
                {"timestamp_ms": 12260, "type": "STEP", "side": "LEFT", "confidence": 0.9},
                {"timestamp_ms": 13245, "type": "STEP", "side": "RIGHT", "confidence": 0.9}
            ],
            "valid_pose_frames": 200,
            "total_pose_frames": 200,
            "pose_confidence": 0.9
        }
        res = SynchronizationEngine.evaluate_session(payload)
        self.assertIsNotNone(res["synchronization_accuracy"])
        self.assertLess(res["synchronization_accuracy"], 10.0)
        self.assertGreater(res["timing_error_mean_ms"], 200.0)

    def test_06_mixed_timing_quality(self):
        """Test 6: Mixed timing quality -> intermediate reproducible score (Section 24 example)"""
        # Section 24 example:
        # Beats: 10000, 11000, 12000, 13000
        # Movement: 10100 (err 100), 10950 (err 50), 12080 (err 80), 12900 (err 100)
        # Tolerance at 60 BPM is min(1000 * 0.25, 250) = 250ms.
        # Scores: (1 - 100/250)=0.6, (1 - 50/250)=0.8, (1 - 80/250)=0.68, (1 - 100/250)=0.6
        # Mean score = (0.6 + 0.8 + 0.68 + 0.6) / 4 = 0.67
        # 100 * 0.67 * 1.0 = 67.0%
        payload = {
            "session_id": 106,
            "target_bpm": 60,
            "beat_timestamps_ms": [10000, 11000, 12000, 13000],
            "movement_events": [
                {"timestamp_ms": 10100, "type": "STEP", "side": "LEFT", "confidence": 1.0},
                {"timestamp_ms": 10950, "type": "STEP", "side": "RIGHT", "confidence": 1.0},
                {"timestamp_ms": 12080, "type": "STEP", "side": "LEFT", "confidence": 1.0},
                {"timestamp_ms": 12900, "type": "STEP", "side": "RIGHT", "confidence": 1.0}
            ],
            "valid_pose_frames": 200,
            "total_pose_frames": 200,
            "pose_confidence": 0.95
        }
        res = SynchronizationEngine.evaluate_session(payload)
        self.assertEqual(res["timing_error_mean_ms"], 82.5)  # (100+50+80+100)/4
        self.assertAlmostEqual(res["synchronization_accuracy"], 67.0, places=1)
        self.assertEqual(res["measurement_status"], "VALID")

    def test_07_different_bpms_adaptive_tolerance(self):
        """Test 7: Different BPMs -> correct adaptive tolerance"""
        # At 120 BPM: beat interval is 500ms -> tolerance is min(500 * 0.25, 250) = 125ms
        # An error of 100ms at 120 BPM gives (1 - 100/125) = 0.20 score (20%)
        # Whereas at 60 BPM: tolerance is 250ms -> (1 - 100/250) = 0.60 score (60%)
        payload_120 = {
            "session_id": 107,
            "target_bpm": 120,
            "beat_timestamps_ms": [10000, 10500, 11000, 11500],
            "movement_events": [
                {"timestamp_ms": 10100, "type": "STEP", "side": "LEFT", "confidence": 1.0},
                {"timestamp_ms": 10600, "type": "STEP", "side": "RIGHT", "confidence": 1.0},
                {"timestamp_ms": 11100, "type": "STEP", "side": "LEFT", "confidence": 1.0},
                {"timestamp_ms": 11600, "type": "STEP", "side": "RIGHT", "confidence": 1.0}
            ],
            "valid_pose_frames": 200,
            "total_pose_frames": 200,
            "pose_confidence": 0.95
        }
        res_120 = SynchronizationEngine.evaluate_session(payload_120)
        self.assertAlmostEqual(res_120["synchronization_accuracy"], 20.0, places=1)

    def test_08_missing_beat_timestamps(self):
        """Test 8: Missing beat timestamp -> invalid event handling, partial status"""
        payload = {
            "session_id": 108,
            "target_bpm": 60,
            "beat_timestamps_ms": [],
            "movement_events": [
                {"timestamp_ms": 1000, "type": "STEP", "side": "LEFT", "confidence": 0.9},
                {"timestamp_ms": 2000, "type": "STEP", "side": "RIGHT", "confidence": 0.9},
                {"timestamp_ms": 3000, "type": "STEP", "side": "LEFT", "confidence": 0.9}
            ],
            "valid_pose_frames": 100,
            "total_pose_frames": 100,
            "pose_confidence": 0.9
        }
        res = SynchronizationEngine.evaluate_session(payload)
        self.assertEqual(res["measurement_status"], "PARTIAL")
        self.assertIsNone(res["synchronization_accuracy"])
        self.assertIsNotNone(res["cadence"])  # Cadence can be calculated from step timestamps alone

    def test_09_left_zero_right_zero_symmetry_null(self):
        """Test 9: Left=0, right=0 -> symmetry = null"""
        symmetry = SynchronizationEngine._calculate_symmetry(0, 0)
        self.assertIsNone(symmetry)

    def test_10_left_ten_right_ten_symmetry_100(self):
        """Test 10: Left=10, right=10 -> symmetry = 100%"""
        symmetry = SynchronizationEngine._calculate_symmetry(10, 10)
        self.assertEqual(symmetry, 100.0)

    def test_11_left_ten_right_five_symmetry_50(self):
        """Test 11: Left=10, right=5 -> symmetry = 50%"""
        symmetry = SynchronizationEngine._calculate_symmetry(10, 5)
        self.assertEqual(symmetry, 50.0)

    def test_12_actual_cadence_independent_of_therapy_bpm(self):
        """Test 12: Therapy BPM=60 but actual cadence differs -> actual cadence remains measured cadence"""
        # User took steps every 800ms (75 SPM), but therapy target was 60 BPM (1000ms)
        payload = {
            "session_id": 112,
            "target_bpm": 60,
            "beat_timestamps_ms": [10000, 11000, 12000, 13000],
            "movement_events": [
                {"timestamp_ms": 10000, "type": "STEP", "side": "LEFT", "confidence": 0.9},
                {"timestamp_ms": 10800, "type": "STEP", "side": "RIGHT", "confidence": 0.9},
                {"timestamp_ms": 11600, "type": "STEP", "side": "LEFT", "confidence": 0.9},
                {"timestamp_ms": 12400, "type": "STEP", "side": "RIGHT", "confidence": 0.9}
            ],
            "valid_pose_frames": 200,
            "total_pose_frames": 200,
            "pose_confidence": 0.95
        }
        res = SynchronizationEngine.evaluate_session(payload)
        # Cadence should be 60000 / 800 = 75.0 SPM, NOT target_bpm (60)
        self.assertEqual(res["cadence"], 75.0)
        self.assertNotEqual(res["cadence"], payload["target_bpm"])


if __name__ == '__main__':
    unittest.main()
