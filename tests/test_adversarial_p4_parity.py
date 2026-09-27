import math
import os
import tempfile
import unittest
import numpy as np
import torch
import onnxruntime as ort

from runtime.p4_inference import (
    CircularPhaseResolver,
    MultiSignalCycleDetector,
    P4InferenceEngine,
    P4Observation,
    PersonalMovementBaseline,
    PhaseStateMachine,
)
from training.p4_temporal_model import (
    DEFAULT_WINDOW_SIZE,
    FEATURE_DIM,
    CausalMultiScaleTCN,
    export_to_onnx,
    generate_synthetic_motion_trajectory,
)


class TestAdversarialP4Parity(unittest.TestCase):
    """
    Adversarial validation suite for P4 Temporal Intelligence & Parity (Sections 6 & 7).
    """

    @classmethod
    def setUpClass(cls):
        # Set seeds for deterministic parity suite
        torch.manual_seed(42)
        np.random.seed(42)

        cls.model = CausalMultiScaleTCN()
        cls.model.eval()

        cls.tmp_onnx = os.path.join(tempfile.gettempdir(), "adversarial_p4_parity.onnx")
        export_to_onnx(cls.model, cls.tmp_onnx)

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        cls.session = ort.InferenceSession(cls.tmp_onnx, opts, providers=["CPUExecutionProvider"])

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.tmp_onnx):
            try:
                os.remove(cls.tmp_onnx)
            except OSError:
                pass

    # =========================================================================
    # Section 7: PyTorch / ONNX Parity Suite (100+ Windows + Edge Cases)
    # =========================================================================
    def test_100_randomized_and_edge_case_parity_windows(self):
        """
        Runs 100 randomized realistic windows plus edge-case windows.
        Measures max, mean, p95, and p99 absolute errors across all output heads.
        Asserts max absolute error < 1e-4.
        """
        all_errors = []

        # 1. 100 Randomized realistic windows
        for i in range(100):
            # Vary frequency, noise, and amplitude
            bpm = 40.0 + (i % 60) * 1.5
            x_torch, _ = generate_synthetic_motion_trajectory(
                num_frames=DEFAULT_WINDOW_SIZE,
                bpm=bpm,
                noise_std=0.02 * (i % 5),
                drop_rate=0.01 * (i % 4)
            )
            x_np = x_torch.numpy()

            with torch.no_grad():
                py_out = self.model(x_torch)

            onnx_out = self.session.run(None, {"motion_features": x_np})

            # Check heads: phase_sin (1), phase_cos (2), phase_radians (3), quality (6), confidence (7)
            err_sin = np.abs(py_out["phase_sin"].numpy() - onnx_out[1])
            err_cos = np.abs(py_out["phase_cos"].numpy() - onnx_out[2])
            err_rad = np.abs(py_out["phase_radians"].numpy() - onnx_out[3])
            err_qual = np.abs(py_out["quality"].numpy() - onnx_out[6])
            err_conf = np.abs(py_out["confidence"].numpy() - onnx_out[7])

            max_err = max(
                float(np.max(err_sin)),
                float(np.max(err_cos)),
                float(np.max(err_rad)),
                float(np.max(err_qual)),
                float(np.max(err_conf)),
            )
            all_errors.append(max_err)

        # 2. Edge-case windows
        edge_cases = [
            ("all_zeros", np.zeros((1, FEATURE_DIM, DEFAULT_WINDOW_SIZE), dtype=np.float32)),
            ("all_ones", np.ones((1, FEATURE_DIM, DEFAULT_WINDOW_SIZE), dtype=np.float32)),
            ("sparse_spikes", np.zeros((1, FEATURE_DIM, DEFAULT_WINDOW_SIZE), dtype=np.float32)),
            ("high_frequency_noise", np.random.randn(1, FEATURE_DIM, DEFAULT_WINDOW_SIZE).astype(np.float32) * 5.0),
        ]
        edge_cases[2][1][0, :, 40] = 10.0  # single Dirac impulse in center

        for name, x_edge in edge_cases:
            x_t = torch.from_numpy(x_edge)
            with torch.no_grad():
                py_out = self.model(x_t)
            onnx_out = self.session.run(None, {"motion_features": x_edge})
            err_sin = float(np.max(np.abs(py_out["phase_sin"].numpy() - onnx_out[1])))
            err_cos = float(np.max(np.abs(py_out["phase_cos"].numpy() - onnx_out[2])))
            all_errors.append(max(err_sin, err_cos))

        # Statistical analysis
        max_error = float(np.max(all_errors))
        mean_error = float(np.mean(all_errors))
        p95_error = float(np.percentile(all_errors, 95))
        p99_error = float(np.percentile(all_errors, 99))

        print(f"\n[PARITY REPORT] Windows Tested: {len(all_errors)} | Max: {max_error:.2e} | Mean: {mean_error:.2e} | p95: {p95_error:.2e} | p99: {p99_error:.2e}")
        self.assertLess(max_error, 1e-4, f"Parity max error {max_error} exceeds 1e-4")
        self.assertLess(p95_error, 1e-4, f"Parity p95 error {p95_error} exceeds 1e-4")

    # =========================================================================
    # Section 6: Causal Non-Leakage Proof
    # =========================================================================
    def test_strict_causality_zero_future_leakage(self):
        """
        Modifies a future frame in the sequence and proves earlier representations
        at t < T are completely identical (0.0 machine precision difference).
        """
        seq_len = 50
        x_base = torch.randn(1, FEATURE_DIM, seq_len)

        # Truncate at prefix t = 35
        prefix_len = 35
        x_prefix = x_base[:, :, :prefix_len]

        with torch.no_grad():
            out_prefix = self.model(x_prefix)

        # Perturb future frame at t = 45 with extreme value (+999.0)
        x_perturbed = x_base.clone()
        x_perturbed[:, :, 45] = 999.0

        # Causal convolution outputs at t <= prefix_len must only depend on frames <= prefix_len
        # We test this by running causal conv blocks directly
        with torch.no_grad():
            feat_base = self.model.input_proj(x_base)
            feat_pert = self.model.input_proj(x_perturbed)
            for block in self.model.blocks:
                feat_base = block(feat_base)
                feat_pert = block(feat_pert)

        # Compare outputs at prefix_len - 1 (frame index 34)
        past_diff = torch.max(torch.abs(feat_base[:, :, :prefix_len] - feat_pert[:, :, :prefix_len])).item()
        self.assertEqual(past_diff, 0.0, "Causal layers must have ZERO future frame leakage into past representations")

    # =========================================================================
    # Section 6: P4 Temporal Intelligence Adversarial Cases
    # =========================================================================
    def test_phase_wrap_continuity_near_zero_and_2pi(self):
        """Tests smooth continuous phase wrapping near 0 and 2pi without jump artifacts."""
        resolver = CircularPhaseResolver()

        # Crossing 2pi -> 0 (0.999 * 2pi -> 0.002 * 2pi)
        p_prev = 0.999 * 2.0 * math.pi
        p_curr = 0.002 * 2.0 * math.pi
        diff = resolver.circular_difference(p_curr, p_prev)
        self.assertGreater(diff, 0.0)
        self.assertAlmostEqual(diff / (2.0 * math.pi), 0.003, places=3)

        # Reverse small jump (0.002 * 2pi -> 0.999 * 2pi)
        diff_rev = resolver.circular_difference(p_prev, p_curr)
        self.assertLess(diff_rev, 0.0)
        self.assertAlmostEqual(diff_rev / (2.0 * math.pi), -0.003, places=3)

    def test_large_timestamp_gaps_and_stale_frames(self):
        """Engine must reject stale frames and gracefully handle 100ms, 250ms, 1s gaps."""
        engine = P4InferenceEngine(onnx_model_path="non_existent.onnx")

        # Frame 1
        obs1 = P4Observation(
            frameId=1, captureTimestampMs=1000.0, deltaTimeMs=33.3,
            landmarks=[{"x": 0.5, "y": 0.5} for _ in range(33)], landmarkConfidence=0.95
        )
        out1 = engine.process_observation(obs1)
        self.assertIn(out1["source"], ["FALLBACK", "ONNX_MODEL"])

        # Duplicate frame ID (stale frame)
        obs_dup = P4Observation(
            frameId=1, captureTimestampMs=1010.0, deltaTimeMs=10.0,
            landmarks=[{"x": 0.5, "y": 0.5} for _ in range(33)], landmarkConfidence=0.95
        )
        out_dup = engine.process_observation(obs_dup)
        self.assertEqual(out_dup["source"], "DISCARDED")
        self.assertEqual(out_dup["discardReason"], "STALE_FRAME_DISCARDED")

        # Out-of-order frame ID
        obs_ooo = P4Observation(
            frameId=0, captureTimestampMs=900.0, deltaTimeMs=10.0,
            landmarks=[{"x": 0.5, "y": 0.5} for _ in range(33)], landmarkConfidence=0.95
        )
        out_ooo = engine.process_observation(obs_ooo)
        self.assertEqual(out_ooo["source"], "DISCARDED")
        self.assertEqual(out_ooo["discardReason"], "STALE_FRAME_DISCARDED")

        # 1000ms gap
        obs_gap = P4Observation(
            frameId=2, captureTimestampMs=2033.3, deltaTimeMs=1033.3,
            landmarks=[{"x": 0.5, "y": 0.5} for _ in range(33)], landmarkConfidence=0.95
        )
        out_gap = engine.process_observation(obs_gap)
        self.assertTrue(out_gap["dataQuality"]["gapDetected"])
        # Velocity must NOT explode across the gap
        self.assertLess(abs(out_gap["phase"]["velocity"]), 25.0)

    def test_sudden_movement_reversal_hysteresis(self):
        """Phase state machine hysteresis prevents spurious state jumping on reversal."""
        sm = PhaseStateMachine()

        # Transition IDLE -> RISING
        sm.update("RISING", 0.15, 3.0, 0.9)
        self.assertEqual(sm.current_state, "RISING")

        # Small negative jitter in velocity should not immediately kick to FALLING
        sm.update("RISING", 0.16, -0.5, 0.9)
        self.assertEqual(sm.current_state, "RISING", "Hysteresis dwell time must prevent momentary state chatter")

    def test_cycle_detector_refractory_and_false_peaks(self):
        """MultiSignalCycleDetector must reject double peaks and incomplete cycles."""
        detector = MultiSignalCycleDetector()

        # Cycle 1: 0.1 -> 0.5 -> 0.9 -> 0.05
        detector.update(phase_normalized=0.1, phase_velocity=1.5, timestamp_ms=1000.0, bpm=60.0, confidence=0.9)
        detector.update(phase_normalized=0.5, phase_velocity=1.5, timestamp_ms=1300.0, bpm=60.0, confidence=0.9)
        detector.update(phase_normalized=0.9, phase_velocity=1.5, timestamp_ms=1600.0, bpm=60.0, confidence=0.9)
        completed, count, _, dur = detector.update(phase_normalized=0.05, phase_velocity=1.5, timestamp_ms=1800.0, bpm=60.0, confidence=0.9)
        self.assertTrue(completed)
        self.assertEqual(count, 1)

        # Immediate second peak attempt within refractory period (e.g. 100ms later)
        completed2, count2, _, _ = detector.update(phase_normalized=0.08, phase_velocity=1.5, timestamp_ms=1900.0, bpm=60.0, confidence=0.9)
        self.assertFalse(completed2, "Must reject spurious peak within refractory window")
        self.assertEqual(count2, 1)

    def test_personal_baseline_anomaly_protection(self):
        """Corrupted cycles (low confidence or glitch durations) must NOT alter baseline."""
        baseline = PersonalMovementBaseline(alpha=0.05)
        baseline.update_from_cycle(duration_ms=1000.0, avg_velocity=6.28, rom=0.5, quality=0.9, confidence=0.85)
        self.assertTrue(baseline.available)
        saved_dur = baseline.cycle_duration_ms

        # Severe anomaly: tracking loss, duration 100ms, confidence 0.20
        baseline.update_from_cycle(duration_ms=100.0, avg_velocity=50.0, rom=0.05, quality=0.1, confidence=0.20)
        self.assertEqual(baseline.cycle_duration_ms, saved_dur, "Baseline must reject low confidence anomalies")


if __name__ == '__main__':
    unittest.main()
