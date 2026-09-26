"""
Unit and Integration Tests for NURO-BEATS Offline Replay Engine
tests/test_replay_engine.py
"""

import unittest
import json
from datetime import datetime
from runtime.replay_engine import ReplayEngine, ReplayStep


class TestReplayEngine(unittest.TestCase):

    def setUp(self):
        self.sample_trace = {
            "session_id": 42,
            "patient_id": 7,
            "session_type": "gait_trainer",
            "initial_bpm": 60.0,
            "final_bpm": 64.0,
            "duration_seconds": 300,
            "events": [
                {
                    "id": 1,
                    "timestamp": 1000.0,
                    "event_type": "SESSION_CREATED",
                    "source": "LIFECYCLE",
                    "severity": "INFO",
                    "payload": {"session_id": 42}
                }
            ],
            "adaptations": [
                {
                    "id": 101,
                    "timestamp": "2026-09-27T00:00:15",
                    "parameter": "TEMPO",
                    "previous_value": 60.0,
                    "requested_value": 64.0,
                    "executed_value": 64.0,
                    "direction": "PROGRESS",
                    "trigger_reason": "High rhythm sync and low timing error.",
                    "validator_status": "APPROVED",
                    "clamp_reason": None
                },
                {
                    "id": 102,
                    "timestamp": "2026-09-27T00:01:00",
                    "parameter": "TEMPO",
                    "previous_value": 64.0,
                    "requested_value": 72.0,
                    "executed_value": 68.0,
                    "direction": "PROGRESS",
                    "trigger_reason": "Continued entrainment.",
                    "validator_status": "CLAMPED",
                    "clamp_reason": "STEP_CLAMPED: max delta 5.0 BPM"
                }
            ],
            "agent_decisions": [
                {
                    "id": 201,
                    "timestamp": "2026-09-27T00:00:15",
                    "intent": "PROGRESS",
                    "target": "TEMPO",
                    "action": "INCREASE_TEMPO",
                    "magnitude": 4.0,
                    "reason": "High rhythm sync and low timing error.",
                    "confidence": 0.92,
                    "validator_result": "APPROVED"
                },
                {
                    "id": 202,
                    "timestamp": "2026-09-27T00:01:00",
                    "intent": "PROGRESS",
                    "target": "TEMPO",
                    "action": "INCREASE_TEMPO",
                    "magnitude": 8.0,
                    "reason": "Continued entrainment.",
                    "confidence": 0.88,
                    "validator_result": "CLAMPED"
                }
            ],
            "interventions": [
                {
                    "id": 301,
                    "timestamp": "2026-09-27T00:00:15",
                    "parameter": "TEMPO",
                    "action": "INCREASE_TEMPO",
                    "before_bpm": 60.0,
                    "after_bpm": 64.0,
                    "outcome": {
                        "classification": "POSITIVE",
                        "delta_performance": 0.08,
                        "response_score": 0.075
                    }
                }
            ],
            "summary": {
                "starting_performance": 0.75,
                "ending_performance": 0.83,
                "improvement": 0.08,
                "best_tempo": 64.0,
                "successful_tempo_range": "60-64 BPM"
            },
            "metadata": {
                "P4_TEMPORAL": {"version": "1.0.0", "hash": "sha256_dummy"},
                "P2_POLICY": {"version": "2.0.0", "schema": "3.0"}
            },
            "schema_version": "3.0"
        }

    def test_trace_initialization(self):
        engine = ReplayEngine(self.sample_trace)
        self.assertEqual(engine.session_id, 42)
        self.assertEqual(len(engine.timeline), 2)
        self.assertEqual(engine.timeline[0].pre_bpm, 60.0)
        self.assertEqual(engine.timeline[0].executed_bpm, 64.0)
        self.assertEqual(engine.timeline[1].validator_status, "CLAMPED")

    def test_explain_decision(self):
        engine = ReplayEngine(self.sample_trace)
        explanation_0 = engine.explain_decision(0)
        self.assertIn("60.0", explanation_0["why"])
        self.assertIn("64.0", explanation_0["why"])
        self.assertIn("POSITIVE", explanation_0["why"])

        explanation_1 = engine.explain_decision(1)
        self.assertIn("STEP_CLAMPED", explanation_1["why"])
        self.assertEqual(explanation_1["causal_chain"]["p2_validation"]["status"], "CLAMPED")

    def test_verify_determinism_pass(self):
        engine = ReplayEngine(self.sample_trace)
        result = engine.verify_determinism()
        self.assertTrue(result["deterministic_pass"])
        self.assertEqual(len(result["violations"]), 0)

    def test_verify_determinism_detects_violations(self):
        corrupt_trace = json.loads(json.dumps(self.sample_trace))
        # Inject invalid step size (> 5 BPM executed)
        corrupt_trace["adaptations"][0]["executed_value"] = 80.0
        engine = ReplayEngine(corrupt_trace)
        result = engine.verify_determinism()
        self.assertFalse(result["deterministic_pass"])
        self.assertTrue(len(result["violations"]) > 0)


if __name__ == "__main__":
    unittest.main()
