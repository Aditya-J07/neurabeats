import unittest
import math
import random
from services.measurement_service import (
    MeasurementService,
    FEATURE_SCHEMA_VERSION,
    measurement_service
)

class TestAdversarialP1(unittest.TestCase):
    """
    Adversarial validation suite for P1 Measurement & Kinematics Layer (Section 5).
    Verifies that under all pathological, noisy, boundary, and malformed inputs:
    - Outputs remain bounded and finite (no NaN, Infinity, negative impossible values)
    - Quality gating safely isolates corrupted frames
    - Derived metrics remain mathematically valid
    """

    def setUp(self):
        self.svc = MeasurementService()

    def test_perfectly_stationary_telemetry(self):
        """Stationary user input: zero cadence, zero velocity, perfect bounds."""
        telemetry = {
            "measurement_quality": {"tracking_coverage": 0.98, "critical_landmark_coverage": 0.98, "overall": 0.98},
            "gait": {
                "valid": True,
                "cadence_spm": 0.0,
                "cadence_cv": 0.0,
                "left_steps": 0,
                "right_steps": 0,
                "temporal_asymmetry_pct": 0.0
            },
            "movement": {
                "left_knee_rom_deg": 0.0,
                "right_knee_rom_deg": 0.0,
                "movement_amplitude": 0.0,
                "trunk_tilt_deg": 0.0
            },
            "sync": {
                "mean_abs_error_ms": 0.0,
                "rhythm_alignment_score": 100.0,
                "early_events": 0,
                "late_events": 0
            }
        }
        fv = self.svc.extract_feature_vector(telemetry)
        # Low steps should safely gate valid gait
        self.assertFalse(fv["gait"]["valid"])
        self.assertEqual(fv["gait"]["reason"], "INSUFFICIENT_STEPS")
        self.assertEqual(fv["gait"]["cadence_spm"], 0.0)
        self.assertEqual(fv["movement"]["movement_amplitude"], 0.0)
        self.assertFalse(math.isnan(fv["gait"]["cadence"]["value"]))
        self.assertFalse(math.isinf(fv["gait"]["cadence"]["value"]))

    def test_constant_speed_and_sinusoidal_telemetry(self):
        """Constant-speed and sinusoidal inputs: smoothly bounded metrics."""
        # Simulated sinusoidal gait
        for t in range(20):
            sin_rom = 45.0 + 15.0 * math.sin(t * 0.314)
            telemetry = {
                "measurement_quality": {"tracking_coverage": 0.95, "critical_landmark_coverage": 0.95, "overall": 0.95},
                "gait": {
                    "valid": True,
                    "cadence_spm": 60.0,
                    "cadence_cv": 0.04,
                    "left_steps": 10 + t,
                    "right_steps": 10 + t,
                    "temporal_asymmetry_pct": 2.5
                },
                "movement": {
                    "left_knee_rom_deg": sin_rom,
                    "right_knee_rom_deg": sin_rom * 0.98,
                    "movement_amplitude": 0.30
                }
            }
            fv = self.svc.extract_feature_vector(telemetry)
            self.assertTrue(fv["gait"]["valid"])
            self.assertGreaterEqual(fv["movement"]["left_knee_rom_deg"], 30.0)
            self.assertLessEqual(fv["movement"]["left_knee_rom_deg"], 60.0)
            self.assertFalse(math.isnan(fv["movement"]["left_knee_rom_deg"]))

    def test_random_and_alternating_noise(self):
        """Random jitter and alternating noise should not produce unbounded metrics."""
        random.seed(42)
        for _ in range(50):
            noise_cadence = random.uniform(-100.0, 500.0)
            noise_asym = random.uniform(-50.0, 200.0)
            noise_rom = random.uniform(-180.0, 360.0)
            telemetry = {
                "measurement_quality": {"tracking_coverage": random.uniform(0.0, 1.0), "critical_landmark_coverage": 0.90},
                "gait": {
                    "cadence_spm": noise_cadence,
                    "temporal_asymmetry_pct": noise_asym,
                    "left_steps": random.randint(-5, 50),
                    "right_steps": random.randint(-5, 50)
                },
                "movement": {
                    "left_knee_rom_deg": noise_rom,
                    "movement_amplitude": random.uniform(-1.0, 20.0)
                }
            }
            fv = self.svc.extract_feature_vector(telemetry)
            # Verify sanitization clamping
            self.assertGreaterEqual(fv["gait"]["cadence_spm"], 0.0)
            self.assertLessEqual(fv["gait"]["cadence_spm"], 300.0)
            self.assertGreaterEqual(fv["gait"]["temporal_asymmetry_pct"], 0.0)
            self.assertLessEqual(fv["gait"]["temporal_asymmetry_pct"], 100.0)
            self.assertGreaterEqual(fv["movement"]["left_knee_rom_deg"], 0.0)
            self.assertLessEqual(fv["movement"]["left_knee_rom_deg"], 180.0)
            self.assertGreaterEqual(fv["gait"]["left_steps"], 0)
            self.assertGreaterEqual(fv["gait"]["right_steps"], 0)

    def test_nan_and_infinity_injection(self):
        """Adversarial NaN, Infinity, -Infinity injection into every telemetry field."""
        corrupted_telemetry = {
            "measurement_quality": {
                "tracking_coverage": float('nan'),
                "critical_landmark_coverage": float('inf'),
                "overall": float('-inf')
            },
            "gait": {
                "valid": True,
                "cadence_spm": float('nan'),
                "cadence_cv": float('inf'),
                "left_steps": float('nan'),
                "right_steps": float('inf'),
                "temporal_asymmetry_pct": float('nan'),
                "swing_asymmetry_pct": float('inf'),
                "lift_asymmetry_pct": float('-inf')
            },
            "movement": {
                "left_knee_rom_deg": float('nan'),
                "right_knee_rom_deg": float('inf'),
                "movement_amplitude": float('-inf'),
                "trunk_tilt_deg": float('nan'),
                "tap_count": float('nan'),
                "tap_cadence_tpm": float('inf')
            },
            "sync": {
                "mean_abs_error_ms": float('nan'),
                "rhythm_alignment_score": float('inf'),
                "early_events": float('nan'),
                "late_events": float('inf'),
                "rmse_ms": float('nan')
            },
            "balance": {
                "stability_index": float('nan'),
                "sway_rms": float('inf'),
                "sway_velocity": float('-inf'),
                "path_length": float('nan')
            }
        }
        fv = self.svc.extract_feature_vector(corrupted_telemetry)

        # None of the values should be NaN or Infinite
        self.assertFalse(math.isnan(fv["gait"]["cadence_spm"]))
        self.assertFalse(math.isinf(fv["gait"]["cadence_spm"]))
        self.assertFalse(math.isnan(fv["movement"]["left_knee_rom_deg"]))
        self.assertFalse(math.isinf(fv["movement"]["left_knee_rom_deg"]))
        self.assertFalse(math.isnan(fv["movement"]["right_knee_rom_deg"]))
        self.assertFalse(math.isinf(fv["movement"]["right_knee_rom_deg"]))
        self.assertFalse(math.isnan(fv["sync"]["mean_abs_error_ms"]["value"]))
        self.assertFalse(math.isinf(fv["sync"]["mean_abs_error_ms"]["value"]))
        self.assertFalse(math.isnan(fv["balance"]["stability_index"]))
        self.assertFalse(math.isinf(fv["balance"]["stability_index"]))
        self.assertFalse(math.isnan(fv["quality"]["tracking_coverage"]))
        self.assertFalse(math.isinf(fv["quality"]["tracking_coverage"]))

    def test_missing_landmarks_and_empty_payload(self):
        """Completely empty, None, or omitted telemetry."""
        fv_empty = self.svc.extract_feature_vector({})
        self.assertEqual(fv_empty["schema_version"], FEATURE_SCHEMA_VERSION)
        self.assertFalse(fv_empty["gait"]["valid"])
        self.assertEqual(fv_empty["gait"]["total_steps"], 0)

        fv_none = self.svc.extract_feature_vector(None)
        self.assertEqual(fv_none["schema_version"], FEATURE_SCHEMA_VERSION)
        self.assertFalse(fv_none["gait"]["valid"])

    def test_confidence_boundary_sweep(self):
        """
        Sweeps tracking coverage and quality confidence across boundaries:
        0.0, 0.44, 0.45, 0.49, 0.50, 1.0.
        Verifies state transitions and gating.
        """
        boundaries = [0.0, 0.44, 0.45, 0.49, 0.50, 1.0]
        for conf in boundaries:
            telemetry = {
                "measurement_quality": {
                    "tracking_coverage": conf,
                    "critical_landmark_coverage": conf,
                    "overall": conf
                },
                "gait": {
                    "valid": True,
                    "cadence_spm": 60.0,
                    "left_steps": 10,
                    "right_steps": 10
                }
            }
            fv = self.svc.extract_feature_vector(telemetry)
            if conf < 0.60:
                self.assertFalse(fv["gait"]["valid"])
                self.assertEqual(fv["gait"]["reason"], "LOW_TRACKING_COVERAGE")
                self.assertEqual(fv["quality"]["quality_state"], "POOR")
            elif conf < 0.75:
                self.assertEqual(fv["quality"]["quality_state"], "FAIR")
            elif conf < 0.90:
                self.assertEqual(fv["quality"]["quality_state"], "GOOD")
            else:
                self.assertEqual(fv["quality"]["quality_state"], "EXCELLENT")

            # Confidence envelope must always stay strictly in [0.0, 1.0]
            envelope_conf = fv["gait"]["cadence"]["confidence"]
            self.assertGreaterEqual(envelope_conf, 0.0)
            self.assertLessEqual(envelope_conf, 1.0)

    def test_reliability_calculations_adversarial(self):
        """Test-retest reliability under identical, inverted, and singleton series."""
        # Single observation (should reject without dividing by zero)
        res_single = self.svc.compute_test_retest_reliability([50.0], [52.0])
        self.assertFalse(res_single["valid"])
        self.assertEqual(res_single["reason"], "INSUFFICIENT_PAIRED_SAMPLES")

        # Zero variation series
        res_zero_var = self.svc.compute_test_retest_reliability([60.0, 60.0, 60.0], [60.0, 60.0, 60.0])
        self.assertTrue(res_zero_var["valid"])
        self.assertEqual(res_zero_var["sem"], 0.0)
        self.assertEqual(res_zero_var["mdc95"], 0.0)
        self.assertEqual(res_zero_var["cv_pct"], 0.0)

        # Single series CV
        res_series = self.svc.compute_test_retest_reliability([55.0, 60.0, 65.0])
        self.assertTrue(res_series["valid"])
        self.assertGreater(res_series["cv_pct"], 0.0)

if __name__ == '__main__':
    unittest.main()
