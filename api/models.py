from datetime import datetime
from api import db
from werkzeug.security import generate_password_hash, check_password_hash
import json

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    user_type = db.Column(db.String(20), nullable=False)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    patient_profile = db.relationship('PatientProfile', foreign_keys='PatientProfile.user_id', backref='user', uselist=False)
    clinician_profile = db.relationship('ClinicianProfile', backref='user', uselist=False)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'user_type': self.user_type,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class PatientProfile(db.Model):
    __tablename__ = 'patient_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    condition = db.Column(db.String(50), nullable=False)
    baseline_cadence = db.Column(db.Float)
    baseline_tapping_speed = db.Column(db.Float)
    baseline_speech_rate = db.Column(db.Float)
    target_cadence = db.Column(db.Float)
    target_speech_rate = db.Column(db.Float)
    assigned_clinician_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    
    stroke_affected_side = db.Column(db.String(20))
    stroke_severity = db.Column(db.String(20))
    aphasia_type = db.Column(db.String(30))
    dysarthria_severity = db.Column(db.String(20))
    motor_impairment_level = db.Column(db.String(20))
    cognitive_status = db.Column(db.String(20))
    emotional_status = db.Column(db.String(30))
    preferred_music_genre = db.Column(db.String(50))
    preferred_beat_sound = db.Column(db.String(20), default='metronome')
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    sessions = db.relationship('TherapySession', backref='patient', lazy=True)
    performance_envelopes = db.relationship('PatientPerformanceEnvelope', backref='patient', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'condition': self.condition,
            'baseline_cadence': self.baseline_cadence,
            'baseline_tapping_speed': self.baseline_tapping_speed,
            'baseline_speech_rate': self.baseline_speech_rate,
            'target_cadence': self.target_cadence,
            'target_speech_rate': self.target_speech_rate,
            'assigned_clinician_id': self.assigned_clinician_id,
            'stroke_affected_side': self.stroke_affected_side,
            'stroke_severity': self.stroke_severity,
            'aphasia_type': self.aphasia_type,
            'dysarthria_severity': self.dysarthria_severity,
            'motor_impairment_level': self.motor_impairment_level,
            'cognitive_status': self.cognitive_status,
            'emotional_status': self.emotional_status,
            'preferred_music_genre': self.preferred_music_genre,
            'preferred_beat_sound': self.preferred_beat_sound,
        }

class ClinicianProfile(db.Model):
    __tablename__ = 'clinician_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    license_number = db.Column(db.String(50))
    specialization = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'license_number': self.license_number,
            'specialization': self.specialization
        }

class TherapySession(db.Model):
    __tablename__ = 'therapy_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient_profiles.id'), nullable=False)
    session_type = db.Column(db.String(50), nullable=False)
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime)
    initial_bpm = db.Column(db.Float, nullable=False)
    final_bpm = db.Column(db.Float)
    target_bpm = db.Column(db.Float, nullable=False)
    duration_seconds = db.Column(db.Integer)
    accuracy_score = db.Column(db.Float)
    completed = db.Column(db.Boolean, default=False)
    notes = db.Column(db.Text)
    
    affected_limb = db.Column(db.String(20))
    speech_clarity_score = db.Column(db.Float)
    cognitive_load_level = db.Column(db.Integer)
    emotional_response = db.Column(db.String(20))
    generated_beat_url = db.Column(db.String(500))
    
    metrics_data = db.Column(db.Text)

    # Relationships to hardened persistence entities
    events = db.relationship('SessionEvent', backref='session', lazy=True, cascade='all, delete-orphan')
    adaptation_records = db.relationship('AdaptationRecord', backref='session', lazy=True, cascade='all, delete-orphan')
    agent_decisions = db.relationship('AgentDecision', backref='session', lazy=True, cascade='all, delete-orphan')
    interventions = db.relationship('Intervention', backref='session', lazy=True, cascade='all, delete-orphan')
    summary = db.relationship('SessionSummary', backref='session', uselist=False, cascade='all, delete-orphan')
    
    def set_metrics(self, metrics_dict):
        self.metrics_data = json.dumps(metrics_dict)
    
    def get_metrics(self):
        if self.metrics_data:
            return json.loads(self.metrics_data)
        return {}
    
    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'session_type': self.session_type,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'initial_bpm': self.initial_bpm,
            'final_bpm': self.final_bpm,
            'target_bpm': self.target_bpm,
            'duration_seconds': self.duration_seconds,
            'accuracy_score': self.accuracy_score,
            'completed': self.completed,
            'notes': self.notes,
            'affected_limb': self.affected_limb,
            'speech_clarity_score': self.speech_clarity_score,
            'cognitive_load_level': self.cognitive_load_level,
            'emotional_response': self.emotional_response,
            'generated_beat_url': self.generated_beat_url
        }

class SessionMetrics(db.Model):
    __tablename__ = 'session_metrics'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    current_bpm = db.Column(db.Float, nullable=False)
    sync_accuracy = db.Column(db.Float)
    adjustment_made = db.Column(db.Boolean, default=False)
    
    session = db.relationship('TherapySession', backref='metrics')
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'current_bpm': self.current_bpm,
            'sync_accuracy': self.sync_accuracy,
            'adjustment_made': self.adjustment_made
        }

class BaselineAssessment(db.Model):
    __tablename__ = 'baseline_assessments'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient_profiles.id'), nullable=False)
    assessment_type = db.Column(db.String(50), nullable=False)
    measured_value = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text)
    assessed_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    patient = db.relationship('PatientProfile', backref='assessments')
    assessor = db.relationship('User', foreign_keys=[assessed_by])
    
    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'assessment_type': self.assessment_type,
            'measured_value': self.measured_value,
            'notes': self.notes,
            'assessed_by': self.assessed_by,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# ============================================================================
# NURO-BEATS Hardened Relational Architecture (Schema Version 3.0)
# ============================================================================

class SchemaVersion(db.Model):
    __tablename__ = 'schema_version'
    
    id = db.Column(db.Integer, primary_key=True)
    version = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(255), nullable=False)
    applied_at = db.Column(db.DateTime, default=datetime.utcnow)

class ModelMetadata(db.Model):
    __tablename__ = 'model_metadata'
    
    id = db.Column(db.Integer, primary_key=True)
    component = db.Column(db.String(50), nullable=False)
    model_version = db.Column(db.String(50), nullable=False)
    model_hash = db.Column(db.String(128))
    schema_version = db.Column(db.String(50), nullable=False)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class SessionEvent(db.Model):
    __tablename__ = 'session_events'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id', ondelete='CASCADE'), nullable=False)
    timestamp = db.Column(db.Float, nullable=False)
    event_type = db.Column(db.String(50), nullable=False)
    source = db.Column(db.String(20), nullable=False)
    severity = db.Column(db.String(20), default='INFO')
    payload = db.Column(db.Text)
    idempotency_key = db.Column(db.String(128), unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def get_payload(self):
        if self.payload:
            try:
                return json.loads(self.payload)
            except Exception:
                return {}
        return {}

class AdaptationRecord(db.Model):
    __tablename__ = 'adaptation_records'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id', ondelete='CASCADE'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    parameter = db.Column(db.String(30), nullable=False)
    previous_value = db.Column(db.Float, nullable=False)
    requested_value = db.Column(db.Float, nullable=False)
    executed_value = db.Column(db.Float, nullable=False)
    direction = db.Column(db.String(20), nullable=False)
    trigger_reason = db.Column(db.String(255), nullable=False)
    validator_status = db.Column(db.String(20), nullable=False)
    clamp_reason = db.Column(db.String(255))
    cooldown_remaining_sec = db.Column(db.Float, default=0.0)
    confidence = db.Column(db.Float, default=1.0)
    policy_version = db.Column(db.String(50), default='p2_policy_v1.0')

class AgentDecision(db.Model):
    __tablename__ = 'agent_decisions'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id', ondelete='CASCADE'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    intent = db.Column(db.String(30), nullable=False)
    target = db.Column(db.String(30), nullable=False)
    action = db.Column(db.String(50), nullable=False)
    requested_magnitude = db.Column(db.Float, default=0.0)
    reasoning_summary = db.Column(db.Text)
    evidence_summary = db.Column(db.Text)
    hypothesis_id = db.Column(db.String(64))
    confidence = db.Column(db.Float, nullable=False)
    validator_result = db.Column(db.String(30), default='PENDING')
    execution_status = db.Column(db.String(30), default='EXECUTED')
    agent_version = db.Column(db.String(50), default='nuro_agent_v1.0')
    prompt_schema_version = db.Column(db.String(50), default='3.0')

class Intervention(db.Model):
    __tablename__ = 'interventions'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id', ondelete='CASCADE'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    target_parameter = db.Column(db.String(30), nullable=False)
    action_taken = db.Column(db.String(50), nullable=False)
    previous_value = db.Column(db.Float, nullable=False)
    new_value = db.Column(db.Float, nullable=False)
    pre_performance = db.Column(db.Float, nullable=False)
    pre_rhythm_sync = db.Column(db.Float, nullable=False)
    pre_movement_quality = db.Column(db.Float, nullable=False)
    observation_window_cycles = db.Column(db.Integer, default=3)
    status = db.Column(db.String(20), default='OBSERVING')
    
    outcome = db.relationship('InterventionOutcome', backref='intervention', uselist=False, cascade='all, delete-orphan')

class InterventionOutcome(db.Model):
    __tablename__ = 'intervention_outcomes'
    
    id = db.Column(db.Integer, primary_key=True)
    intervention_id = db.Column(db.Integer, db.ForeignKey('interventions.id', ondelete='CASCADE'), unique=True, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    post_performance = db.Column(db.Float, nullable=False)
    post_rhythm_sync = db.Column(db.Float, nullable=False)
    post_movement_quality = db.Column(db.Float, nullable=False)
    delta_performance = db.Column(db.Float, nullable=False)
    delta_rhythm_sync = db.Column(db.Float, nullable=False)
    delta_movement_quality = db.Column(db.Float, nullable=False)
    response_score = db.Column(db.Float, nullable=False)
    classification = db.Column(db.String(30), nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    evaluation_window_cycles = db.Column(db.Integer, default=3)

class PatientPerformanceEnvelope(db.Model):
    __tablename__ = 'patient_performance_envelopes'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient_profiles.id', ondelete='CASCADE'), nullable=False)
    exercise_type = db.Column(db.String(50), nullable=False)
    stable_bpm_min = db.Column(db.Float, nullable=False)
    stable_bpm_max = db.Column(db.Float, nullable=False)
    typical_cadence = db.Column(db.Float)
    cadence_cv = db.Column(db.Float)
    phase_stability_mean = db.Column(db.Float)
    adaptation_tolerance = db.Column(db.Float, default=0.5)
    confidence = db.Column(db.Float, default=0.5)
    sessions_evaluated = db.Column(db.Integer, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    version = db.Column(db.String(20), default='v1.0')
    
    __table_args__ = (
        db.UniqueConstraint('patient_id', 'exercise_type', name='uq_patient_exercise_envelope'),
    )

class SessionSummary(db.Model):
    __tablename__ = 'session_summaries'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id', ondelete='CASCADE'), unique=True, nullable=False)
    starting_performance = db.Column(db.Float)
    ending_performance = db.Column(db.Float)
    improvement = db.Column(db.Float)
    average_movement_quality = db.Column(db.Float)
    average_rhythm_sync = db.Column(db.Float)
    average_confidence = db.Column(db.Float)
    best_tempo = db.Column(db.Float)
    successful_tempo_range = db.Column(db.String(50))
    successful_adaptations = db.Column(db.Integer, default=0)
    unsuccessful_adaptations = db.Column(db.Integer, default=0)
    performance_trend = db.Column(db.String(30))
    active_hypotheses_summary = db.Column(db.Text)
    clinical_review_items = db.Column(db.Text)
    agent_reflection_json = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
