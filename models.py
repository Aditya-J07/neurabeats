from datetime import datetime
from app import db
from werkzeug.security import generate_password_hash, check_password_hash
import json

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    user_type = db.Column(db.String(20), nullable=False)  # 'patient' or 'clinician'
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    patient_profile = db.relationship('PatientProfile', foreign_keys='PatientProfile.user_id', backref='user', uselist=False)
    clinician_profile = db.relationship('ClinicianProfile', backref='user', uselist=False)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class PatientProfile(db.Model):
    __tablename__ = 'patient_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    condition = db.Column(db.String(50), nullable=False)  # 'parkinsons' or 'stroke'
    baseline_cadence = db.Column(db.Float)  # steps per minute
    baseline_tapping_speed = db.Column(db.Float)  # taps per minute
    baseline_speech_rate = db.Column(db.Float)  # syllables per minute
    target_cadence = db.Column(db.Float)
    target_speech_rate = db.Column(db.Float)
    assigned_clinician_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    
    # Stroke-specific fields
    stroke_affected_side = db.Column(db.String(20))  # 'left', 'right', 'bilateral'
    stroke_severity = db.Column(db.String(20))  # 'mild', 'moderate', 'severe'
    aphasia_type = db.Column(db.String(30))  # 'broca', 'wernicke', 'global', 'none'
    dysarthria_severity = db.Column(db.String(20))  # 'mild', 'moderate', 'severe', 'none'
    motor_impairment_level = db.Column(db.String(20))  # 'mild', 'moderate', 'severe'
    cognitive_status = db.Column(db.String(20))  # 'normal', 'mild_impairment', 'moderate_impairment'
    emotional_status = db.Column(db.String(30))  # 'stable', 'mild_depression', 'anxiety', 'mixed'
    preferred_music_genre = db.Column(db.String(50))
    preferred_beat_sound = db.Column(db.String(20), default='metronome')  # metronome, drum, soft_bell, wooden_block, piano  # Patient's preferred music style
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    sessions = db.relationship('TherapySession', backref='patient', lazy=True)
    performance_envelopes = db.relationship('PatientPerformanceEnvelope', backref='patient', lazy=True, cascade='all, delete-orphan')

class ClinicianProfile(db.Model):
    __tablename__ = 'clinician_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    profession = db.Column(db.String(100))
    license_number = db.Column(db.String(50))
    specialization = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class TherapySession(db.Model):
    __tablename__ = 'therapy_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient_profiles.id'), nullable=False)
    session_type = db.Column(db.String(50), nullable=False)  # 'gait_trainer', 'speech_rhythm', 'upper_limb_motor', 'melodic_intonation', 'cognitive_rhythm'
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    end_time = db.Column(db.DateTime)
    initial_bpm = db.Column(db.Float, nullable=False)
    final_bpm = db.Column(db.Float)
    target_bpm = db.Column(db.Float, nullable=False)
    duration_seconds = db.Column(db.Integer)
    accuracy_score = db.Column(db.Float)  # 0-100 percentage
    completed = db.Column(db.Boolean, default=False)
    notes = db.Column(db.Text)
    
    # Stroke-specific fields
    affected_limb = db.Column(db.String(20))  # For motor sessions
    speech_clarity_score = db.Column(db.Float)  # For speech sessions
    cognitive_load_level = db.Column(db.Integer)  # 1-5 scale for cognitive sessions
    emotional_response = db.Column(db.String(20))  # 'positive', 'neutral', 'negative'
    generated_beat_url = db.Column(db.String(500))  # URL to generated beat audio
    
    # JSON field to store session metrics
    metrics_data = db.Column(db.Text)  # JSON string

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
            try:
                return json.loads(self.metrics_data)
            except Exception:
                return {}
        return {}

    @property
    def mean_error_ms(self):
        return self.get_metrics().get('meanAbsoluteErrorMs')

    @property
    def total_steps(self):
        return self.get_metrics().get('totalSteps')

    @property
    def is_demo_mode(self):
        return bool(self.get_metrics().get('is_demo'))

    @property
    def left_steps(self):
        return self.get_metrics().get('left_steps', 0)

    @property
    def right_steps(self):
        return self.get_metrics().get('right_steps', 0)

    @property
    def gait_symmetry(self):
        return self.get_metrics().get('gait_symmetry', 0)

    @property
    def tap_count(self):
        return self.get_metrics().get('tap_count', 0)

    @property
    def tap_cadence(self):
        return self.get_metrics().get('tap_cadence', 0)

    @property
    def posture_stability(self):
        return self.get_metrics().get('posture_stability', 100 if self.session_type == 'balance_training' else 0)

    @property
    def cadence_spm(self):
        m = self.get_metrics()
        return m.get('gait', {}).get('cadence_spm') or m.get('final_bpm', self.final_bpm or 0)

    @property
    def cadence_cv(self):
        return self.get_metrics().get('gait', {}).get('cadence_cv', 0.0)

    @property
    def temporal_asymmetry_pct(self):
        return self.get_metrics().get('gait', {}).get('temporal_asymmetry_pct', 0.0)

    @property
    def rhythm_alignment_score(self):
        return self.get_metrics().get('sync', {}).get('rhythm_alignment_score', self.accuracy_score or 0)

    @property
    def tracking_coverage(self):
        return self.get_metrics().get('measurement_quality', {}).get('tracking_coverage', 1.0)

    @property
    def quality_state(self):
        return self.get_metrics().get('measurement_quality', {}).get('state', 'UNKNOWN')

class SessionMetrics(db.Model):
    __tablename__ = 'session_metrics'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    current_bpm = db.Column(db.Float, nullable=False)
    sync_accuracy = db.Column(db.Float)  # 0-100 percentage
    adjustment_made = db.Column(db.Boolean, default=False)
    
    # Relationships
    session = db.relationship('TherapySession', backref='metrics')

class BaselineAssessment(db.Model):
    __tablename__ = 'baseline_assessments'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient_profiles.id'), nullable=False)
    assessment_type = db.Column(db.String(50), nullable=False)  # 'gait', 'tapping', 'speech'
    measured_value = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text)
    assessed_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    patient = db.relationship('PatientProfile', backref='assessments')
    assessor = db.relationship('User', foreign_keys=[assessed_by])

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
    timestamp = db.Column(db.Float, nullable=False)  # Session elapsed seconds or unix ms
    event_type = db.Column(db.String(50), nullable=False)  # 'LIFECYCLE', 'TRACKING_QUALITY', 'CYCLE', 'ADAPTATION', 'ALERT'
    source = db.Column(db.String(20), nullable=False)  # 'P0', 'P1', 'P2', 'P4', 'P5'
    severity = db.Column(db.String(20), default='INFO')  # 'INFO', 'WARNING', 'CRITICAL'
    payload = db.Column(db.Text)  # Structured JSON payload
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
    parameter = db.Column(db.String(30), nullable=False)  # 'TEMPO', 'ROM', 'REPETITIONS'
    previous_value = db.Column(db.Float, nullable=False)
    requested_value = db.Column(db.Float, nullable=False)
    executed_value = db.Column(db.Float, nullable=False)
    direction = db.Column(db.String(20), nullable=False)  # 'PROGRESS', 'REGRESS', 'MAINTAIN', 'FREEZE'
    trigger_reason = db.Column(db.String(255), nullable=False)
    validator_status = db.Column(db.String(20), nullable=False)  # 'APPROVED', 'CLAMPED', 'REJECTED', 'FROZEN'
    clamp_reason = db.Column(db.String(255))
    cooldown_remaining_sec = db.Column(db.Float, default=0.0)
    confidence = db.Column(db.Float, default=1.0)
    policy_version = db.Column(db.String(50), default='p2_policy_v1.0')

class AgentDecision(db.Model):
    __tablename__ = 'agent_decisions'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id', ondelete='CASCADE'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    intent = db.Column(db.String(30), nullable=False)  # 'PROGRESS', 'MAINTAIN', 'RECOVER', 'EXPLORE', 'OBSERVE'
    target = db.Column(db.String(30), nullable=False)  # 'TEMPO', 'MOVEMENT', 'REPETITIONS', 'RHYTHM', 'NONE'
    action = db.Column(db.String(50), nullable=False)
    requested_magnitude = db.Column(db.Float, default=0.0)
    reasoning_summary = db.Column(db.Text)
    evidence_summary = db.Column(db.Text)
    hypothesis_id = db.Column(db.String(64))
    confidence = db.Column(db.Float, nullable=False)
    validator_result = db.Column(db.String(30), default='PENDING')  # 'APPROVED', 'CLAMPED', 'REJECTED'
    execution_status = db.Column(db.String(30), default='EXECUTED')  # 'EXECUTED', 'DEFERRED', 'DISCARDED'
    agent_version = db.Column(db.String(50), default='nuro_agent_v1.0')
    prompt_schema_version = db.Column(db.String(50), default='3.0')

class Intervention(db.Model):
    __tablename__ = 'interventions'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('therapy_sessions.id', ondelete='CASCADE'), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    target_parameter = db.Column(db.String(30), nullable=False)  # 'TEMPO', 'ROM'
    action_taken = db.Column(db.String(50), nullable=False)
    previous_value = db.Column(db.Float, nullable=False)
    new_value = db.Column(db.Float, nullable=False)
    pre_performance = db.Column(db.Float, nullable=False)
    pre_rhythm_sync = db.Column(db.Float, nullable=False)
    pre_movement_quality = db.Column(db.Float, nullable=False)
    observation_window_cycles = db.Column(db.Integer, default=3)
    status = db.Column(db.String(20), default='OBSERVING')  # 'OBSERVING', 'EVALUATED', 'EXPIRED'
    
    # Relationships
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
    classification = db.Column(db.String(30), nullable=False)  # 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'INCONCLUSIVE'
    confidence = db.Column(db.Float, nullable=False)
    evaluation_window_cycles = db.Column(db.Integer, default=3)

class PatientPerformanceEnvelope(db.Model):
    __tablename__ = 'patient_performance_envelopes'
    
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patient_profiles.id', ondelete='CASCADE'), nullable=False)
    exercise_type = db.Column(db.String(50), nullable=False)  # 'gait_trainer', 'finger_tapping', etc.
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

    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'exercise_type': self.exercise_type,
            'stable_bpm_min': self.stable_bpm_min,
            'stable_bpm_max': self.stable_bpm_max,
            'typical_cadence': self.typical_cadence,
            'cadence_cv': self.cadence_cv,
            'phase_stability_mean': self.phase_stability_mean,
            'adaptation_tolerance': self.adaptation_tolerance,
            'confidence': self.confidence,
            'sessions_evaluated': self.sessions_evaluated,
            'version': self.version
        }

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
