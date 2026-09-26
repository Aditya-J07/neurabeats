import unittest
from services.measurement_service import (
    MeasurementService,
    FEATURE_SCHEMA_VERSION,
    measurement_service
)
from services.gemini_service import generate_validated_measurement_summary

class TestMeasurementLayer(unittest.TestCase):
    def setUp(self):
        self.svc = MeasurementService()

    def test_feature_vector_schema_v2(self):
        """Test extraction of versioned v2.0 feature vector with standard metadata and quality gating."""
        raw_telemetry = {
            "schema_version": "2.0",
            "session_id": 42,
            "measurement_quality": {
                "overall": 0.94,
                "tracking_coverage": 0.97,
                "critical_landmark_coverage": 0.96,
                "quality_state": "EXCELLENT"
            },
            "gait": {
                "valid": True,
                "cadence_spm": 56.4,
                "cadence_cv": 0.06,
                "step_interval_mean_s": 1.06,
                "step_interval_median_s": 1.05,
                "step_interval_sd_s": 0.08,
                "left_steps": 15,
                "right_steps": 14,
                "temporal_asymmetry_pct": 3.8,
                "swing_asymmetry_pct": 2.1,
                "lift_asymmetry_pct": 4.2
            },
            "movement": {
                "left_knee_rom_deg": 48.2,
                "right_knee_rom_deg": 46.5,
                "movement_amplitude": 0.28
            },
            "sync": {
                "signed_error_ms_mean": -12.4,
                "mean_abs_error_ms": 48.2,
                "median_abs_error_ms": 42.0,
                "rmse_ms": 58.1,
                "p90_abs_error_ms": 92.0,
                "p95_abs_error_ms": 115.0,
                "on_time_pct": 82.5,
                "early_events": 16,
                "late_events": 8,
                "total_events": 29,
                "rhythm_alignment_score": 86.4
            }
        }

        fv = self.svc.extract_feature_vector(raw_telemetry)
        
        # Verify schema version
        self.assertEqual(fv["schema_version"], FEATURE_SCHEMA_VERSION)
        self.assertEqual(fv["session_id"], 42)
        
        # Check standard metadata envelope structure on derived measurements
        cadence_meta = fv["gait"]["cadence"]
        self.assertEqual(cadence_meta["value"], 56.4)
        self.assertEqual(cadence_meta["unit"], "steps/min")
        self.assertGreaterEqual(cadence_meta["confidence"], 0.9)
        self.assertEqual(cadence_meta["quality"], "EXCELLENT")
        self.assertEqual(cadence_meta["sample_count"], 29)
        self.assertEqual(cadence_meta["valid_event_count"], 29)
        self.assertEqual(cadence_meta["uncertainty"]["type"], "cv")
        self.assertEqual(cadence_meta["uncertainty"]["value"], 0.06)

        # Check temporal asymmetry
        sym_meta = fv["gait"]["temporal_asymmetry"]
        self.assertEqual(sym_meta["value"], 3.8)
        self.assertEqual(sym_meta["unit"], "%")

        # Check sync metrics
        sync = fv["sync"]
        self.assertEqual(sync["mean_abs_error_ms"]["value"], 48.2)
        self.assertEqual(sync["rhythm_alignment_score"]["value"], 86.4)
        self.assertEqual(sync["early_late_ratio"], 2.0)  # 16 early / 8 late

    def test_low_tracking_coverage_gating(self):
        """Low tracking coverage (<0.60) must mark gait as invalid with explicit reason."""
        low_cov_telemetry = {
            "tracking_coverage": 0.45,
            "critical_landmark_coverage": 0.40,
            "cadence_spm": 60.0,
            "left_steps": 10,
            "right_steps": 10
        }
        fv = self.svc.extract_feature_vector(low_cov_telemetry)
        self.assertFalse(fv["gait"]["valid"])
        self.assertEqual(fv["gait"]["reason"], "LOW_TRACKING_COVERAGE")
        self.assertEqual(fv["quality"]["quality_state"], "POOR")

    def test_insufficient_steps_gating(self):
        """Total steps < 2 must mark gait as invalid with INSUFFICIENT_STEPS reason."""
        few_steps_telemetry = {
            "tracking_coverage": 0.95,
            "critical_landmark_coverage": 0.95,
            "left_steps": 1,
            "right_steps": 0
        }
        fv = self.svc.extract_feature_vector(few_steps_telemetry)
        self.assertFalse(fv["gait"]["valid"])
        self.assertEqual(fv["gait"]["reason"], "INSUFFICIENT_STEPS")

    def test_10mwt_assessment(self):
        """Standardized 10MWT computes walking speed from known physical distance, NOT body pixels."""
        result = self.svc.evaluate_10mwt(distance_m=10.0, elapsed_time_s=8.0, step_count=16)
        
        self.assertTrue(result["valid"])
        self.assertEqual(result["assessment_type"], "10_METER_WALK_TEST")
        self.assertAlmostEqual(result["speed_mps"], 1.25)
        self.assertAlmostEqual(result["cadence_spm"], 120.0)
        self.assertAlmostEqual(result["mean_step_length_m"], 0.625)

    def test_10mwt_invalid_inputs(self):
        """10MWT rejects negative or zero duration/distance safely."""
        res_zero = self.svc.evaluate_10mwt(distance_m=10.0, elapsed_time_s=0.0)
        self.assertFalse(res_zero["valid"])
        self.assertEqual(res_zero["reason"], "INVALID_DISTANCE_OR_DURATION")

    def test_tug_assessment(self):
        """Standardized Timed Up and Go (TUG) evaluator categorizes mobility time safely."""
        fast_tug = self.svc.evaluate_tug(elapsed_time_s=8.5)
        self.assertTrue(fast_tug["valid"])
        self.assertEqual(fast_tug["mobility_category"], "FREELY_MOBILE")

        normal_tug = self.svc.evaluate_tug(elapsed_time_s=10.5)
        self.assertTrue(normal_tug["valid"])
        self.assertEqual(normal_tug["mobility_category"], "NORMAL_MOBILITY")

        moderate_tug = self.svc.evaluate_tug(elapsed_time_s=15.0)
        self.assertTrue(moderate_tug["valid"])
        self.assertEqual(moderate_tug["mobility_category"], "MODERATE_MOBILITY_REDUCTION")

        slow_tug = self.svc.evaluate_tug(elapsed_time_s=25.0)
        self.assertTrue(slow_tug["valid"])
        self.assertEqual(slow_tug["mobility_category"], "REDUCED_FUNCTIONAL_MOBILITY")

    def test_test_retest_reliability(self):
        """Test-retest computes SEM, MDC95, and CV across repeated observations."""
        identical_sessions = [55.0, 55.0, 55.0]
        res_ident = self.svc.compute_test_retest_reliability(identical_sessions)
        self.assertTrue(res_ident["valid"])
        self.assertAlmostEqual(res_ident["cv_pct"], 0.0)
        self.assertAlmostEqual(res_ident["sem"], 0.0)
        self.assertAlmostEqual(res_ident["mdc95"], 0.0)

        varying_sessions = [52.0, 56.0, 54.0, 58.0]
        res_var = self.svc.compute_test_retest_reliability(varying_sessions)
        self.assertTrue(res_var["valid"])
        self.assertGreater(res_var["mean"], 50.0)
        self.assertGreater(res_var["sem"], 0.0)
        self.assertGreater(res_var["mdc95"], 0.0)

    def test_reference_validation(self):
        """Reference validation accurately measures MAE, RMSE, and Mean Bias against ground-truth."""
        # e.g., comparison of device cadence vs instrumented pressure walkway cadence
        device_vals = [55.0, 60.0, 58.0, 62.0]
        reference_vals = [54.0, 59.0, 59.0, 61.0]

        eval_res = self.svc.evaluate_reference_validation(device_vals, reference_vals)
        self.assertTrue(eval_res["valid"])
        self.assertEqual(eval_res["sample_count"], 4)
        self.assertAlmostEqual(eval_res["mae"], 1.0)
        self.assertAlmostEqual(eval_res["mean_bias"], 0.5)  # (1 + 1 - 1 + 1) / 4 = 2 / 4 = 0.5
        self.assertAlmostEqual(eval_res["rmse"], 1.0)

    def test_gemini_5_heading_summary(self):
        """Gemini measurement summary must contain the 5 required headings from Section 43."""
        feature_vector = self.svc.extract_feature_vector({
            "schema_version": "2.0",
            "session_id": 99,
            "measurement_quality": {
                "overall": 0.95,
                "tracking_coverage": 0.98,
                "critical_landmark_coverage": 0.97,
                "quality_state": "EXCELLENT"
            },
            "gait": {
                "valid": True,
                "cadence_spm": 58.2,
                "cadence_cv": 0.05,
                "step_interval_mean_s": 1.03,
                "left_steps": 20,
                "right_steps": 19,
                "temporal_asymmetry_pct": 2.5
            },
            "sync": {
                "mean_abs_error_ms": 44.0,
                "median_abs_error_ms": 38.0,
                "rhythm_alignment_score": 88.0,
                "on_time_pct": 85.0
            }
        })

        summary = generate_validated_measurement_summary(
            feature_vector,
            patient_name="Alex Mercer",
            condition="Post-Stroke Hemiparesis"
        )

        self.assertIn("report", summary)
        report_upper = summary["report"].upper()

        # 5 Mandatory Headings (Section 43)
        self.assertIn("OBJECTIVE MEASUREMENTS", report_upper)
        self.assertIn("OBSERVED PATTERN", report_upper)
        self.assertIn("MEASUREMENT QUALITY", report_upper)
        self.assertIn("SESSION SUMMARY", report_upper)
        self.assertIn("ITEMS FOR CLINICIAN REVIEW", report_upper)

        # Prohibited diagnostic claims check
        self.assertNotIn("clinical diagnosis", summary["report"].lower())
        self.assertNotIn("diagnose", summary["report"].lower())

if __name__ == '__main__':
    unittest.main()
