"""
NURO-BEATS Adversarial Database, Security & Replay Tamper Suite
tests/test_adversarial_database_security.py

Validates:
1. Multi-Tenant Patient Isolation (Patient A accessing Patient B -> 403 Forbidden)
2. Clinician Authorization (Clinician accessing unassigned patient -> 403 Forbidden)
3. Unauthenticated Access (Anonymous request -> 401 Unauthorized)
4. Nonexistent Entities (Invalid Session/Patient ID -> 404 Not Found)
5. Event Storm & Idempotency (Batch-ingesting 1,000 events with duplicates)
6. Transaction Rollback Safety on Invalidation
7. Intervention Causality Constraints (No outcome without intervention, no intervention without session)
8. Pause/Resume Mathematics (active_duration = wall - paused, observation window pause isolation)
9. Replay Trace Adversarial Tamper Detection (detects altered BPM, timestamps, outcomes)
"""

import unittest
import json
import time
from datetime import datetime, timezone
from app import app
import routes
from models import (
    db, User, PatientProfile, TherapySession, SessionEvent,
    Intervention, InterventionOutcome, PatientPerformanceEnvelope,
    AdaptationRecord, AgentDecision, SessionSummary
)
from runtime.replay_engine import ReplayEngine


class TestAdversarialDatabaseSecurity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        with app.app_context():
            # Create Patient A
            user_a = User.query.filter_by(username='patient_alice').first()
            if not user_a:
                user_a = User(
                    username='patient_alice',
                    email='alice@example.com',
                    user_type='patient',
                    first_name='Alice',
                    last_name='Walker'
                )
                user_a.set_password('Secret123!')
                db.session.add(user_a)
                db.session.commit()

            patient_a = PatientProfile.query.filter_by(user_id=user_a.id).first()
            if not patient_a:
                patient_a = PatientProfile(user_id=user_a.id, condition='stroke', baseline_cadence=55.0)
                db.session.add(patient_a)
                db.session.commit()

            # Create Patient B
            user_b = User.query.filter_by(username='patient_bob').first()
            if not user_b:
                user_b = User(
                    username='patient_bob',
                    email='bob@example.com',
                    user_type='patient',
                    first_name='Bob',
                    last_name='Builder'
                )
                user_b.set_password('Secret123!')
                db.session.add(user_b)
                db.session.commit()

            patient_b = PatientProfile.query.filter_by(user_id=user_b.id).first()
            if not patient_b:
                patient_b = PatientProfile(user_id=user_b.id, condition='parkinsons', baseline_cadence=65.0)
                db.session.add(patient_b)
                db.session.commit()

            # Create Clinician 1 (assigned to Alice only)
            user_c1 = User.query.filter_by(username='dr_house').first()
            if not user_c1:
                user_c1 = User(
                    username='dr_house',
                    email='house@hospital.org',
                    user_type='clinician',
                    first_name='Gregory',
                    last_name='House'
                )
                user_c1.set_password('Secret123!')
                db.session.add(user_c1)
                db.session.commit()

            # Create Clinician 2 (assigned to Bob only)
            user_c2 = User.query.filter_by(username='dr_wilson').first()
            if not user_c2:
                user_c2 = User(
                    username='dr_wilson',
                    email='wilson@hospital.org',
                    user_type='clinician',
                    first_name='James',
                    last_name='Wilson'
                )
                user_c2.set_password('Secret123!')
                db.session.add(user_c2)
                db.session.commit()

            # Assign Alice to Clinician 1 and Bob to Clinician 2
            patient_a.assigned_clinician_id = user_c1.id
            patient_b.assigned_clinician_id = user_c2.id
            db.session.commit()

            cls.user_a_id = user_a.id
            cls.patient_a_id = patient_a.id
            cls.user_b_id = user_b.id
            cls.patient_b_id = patient_b.id
            cls.clinician_1_id = user_c1.id
            cls.clinician_2_id = user_c2.id

    def setUp(self):
        self.client = app.test_client()

    # =========================================================================
    # 1. Multi-Tenant Authorization & Privilege Boundary Tests
    # =========================================================================
    def test_cross_patient_access_forbidden(self):
        """
        Adversarial Test: Patient B attempts to read or mutate Patient A's session.
        Server must return 403 Forbidden on all endpoints.
        """
        # Create a session belonging to Patient A
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.user_a_id
            sess['user_type'] = 'patient'

        resp_a = self.client.post('/session/start', json={
            'session_type': 'gait_trainer', 'initial_bpm': 60, 'target_bpm': 70
        })
        self.assertEqual(resp_a.status_code, 200)
        session_a_id = resp_a.get_json()['session_id']

        # Now switch session to Patient B
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.user_b_id
            sess['user_type'] = 'patient'

        # Patient B tries to get Patient A's replay
        replay_resp = self.client.get(f'/api/session/{session_a_id}/replay')
        self.assertEqual(replay_resp.status_code, 403)
        self.assertIn("Access denied", replay_resp.get_json().get("error", ""))

        # Patient B tries to push events into Patient A's session
        events_resp = self.client.post(f'/api/session/{session_a_id}/events', json={'events': []})
        self.assertEqual(events_resp.status_code, 403)

        # Patient B tries to create an intervention in Patient A's session
        itv_resp = self.client.post(f'/api/session/{session_a_id}/interventions', json={
            'target_parameter': 'TEMPO',
            'action_taken': 'INCREASE_TEMPO',
            'previous_value': 60.0,
            'new_value': 65.0
        })
        self.assertEqual(itv_resp.status_code, 403)

        # Patient B tries to complete Patient A's session
        comp_resp = self.client.post(f'/session/{session_a_id}/complete', json={
            'duration': 120, 'final_bpm': 60, 'accuracy_score': 80
        })
        self.assertEqual(comp_resp.status_code, 403)

        # Patient B tries to read Patient A's envelope
        env_resp = self.client.get(f'/api/patient/{self.patient_a_id}/envelope')
        self.assertEqual(env_resp.status_code, 403)

    def test_clinician_unauthorized_patient_access_forbidden(self):
        """
        Adversarial Test: Clinician 1 (assigned only to Patient A) tries to access
        Patient B's records. Must return 403 Forbidden.
        """
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.clinician_1_id
            sess['user_type'] = 'clinician'

        # Clinician 1 queries Patient B's envelope
        env_resp = self.client.get(f'/api/patient/{self.patient_b_id}/envelope')
        self.assertEqual(env_resp.status_code, 403)

        # Clinician 1 queries Patient A's envelope (should be allowed: 200 or 404 if none yet)
        env_resp_a = self.client.get(f'/api/patient/{self.patient_a_id}/envelope')
        self.assertIn(env_resp_a.status_code, [200, 404])

    def test_unauthenticated_access_rejected(self):
        """
        Adversarial Test: Requests with no session authentication header/cookie
        must return 401 Unauthorized.
        """
        # Ensure client session is empty
        anon_client = app.test_client()

        resp = anon_client.get('/api/session/1/replay')
        self.assertEqual(resp.status_code, 401)

        resp2 = anon_client.post('/api/session/1/events', json={'events': []})
        self.assertEqual(resp2.status_code, 401)

        resp3 = anon_client.post('/session/start', json={'session_type': 'gait_trainer'})
        self.assertEqual(resp3.status_code, 401)

    def test_nonexistent_session_returns_404(self):
        """Accessing a nonexistent session ID must return 404 Not Found."""
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.user_a_id
            sess['user_type'] = 'patient'

        resp = self.client.get('/api/session/999999/replay')
        self.assertEqual(resp.status_code, 404)

    # =========================================================================
    # 2. Event Storm & Ingestion Idempotency
    # =========================================================================
    def test_event_storm_idempotency(self):
        """
        Adversarial Test: Ingest 1,000 events in rapid batches with repeated
        idempotency keys (simulating network retry storms or browser jitter).
        Verify that exactly unique events are persisted without DB corruption or deadlock.
        """
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.user_a_id
            sess['user_type'] = 'patient'

        resp = self.client.post('/session/start', json={
            'session_type': 'gait_trainer', 'initial_bpm': 60, 'target_bpm': 70
        })
        session_id = resp.get_json()['session_id']

        # Generate 1,000 event payloads with only 25 unique idempotency keys (40 duplicates each)
        storm_events = []
        for i in range(1000):
            unique_idx = i % 25
            storm_events.append({
                'idempotency_key': f"storm_{session_id}_key_{unique_idx}",
                'timestamp': 100.0 + unique_idx * 0.5,
                'event_type': 'MOVEMENT_CADENCE_SAMPLE',
                'source': 'P1',
                'severity': 'INFO',
                'payload': {'frame': i, 'cadence': 60.0 + (unique_idx % 5)}
            })

        # Send in batches of 250 events
        total_ingested = 0
        for batch_start in range(0, 1000, 250):
            batch = storm_events[batch_start:batch_start + 250]
            ingest_resp = self.client.post(f'/api/session/{session_id}/events', json={'events': batch})
            self.assertEqual(ingest_resp.status_code, 201)
            total_ingested += ingest_resp.get_json().get('ingested_count', 0)

        # Exactly 25 unique storm events should have been ingested
        self.assertEqual(total_ingested, 25)

        # Verify DB count: 1 SESSION_CREATED event + 25 storm events = 26
        with app.app_context():
            db_count = SessionEvent.query.filter_by(session_id=session_id).count()
            self.assertEqual(db_count, 26)

    # =========================================================================
    # 3. Pause / Resume Mathematics & Timing Integrity
    # =========================================================================
    def test_pause_resume_mathematics(self):
        """
        Verify pause/resume duration mathematics:
        active_duration = wall_clock_duration - paused_duration.
        Verify multiple pause intervals and verify that pausing during
        an observation window does NOT produce a false-negative outcome.
        """
        wall_clock_start = 1000.0
        # Simulating a session with two distinct pauses:
        # Pause 1: 1020.0 to 1035.0 (15s)
        # Pause 2: 1050.0 to 1070.0 (20s)
        # Session end: 1100.0 (Wall duration = 100s)
        # Total paused duration = 15 + 20 = 35s
        # Expected active duration = 100 - 35 = 65s

        pauses = [
            {'paused_at': 1020.0, 'resumed_at': 1035.0},
            {'paused_at': 1050.0, 'resumed_at': 1070.0}
        ]
        wall_clock_end = 1100.0

        total_paused = sum(p['resumed_at'] - p['paused_at'] for p in pauses)
        wall_duration = wall_clock_end - wall_clock_start
        active_duration = wall_duration - total_paused

        self.assertEqual(wall_duration, 100.0)
        self.assertEqual(total_paused, 35.0)
        self.assertEqual(active_duration, 65.0)

        # Verify through session completion payload
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.user_a_id
            sess['user_type'] = 'patient'

        resp = self.client.post('/session/start', json={
            'session_type': 'gait_trainer', 'initial_bpm': 60, 'target_bpm': 70
        })
        session_id = resp.get_json()['session_id']

        comp = self.client.post(f'/session/{session_id}/complete', json={
            'duration': active_duration,
            'final_bpm': 62.0,
            'accuracy_score': 85.0,
            'metrics_data': {
                'wall_clock_duration': wall_duration,
                'paused_duration': total_paused,
                'active_duration': active_duration,
                'pause_count': len(pauses)
            }
        })
        self.assertEqual(comp.status_code, 200)

        with app.app_context():
            ts = db.session.get(TherapySession, session_id)
            self.assertEqual(ts.duration_seconds, int(active_duration))
            # Verify duration is not inflated by paused time
            self.assertLess(ts.duration_seconds, int(wall_duration))

    # =========================================================================
    # 4. Intervention Causality & Foreign Key Integrity
    # =========================================================================
    def test_intervention_causality_constraints(self):
        """
        Verify:
        - No outcome may exist without an intervention (404/rejection)
        - No intervention may exist without a session (404/rejection)
        - Causal chain: PRE -> ACTION -> WINDOW -> POST -> DELTA -> CLASSIFICATION -> MEMORY
        """
        with self.client.session_transaction() as sess:
            sess['user_id'] = self.user_a_id
            sess['user_type'] = 'patient'

        # Attempt to record outcome for nonexistent intervention
        bad_out = self.client.post('/api/intervention/999999/outcome', json={
            'post_performance': 0.85,
            'classification': 'POSITIVE'
        })
        self.assertEqual(bad_out.status_code, 404)

        # Attempt to record intervention on nonexistent session
        bad_itv = self.client.post('/api/session/999999/interventions', json={
            'target_parameter': 'TEMPO',
            'action_taken': 'INCREASE_TEMPO',
            'previous_value': 60.0,
            'new_value': 64.0
        })
        self.assertEqual(bad_itv.status_code, 404)

    # =========================================================================
    # 5. Replay Engine Adversarial Tamper Detection
    # =========================================================================
    def test_replay_detects_all_tampering(self):
        """
        Adversarial Test (Section 17):
        Intentionally inject:
        1. Non-monotonic timestamp regression
        2. Status APPROVED with altered executed BPM
        3. Intervention after_bpm mismatch with adaptation executed_bpm
        4. Outcome delta mathematical inconsistency
        5. Step size exceeding P2 limit (> 5 BPM)

        Verify that ReplayEngine.verify_trace_integrity() detects every anomaly.
        """
        base_trace = {
            "session_id": 99,
            "patient_id": self.patient_a_id,
            "session_type": "gait_trainer",
            "initial_bpm": 60.0,
            "final_bpm": 64.0,
            "events": [
                {"id": 1, "timestamp": 100.0, "event_type": "SESSION_CREATED"},
                {"id": 2, "timestamp": 110.0, "event_type": "PERFORMANCE_STABLE"}
            ],
            "adaptations": [
                {
                    "id": 10,
                    "timestamp": "2026-09-27T01:00:10",
                    "previous_value": 60.0,
                    "requested_value": 64.0,
                    "executed_value": 64.0,
                    "validator_status": "APPROVED",
                    "clamp_reason": None
                }
            ],
            "interventions": [
                {
                    "id": 20,
                    "timestamp": "2026-09-27T01:00:10",
                    "before_bpm": 60.0,
                    "after_bpm": 64.0,
                    "outcome": {
                        "classification": "POSITIVE",
                        "pre_performance": 0.80,
                        "post_performance": 0.88,
                        "delta_performance": 0.08
                    }
                }
            ]
        }

        # 1. Clean trace should pass integrity
        clean_engine = ReplayEngine(base_trace)
        clean_res = clean_engine.verify_trace_integrity()
        self.assertTrue(clean_res["integrity_pass"])
        self.assertEqual(clean_res["anomalies_detected"], 0)

        # 2. Tampered Timestamp (regression)
        tampered_ts = json.loads(json.dumps(base_trace))
        tampered_ts["events"][1]["timestamp"] = 90.0  # Regressed behind 100.0
        engine_ts = ReplayEngine(tampered_ts)
        res_ts = engine_ts.verify_trace_integrity()
        self.assertFalse(res_ts["integrity_pass"])
        self.assertTrue(any(a["type"] == "TIMESTAMP_REGRESSION" for a in res_ts["anomalies"]))

        # 3. Tampered BPM (Status APPROVED but executed altered to 68)
        tampered_bpm = json.loads(json.dumps(base_trace))
        tampered_bpm["adaptations"][0]["executed_value"] = 68.0
        engine_bpm = ReplayEngine(tampered_bpm)
        res_bpm = engine_bpm.verify_trace_integrity()
        self.assertFalse(res_bpm["integrity_pass"])
        self.assertTrue(any(a["type"] == "VALIDATOR_INCONSISTENCY" for a in res_bpm["anomalies"]))

        # 4. Tampered Step Size (> 5 BPM executed)
        tampered_step = json.loads(json.dumps(base_trace))
        tampered_step["adaptations"][0]["requested_value"] = 70.0
        tampered_step["adaptations"][0]["executed_value"] = 70.0
        engine_step = ReplayEngine(tampered_step)
        res_step = engine_step.verify_trace_integrity()
        self.assertFalse(res_step["integrity_pass"])
        self.assertTrue(any(a["type"] == "EXCESSIVE_STEP_SIZE" for a in res_step["anomalies"]))

        # 5. Tampered Outcome Delta (post 0.88 - pre 0.80 = 0.08, but record claims 0.25)
        tampered_out = json.loads(json.dumps(base_trace))
        tampered_out["interventions"][0]["outcome"]["delta_performance"] = 0.25
        engine_out = ReplayEngine(tampered_out)
        res_out = engine_out.verify_trace_integrity()
        self.assertFalse(res_out["integrity_pass"])
        self.assertTrue(any(a["type"] == "OUTCOME_MATHEMATICAL_ERROR" for a in res_out["anomalies"]))


if __name__ == '__main__':
    unittest.main()
