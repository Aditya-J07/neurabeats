import unittest
import json
from app import app
import routes
from models import db, User, PatientProfile, TherapySession
from services.gemini_service import (
    generate_agent_reasoning,
    _generate_deterministic_agent_reasoning,
    generate_agent_session_reflection,
    _generate_deterministic_session_reflection
)

class TestNuroAgentBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            user = User.query.filter_by(username='patient_agent_test').first()
            if not user:
                user = User(
                    username='patient_agent_test',
                    email='patient_agent_test@example.com',
                    user_type='patient',
                    first_name='Agent',
                    last_name='Tester'
                )
                user.set_password('pass123')
                db.session.add(user)
                db.session.commit()
                profile = PatientProfile(user_id=user.id, condition='parkinsons', baseline_cadence=60)
                db.session.add(profile)
                db.session.commit()
            elif not user.patient_profile:
                profile = PatientProfile(user_id=user.id, condition='parkinsons', baseline_cadence=60)
                db.session.add(profile)
                db.session.commit()
            cls.user_id = user.id

    def setUp(self):
        self.client = app.test_client()
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.user_id
            sess['user_type'] = 'patient'

    def test_deterministic_agent_reasoning_progress(self):
        """Test that high performance context generates PROGRESS intent."""
        ctx = {
            "current": {"movementQuality": 0.88, "rhythmSync": 0.90, "confidence": 0.95},
            "performance": {"score": 0.89, "trend": "IMPROVING", "stability": 0.88}
        }
        dec = _generate_deterministic_agent_reasoning(ctx)
        self.assertIn(dec["intent"], ["PROGRESS", "MAINTAIN"])
        self.assertIn("target", dec)
        self.assertIn("action", dec)
        self.assertIn("reason", dec)
        self.assertIn("confidence", dec)
        self.assertGreaterEqual(dec["confidence"], 0.5)

    def test_deterministic_agent_reasoning_low_confidence(self):
        """Test that low confidence triggers OBSERVE mode."""
        ctx = {
            "current": {"movementQuality": 0.80, "rhythmSync": 0.80, "confidence": 0.35},
            "performance": {"score": 0.80, "trend": "STABLE", "stability": 0.80}
        }
        dec = _generate_deterministic_agent_reasoning(ctx)
        self.assertEqual(dec["intent"], "OBSERVE")
        self.assertEqual(dec["action"], "REQUEST_MORE_OBSERVATION")

    def test_deterministic_session_reflection(self):
        """Test structured session reflection adheres to Section 22 schema."""
        summary = {
            "averageRhythmSync": 0.85,
            "averageMovementQuality": 0.82,
            "improvement": 0.08,
            "bestTempo": 84,
            "successfulTempoRange": "80-84 BPM"
        }
        ref = _generate_deterministic_session_reflection(summary)
        self.assertIn("summary", ref)
        self.assertIn("strongAreas", ref)
        self.assertIn("areasToWatch", ref)
        self.assertIn("successfulAdaptation", ref)
        self.assertIn("nextSessionStartingPoint", ref)
        self.assertEqual(ref["nextSessionStartingPoint"], 84)

    def test_api_nuro_agent_reason_endpoint(self):
        """Test POST /api/nuro-agent/reason returns valid structured decision."""
        payload = {
            "context": {
                "current": {"movementQuality": 0.85, "rhythmSync": 0.88, "confidence": 0.92},
                "performance": {"score": 0.86, "trend": "STABLE", "stability": 0.85}
            }
        }
        resp = self.client.post('/api/nuro-agent/reason', json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(data.get("success"))
        dec = data.get("decision")
        self.assertIsNotNone(dec)
        self.assertIn(dec.get("intent"), ["PROGRESS", "MAINTAIN", "RECOVER", "EXPLORE", "OBSERVE"])

    def test_session_complete_saves_agent_reflection_and_summary(self):
        """Test that completing a session saves agent_summary and agent_reflection in metrics."""
        # 1. Start a session
        resp = self.client.post('/session/start', json={'session_type': 'gait_trainer', 'initial_bpm': 60, 'target_bpm': 70})
        self.assertEqual(resp.status_code, 200)
        sid = resp.get_json()['session_id']

        # 2. Complete session with agent metrics
        complete_payload = {
            "duration": 180,
            "final_bpm": 64,
            "accuracy_score": 86,
            "left_steps": 45,
            "right_steps": 44,
            "gait_symmetry": 98,
            "metrics_data": {
                "agent_summary": {
                    "sessionId": sid,
                    "averageRhythmSync": 0.88,
                    "averageMovementQuality": 0.84,
                    "improvement": 0.06,
                    "bestTempo": 64,
                    "successfulTempoRange": "60-64 BPM"
                }
            }
        }
        comp_resp = self.client.post(f'/session/{sid}/complete', json=complete_payload)
        self.assertEqual(comp_resp.status_code, 200)
        comp_data = comp_resp.get_json()
        self.assertTrue(comp_data.get("success"))
        self.assertIn("agent_reflection", comp_data)

        # 3. Retrieve agent summary endpoint
        summary_resp = self.client.get(f'/api/session/{sid}/agent-summary')
        self.assertEqual(summary_resp.status_code, 200)
        sum_data = summary_resp.get_json()
        self.assertIsNotNone(sum_data.get("agent_summary"))
        self.assertIsNotNone(sum_data.get("agent_reflection"))
        self.assertEqual(sum_data["agent_summary"]["bestTempo"], 64)

if __name__ == '__main__':
    unittest.main()
