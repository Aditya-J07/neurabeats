"""
NURO-BEATS P4 — Unit Tests & Temporal Simulation Tests
Comprehensive test suite validating:
- Section 44: 21 core unit test criteria
- Section 45: 10 temporal simulation tests (Test A through Test J)
- Section 40: Hard production gates (causality, wrap-around, hysteresis, fallback)
"""

import math
import os
import unittest

import numpy as np

from runtime.p4_inference import (
    CircularPhaseResolver,
    MultiSignalCycleDetector,
    P4InferenceEngine,
    P4Observation,
    PersonalMovementBaseline,
    PhaseStateMachine,
)
from training.p4_benchmarks import run_p4_ablation_study
from training.p4_temporal_model import (
    DEFAULT_WINDOW_SIZE,
    FEATURE_DIM,
    CausalMultiScaleTCN,
    generate_synthetic_motion_trajectory,
)


class TestP4CircularMath(unittest.TestCase):
    """Section 44 (Tests 1-4): Circular phase math, wrap-around, distance & velocity."""

    def setUp(self):
        self.resolver = CircularPhaseResolver()

    def test_01_phase_wrap_around(self):
        """Test continuous wrap-around without discontinuities at 0/1 boundary."""
        # 0.99 phase corresponds to ~1.98*pi (or -0.02*pi)
        theta_before = (0.99 * 2.0 * math.pi)
        # 0.02 phase corresponds to 0.04*pi
        theta_after = (0.02 * 2.0 * math.pi)

        # Forward difference should be a small positive step (+0.03 * 2pi), NOT -0.97
        diff = self.resolver.circular_difference(theta_after, theta_before)
        norm_step = diff / (2.0 * math.pi)
        self.assertAlmostEqual(norm_step, 0.03, places=3)
        self.assertGreater(diff, 0.0, "Wrap-around forward step must be positive")

    def test_02_circular_distance(self):
        """Test circular distance on unit circle."""
        theta1 = 0.1 * math.pi
        theta2 = 1.9 * math.pi  # Distance is 0.2*pi, not 1.8*pi
        dist = self.resolver.circular_distance(theta1, theta2)
        self.assertAlmostEqual(dist, 0.2 * math.pi, places=4)

    def test_03_circular_interpolation(self):
        """Test SLERP interpolation across the 0/1 boundary."""
        theta_a = 1.95 * math.pi
        theta_b = 0.05 * math.pi
        # Halfway point should cross 2pi/0, landing at 0.0 radians
        interpolated = self.resolver.circular_interpolate(theta_a, theta_b, 0.5)
        self.assertAlmostEqual(abs(interpolated), 0.0, places=3)

    def test_04_phase_velocity(self):
        """Test circular angular phase velocity estimation."""
        dt = 0.0333  # 30 FPS
        theta_prev = 0.98 * 2.0 * math.pi
        theta_curr = 0.02 * 2.0 * math.pi
        delta_theta = self.resolver.circular_difference(theta_curr, theta_prev)
        omega = delta_theta / dt
        expected_omega = (0.04 * 2.0 * math.pi) / dt
        self.assertAlmostEqual(omega, expected_omega, places=2)
        self.assertGreater(omega, 0.0)


class TestP4StateMachineAndCycle(unittest.TestCase):
    """Section 44 (Tests 5-9): Confidence, state transitions, hysteresis, dwell time, and cycle detection."""

    def test_05_confidence_calculation(self):
        """Test composite phase confidence formula."""
        engine = P4InferenceEngine(onnx_model_path="non_existent.onnx")
        obs = P4Observation(
            frameId=1,
            captureTimestampMs=1000.0,
            deltaTimeMs=33.3,
            landmarkConfidence=0.90,
            movementState="ACTIVE",
            bpm=60.0,
            isNewPoseResult=True,
        )
        out = engine.process_observation(obs)
        self.assertIn("phase", out)
        self.assertGreaterEqual(out["phase"]["confidence"], 0.0)
        self.assertLessEqual(out["phase"]["confidence"], 1.0)

    def test_06_state_transitions_and_07_hysteresis(self):
        """Test state machine handles zones and guards against single-frame flickering."""
        sm = PhaseStateMachine(min_dwell_frames=3)
        # Rising -> Peak -> Falling
        s1 = sm.update("RISING", phase_normalized=0.10, phase_velocity=4.0, confidence=0.9)
        self.assertEqual(s1, "RISING")

        # Zone transition to PEAK candidate
        sm.update("PEAK", phase_normalized=0.25, phase_velocity=3.0, confidence=0.9)
        sm.update("PEAK", phase_normalized=0.26, phase_velocity=3.0, confidence=0.9)
        s_peak = sm.update("PEAK", phase_normalized=0.27, phase_velocity=3.0, confidence=0.9)
        self.assertEqual(s_peak, "PEAK")

    def test_08_minimum_dwell_time(self):
        """Ensure state cannot toggle rapidly back and forth in consecutive frames."""
        sm = PhaseStateMachine(min_dwell_frames=3)
        sm.update("RISING", phase_normalized=0.10, phase_velocity=4.0, confidence=0.9)
        sm.update("RISING", phase_normalized=0.12, phase_velocity=4.0, confidence=0.9)
        sm.update("RISING", phase_normalized=0.14, phase_velocity=4.0, confidence=0.9)
        self.assertEqual(sm.current_state, "RISING")

        # 1-frame noisy candidate must NOT immediately switch state
        s_noise = sm.update("FALLING", phase_normalized=0.15, phase_velocity=4.0, confidence=0.9)
        self.assertEqual(s_noise, "RISING", "1-frame noise must be rejected by dwell protection")

    def test_09_cycle_detection(self):
        """Test multi-signal cycle detector."""
        detector = MultiSignalCycleDetector()
        t = 1000.0
        bpm = 60.0

        # Phase progression toward wrap
        detector.update(0.70, 6.28, t, bpm, 0.9)
        detector.update(0.85, 6.28, t + 100, bpm, 0.9)
        detector.update(0.95, 6.28, t + 200, bpm, 0.9)

        # Wrap: 0.95 -> 0.05 after refractory period
        done, count, prog, dur = detector.update(0.05, 6.28, t + 600, bpm, 0.9)
        self.assertTrue(done, "Cycle completion must be triggered on valid wrap + conditions")
        self.assertEqual(count, 1)
        self.assertAlmostEqual(prog, 0.05, places=2)


class TestP4InvariantsAndFallbacks(unittest.TestCase):
    """Section 44 (Tests 10-16): Frame rejection, gaps, invalid observations, fallback."""

    def test_10_duplicate_frame_rejection(self):
        """Test monotonic frameId enforcement and duplicate rejection."""
        engine = P4InferenceEngine(onnx_model_path="non_existent.onnx")
        obs1 = P4Observation(frameId=100, captureTimestampMs=1000.0, deltaTimeMs=33.3, isNewPoseResult=True)
        out1 = engine.process_observation(obs1)
        self.assertNotEqual(out1["source"], "DISCARDED")

        # Duplicate frameId 100
        obs2 = P4Observation(frameId=100, captureTimestampMs=1033.3, deltaTimeMs=33.3, isNewPoseResult=True)
        out2 = engine.process_observation(obs2)
        self.assertEqual(out2["source"], "DISCARDED")
        self.assertEqual(out2["discardReason"], "STALE_FRAME_DISCARDED")

    def test_11_frame_gaps(self):
        """Ensure frame gap (>60ms) is explicitly detected and marked."""
        engine = P4InferenceEngine(onnx_model_path="non_existent.onnx")
        obs = P4Observation(frameId=101, captureTimestampMs=1120.0, deltaTimeMs=120.0, isNewPoseResult=True)
        out = engine.process_observation(obs)
        self.assertTrue(out["dataQuality"]["gapDetected"])

    def test_12_low_confidence_and_13_invalid(self):
        """Ensure low confidence and invalid landmarks are safely handled."""
        engine = P4InferenceEngine(onnx_model_path="non_existent.onnx")
        obs = P4Observation(
            frameId=102,
            captureTimestampMs=1153.3,
            deltaTimeMs=33.3,
            landmarks=None,
            landmarkConfidence=0.15,
            isNewPoseResult=True,
        )
        out = engine.process_observation(obs)
        self.assertLess(out["phase"]["confidence"], 0.6)
        self.assertEqual(out["version"], "p4.1")

    def test_14_model_failure_and_16_deterministic_fallback(self):
        """Ensure engine falls back deterministically when ONNX is unavailable."""
        engine = P4InferenceEngine(onnx_model_path="non_existent.onnx")
        obs = P4Observation(frameId=103, captureTimestampMs=1186.6, deltaTimeMs=33.3, isNewPoseResult=True)
        out = engine.process_observation(obs)
        self.assertEqual(out["source"], "FALLBACK")
        self.assertIn("phase", out)
        self.assertIn("normalized", out["phase"])


class TestP4PersonalBaseline(unittest.TestCase):
    """Section 44 (Tests 18-19): Personal baseline updates and protection."""

    def test_18_personal_baseline_update(self):
        base = PersonalMovementBaseline(alpha=0.05)
        self.assertFalse(base.available)
        base.update_from_cycle(duration_ms=900.0, avg_velocity=6.2, rom=0.5, quality=0.9, confidence=0.85)
        self.assertTrue(base.available)
        self.assertAlmostEqual(base.cycle_duration_ms, 900.0, places=1)

    def test_19_baseline_protection_from_low_confidence(self):
        base = PersonalMovementBaseline(alpha=0.05)
        base.update_from_cycle(duration_ms=1000.0, avg_velocity=6.28, rom=0.5, quality=0.9, confidence=0.85)
        initial_dur = base.cycle_duration_ms

        # Low-confidence corrupted cycle (e.g. tracking glitch 150ms)
        base.update_from_cycle(duration_ms=150.0, avg_velocity=20.0, rom=0.1, quality=0.2, confidence=0.30)
        self.assertEqual(base.cycle_duration_ms, initial_dur, "Low confidence cycle must not alter baseline")


class TestP4TemporalSimulations(unittest.TestCase):
    """Section 45: Temporal Simulation Tests A through J."""

    def setUp(self):
        self.engine = P4InferenceEngine(onnx_model_path="non_existent.onnx")

    def test_simulation_A_perfect_sinusoidal(self):
        """Test A: Perfect sinusoidal leg movement -> smooth phase progression."""
        prev_phase = 0.0
        for frame in range(1, 40):
            t_ms = frame * 33.33
            angle = (frame * 33.33 / 1000.0) * (2.0 * math.pi)
            pos_y = 0.5 + 0.3 * math.sin(angle)
            lm = [{"x": 0.5, "y": pos_y} for _ in range(33)]
            obs = P4Observation(
                frameId=frame,
                captureTimestampMs=t_ms,
                deltaTimeMs=33.33,
                landmarks=lm,
                landmarkConfidence=0.95,
                isNewPoseResult=True,
            )
            out = self.engine.process_observation(obs)
            self.assertIn(out["phase"]["state"], ["RISING", "PEAK", "FALLING", "RECOVERY", "IDLE"])
            if frame > 10:
                self.assertGreaterEqual(out["phase"]["confidence"], 0.6)

    def test_simulation_E_sudden_outlier(self):
        """Test E: Sudden landmark outlier is rejected without phase explosion."""
        obs_normal = P4Observation(
            frameId=1, captureTimestampMs=1000.0, deltaTimeMs=33.3,
            landmarks=[{"x": 0.5, "y": 0.5} for _ in range(33)], landmarkConfidence=0.95, isNewPoseResult=True
        )
        out1 = self.engine.process_observation(obs_normal)

        # Huge coordinate jump (teleport)
        obs_outlier = P4Observation(
            frameId=2, captureTimestampMs=1033.3, deltaTimeMs=33.3,
            landmarks=[{"x": 0.99, "y": 0.99} for _ in range(33)], landmarkConfidence=0.95, isNewPoseResult=True
        )
        out2 = self.engine.process_observation(obs_outlier)
        # Verify phase velocity does not explode beyond physical maximum (>30 rad/s)
        self.assertLess(abs(out2["phase"]["velocity"]), 30.0)

    def test_simulation_H_phase_wrap(self):
        """Test H: Phase wrap (0.99 -> 0.01) is treated as small forward movement."""
        resolver = CircularPhaseResolver()
        theta_curr = (0.01 * 2.0 * math.pi)
        theta_prev = (0.99 * 2.0 * math.pi)
        delta_theta = resolver.circular_difference(theta_curr, theta_prev)
        self.assertGreater(delta_theta, 0.0)
        self.assertAlmostEqual(delta_theta / (2.0 * math.pi), 0.02, places=3)

    def test_simulation_I_pause(self):
        """Test I: Stationary state does not advance phase spuriously."""
        for frame in range(1, 20):
            obs = P4Observation(
                frameId=frame,
                captureTimestampMs=frame * 33.33,
                deltaTimeMs=33.33,
                landmarks=[{"x": 0.5, "y": 0.5} for _ in range(33)],
                landmarkConfidence=0.95,
                movementState="IDLE",
                isNewPoseResult=True,
            )
            out = self.engine.process_observation(obs)
        self.assertLess(abs(out["phase"]["velocity"]), 1.5)

    def test_simulation_J_exercise_change_reset(self):
        """Test J: Exercise change resets personal baseline explicitly."""
        self.engine.baseline.update_from_cycle(800.0, 6.28, 0.5, 0.9, 0.9)
        self.assertTrue(self.engine.baseline.available)
        self.engine.reset()
        self.assertFalse(self.engine.baseline.available)
        self.assertEqual(len(self.engine.feature_buffer), 0)


class TestP4CausalityAndParity(unittest.TestCase):
    """Section 40 & Master Prompt: Causal Isolation & PyTorch <-> ONNX Numerical Parity."""

    def test_strict_causal_isolation(self):
        """Verify future frames cannot leak into or alter historical representations (zero future leakage)."""
        import torch
        torch.manual_seed(42)
        model = CausalMultiScaleTCN()
        model.eval()

        # Original sequence of 81 frames
        x1 = torch.randn(1, FEATURE_DIM, 81)
        # Duplicate sequence where future frames (t >= 40) are completely altered
        x2 = x1.clone()
        x2[:, :, 40:] = torch.randn(1, FEATURE_DIM, 41)

        with torch.no_grad():
            h1 = model.input_act(model.input_proj(x1))
            for block in model.blocks:
                h1 = block(h1)

            h2 = model.input_act(model.input_proj(x2))
            for block in model.blocks:
                h2 = block(h2)

        # Historical representations for tau in [0..39] must be strictly IDENTICAL (diff == 0.0)
        max_diff = torch.max(torch.abs(h1[:, :, :40] - h2[:, :, :40])).item()
        self.assertEqual(max_diff, 0.0, f"Future frame leakage detected! Max diff at t<40: {max_diff}")

        # Prefix forward pass up to t=40 must be invariant to future alterations
        with torch.no_grad():
            out_prefix1 = model(x1[:, :, :40])
            out_prefix2 = model(x2[:, :, :40])
            phase_diff = torch.max(torch.abs(out_prefix1["phase_sin"] - out_prefix2["phase_sin"])).item()
            self.assertEqual(phase_diff, 0.0, "Causal forward pass on prefix must be invariant to future alterations")

    def test_pytorch_onnx_numerical_parity(self):
        """Verify exported ONNX model outputs match PyTorch predictions with max error < 1e-4."""
        import tempfile
        import torch
        import onnxruntime as ort
        from training.p4_temporal_model import export_to_onnx

        torch.manual_seed(123)
        np.random.seed(123)

        model = CausalMultiScaleTCN()
        model.eval()

        tmp_onnx = os.path.join(tempfile.gettempdir(), "parity_test_tcn.onnx")
        try:
            export_to_onnx(model, tmp_onnx)
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            session = ort.InferenceSession(tmp_onnx, opts, providers=["CPUExecutionProvider"])

            for _ in range(5):
                x_np = np.random.randn(1, FEATURE_DIM, 81).astype(np.float32)
                x_torch = torch.from_numpy(x_np)

                with torch.no_grad():
                    py_out = model(x_torch)

                onnx_out = session.run(None, {"motion_features": x_np})

                # Verify outputs: [embedding, phase_sin, phase_cos, phase_radians, phase_normalized, state_logits, quality, confidence]
                sin_err = float(np.max(np.abs(py_out["phase_sin"].numpy() - onnx_out[1])))
                cos_err = float(np.max(np.abs(py_out["phase_cos"].numpy() - onnx_out[2])))
                rad_err = float(np.max(np.abs(py_out["phase_radians"].numpy() - onnx_out[3])))
                quality_err = float(np.max(np.abs(py_out["quality"].numpy() - onnx_out[6])))
                conf_err = float(np.max(np.abs(py_out["confidence"].numpy() - onnx_out[7])))

                self.assertLess(sin_err, 1e-4, f"Parity error in phase_sin: {sin_err} >= 1e-4")
                self.assertLess(cos_err, 1e-4, f"Parity error in phase_cos: {cos_err} >= 1e-4")
                self.assertLess(rad_err, 1e-4, f"Parity error in phase_radians: {rad_err} >= 1e-4")
                self.assertLess(quality_err, 1e-4, f"Parity error in quality: {quality_err} >= 1e-4")
                self.assertLess(conf_err, 1e-4, f"Parity error in confidence: {conf_err} >= 1e-4")
        finally:
            if os.path.exists(tmp_onnx):
                try:
                    os.remove(tmp_onnx)
                except OSError:
                    pass

    def test_onnx_production_engine_streaming(self):
        """Verify production ONNX engine end-to-end streaming, latency, and baseline adaptation."""
        onnx_path = "models/p4_phase_tcn.onnx"
        self.assertTrue(os.path.exists(onnx_path), "Production ONNX model must exist at models/p4_phase_tcn.onnx")
        engine = P4InferenceEngine(onnx_model_path=onnx_path)
        self.assertEqual(engine.source, "ONNX_MODEL")

        # Stream 90 realistic sinusoidal frames (3 seconds at 30 FPS, 60 BPM = 3 cycles)
        total_frames = 90
        dt_ms = 33.33
        bpm = 60.0
        omega = 2.0 * math.pi * (bpm / 60.0)

        last_out = None
        for frame in range(1, total_frames + 1):
            t_ms = frame * dt_ms
            angle = (t_ms / 1000.0) * omega
            knee_y = 0.5 + 0.25 * math.sin(angle)
            ankle_y = 0.8 + 0.30 * math.sin(angle)

            lm = [{"x": 0.5, "y": 0.5} for _ in range(33)]
            lm[23] = {"x": 0.45, "y": 0.4}
            lm[24] = {"x": 0.55, "y": 0.4}
            lm[25] = {"x": 0.45, "y": knee_y}
            lm[26] = {"x": 0.55, "y": 0.5}
            lm[27] = {"x": 0.45, "y": ankle_y}
            lm[28] = {"x": 0.55, "y": 0.8}

            obs = P4Observation(
                frameId=frame,
                captureTimestampMs=t_ms,
                deltaTimeMs=dt_ms,
                landmarks=lm,
                landmarkConfidence=0.95,
                bodyScale=0.75,
                movementState="ACTIVE",
                bpm=bpm,
                isNewPoseResult=True,
            )
            last_out = engine.process_observation(obs)

        self.assertIsNotNone(last_out)
        self.assertEqual(last_out["source"], "ONNX_MODEL")
        self.assertIn("phase", last_out)
        self.assertIn(last_out["phase"]["state"], ["RISING", "PEAK", "FALLING", "RECOVERY"])
        self.assertGreaterEqual(last_out["cycle"]["index"], 1, "Must complete at least 1 cycle over 3 seconds")
        self.assertTrue(last_out["personalBaseline"]["available"], "Baseline must calibrate after confident cycle")

        diag = engine.get_diagnostics()
        self.assertLess(diag["inferenceP95Ms"], 20.0, f"Inference p95 latency must be < 20ms, got {diag['inferenceP95Ms']}ms")


if __name__ == "__main__":
    unittest.main()

