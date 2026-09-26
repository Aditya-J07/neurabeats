import unittest
from datetime import datetime
from app import app, db
from models import (
    User, PatientProfile, TherapySession, SessionMetrics,
    SchemaVersion, ModelMetadata, SessionEvent, AdaptationRecord,
    AgentDecision, Intervention, InterventionOutcome,
    PatientPerformanceEnvelope, SessionSummary
)

class TestDatabaseHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with app.app_context():
            # Create a test patient for database relational testing
            user = User.query.filter_by(username='db_hardening_test_user').first()
            if not user:
                user = User(
                    username='db_hardening_test_user',
                    email='db_test@nurobeat.io',
                    user_type='patient',
                    first_name='DB',
                    last_name='Hardening'
                )
                user.set_password('secure_password_123')
                db.session.add(user)
                db.session.commit()

            profile = PatientProfile.query.filter_by(user_id=user.id).first()
            if not profile:
                profile = PatientProfile(
                    user_id=user.id,
                    condition='parkinsons',
                    baseline_cadence=60.0
                )
                db.session.add(profile)
                db.session.commit()

            cls.user_id = user.id
            cls.patient_id = profile.id

    def test_schema_version_and_model_metadata(self):
        with app.app_context():
            v = SchemaVersion.query.filter_by(version=3).first()
            self.assertIsNotNone(v, "Schema version 3.0 must be registered in schema_version table")
            self.assertIn("Hardening", v.description)

            p4_meta = ModelMetadata.query.filter_by(component='P4_TEMPORAL').first()
            self.assertIsNotNone(p4_meta, "P4 temporal metadata must be registered")
            self.assertEqual(p4_meta.schema_version, '3.0')

    def test_relational_session_tree_persistence(self):
        with app.app_context():
            # 1. Create a session
            session = TherapySession(
                patient_id=self.patient_id,
                session_type='gait_trainer',
                initial_bpm=60.0,
                target_bpm=66.0,
                start_time=datetime.utcnow()
            )
            db.session.add(session)
            db.session.commit()
            sid = session.id

            # 2. Add an idempotent SessionEvent
            event = SessionEvent(
                session_id=sid,
                timestamp=1.5,
                event_type='LIFECYCLE',
                source='P0',
                severity='INFO',
                payload='{"status": "WARMUP_COMPLETE"}',
                idempotency_key=f'evt_test_{sid}_warmup'
            )
            db.session.add(event)

            # 3. Add an AdaptationRecord
            adapt = AdaptationRecord(
                session_id=sid,
                parameter='TEMPO',
                previous_value=60.0,
                requested_value=64.0,
                executed_value=64.0,
                direction='PROGRESS',
                trigger_reason='High rhythm entrainment (92%) over 3 windows',
                validator_status='APPROVED',
                confidence=0.94
            )
            db.session.add(adapt)

            # 4. Add an AgentDecision
            dec = AgentDecision(
                session_id=sid,
                intent='PROGRESS',
                target='TEMPO',
                action='INCREASE_TEMPO',
                requested_magnitude=4.0,
                reasoning_summary='Patient exceeds target synchronization with stable kinematics.',
                confidence=0.92,
                validator_result='APPROVED',
                execution_status='EXECUTED'
            )
            db.session.add(dec)

            # 5. Add an Intervention and Outcome
            intervention = Intervention(
                session_id=sid,
                target_parameter='TEMPO',
                action_taken='INCREASE_TEMPO',
                previous_value=60.0,
                new_value=64.0,
                pre_performance=0.82,
                pre_rhythm_sync=0.85,
                pre_movement_quality=0.80,
                observation_window_cycles=3,
                status='EVALUATED'
            )
            db.session.add(intervention)
            db.session.commit()

            outcome = InterventionOutcome(
                intervention_id=intervention.id,
                post_performance=0.88,
                post_rhythm_sync=0.90,
                post_movement_quality=0.84,
                delta_performance=0.06,
                delta_rhythm_sync=0.05,
                delta_movement_quality=0.04,
                response_score=0.0525,
                classification='POSITIVE',
                confidence=0.90,
                evaluation_window_cycles=3
            )
            db.session.add(outcome)

            # 6. Add a SessionSummary
            summary = SessionSummary(
                session_id=sid,
                starting_performance=0.80,
                ending_performance=0.88,
                improvement=0.08,
                average_movement_quality=0.82,
                average_rhythm_sync=0.88,
                average_confidence=0.93,
                best_tempo=64.0,
                successful_tempo_range='60-64 BPM',
                successful_adaptations=1,
                unsuccessful_adaptations=0,
                performance_trend='IMPROVING'
            )
            db.session.add(summary)
            db.session.commit()

            # 7. Query back through relationships
            queried_session = TherapySession.query.get(sid)
            self.assertEqual(len(queried_session.events), 1)
            self.assertEqual(queried_session.events[0].get_payload().get("status"), "WARMUP_COMPLETE")
            self.assertEqual(len(queried_session.adaptation_records), 1)
            self.assertEqual(queried_session.adaptation_records[0].executed_value, 64.0)
            self.assertEqual(len(queried_session.agent_decisions), 1)
            self.assertEqual(queried_session.agent_decisions[0].intent, "PROGRESS")
            self.assertEqual(len(queried_session.interventions), 1)
            self.assertEqual(queried_session.interventions[0].outcome.classification, "POSITIVE")
            self.assertEqual(queried_session.summary.best_tempo, 64.0)

    def test_idempotent_event_key_uniqueness(self):
        with app.app_context():
            session = TherapySession(
                patient_id=self.patient_id,
                session_type='gait_trainer',
                initial_bpm=60.0,
                target_bpm=66.0
            )
            db.session.add(session)
            db.session.commit()

            key = f"unique_idempotency_{session.id}_{int(datetime.utcnow().timestamp())}"
            evt1 = SessionEvent(
                session_id=session.id,
                timestamp=2.0,
                event_type='TRACKING_QUALITY',
                source='P0',
                idempotency_key=key
            )
            db.session.add(evt1)
            db.session.commit()

            # Duplicate submission with same idempotency key must fail
            evt2 = SessionEvent(
                session_id=session.id,
                timestamp=2.0,
                event_type='TRACKING_QUALITY',
                source='P0',
                idempotency_key=key
            )
            db.session.add(evt2)
            with self.assertRaises(Exception):
                db.session.commit()
            db.session.rollback()

    def test_patient_performance_envelope_upsert(self):
        with app.app_context():
            # Test personal performance envelope update
            env = PatientPerformanceEnvelope.query.filter_by(
                patient_id=self.patient_id,
                exercise_type='gait_trainer'
            ).first()

            if not env:
                env = PatientPerformanceEnvelope(
                    patient_id=self.patient_id,
                    exercise_type='gait_trainer',
                    stable_bpm_min=55.0,
                    stable_bpm_max=64.0,
                    typical_cadence=60.0,
                    sessions_evaluated=1
                )
                db.session.add(env)
            else:
                env.stable_bpm_max = 66.0
                env.sessions_evaluated += 1

            db.session.commit()

            queried_env = PatientPerformanceEnvelope.query.filter_by(
                patient_id=self.patient_id,
                exercise_type='gait_trainer'
            ).first()
            self.assertIsNotNone(queried_env)
            self.assertGreaterEqual(queried_env.stable_bpm_max, 64.0)

if __name__ == '__main__':
    unittest.main()
