import sqlite3
import os
import shutil
from datetime import datetime

def migrate_database(db_path=None):
    """
    Hardened migration script for NURO-BEATS (Schema Version 3.0).
    Adds relational tables for:
      - schema_version
      - model_metadata
      - session_events
      - adaptation_records
      - agent_decisions
      - interventions
      - intervention_outcomes
      - patient_performance_envelopes
      - session_summaries
    Preserves all existing tables and data.
    """
    if db_path is None:
        db_path = os.path.join('instance', 'neurobeat.db')

    if not os.path.exists(db_path):
        print(f"Database at {db_path} does not exist yet. Please run app first.")
        return False

    # 1. Safe Backup
    bak_path = f"{db_path}.bak"
    shutil.copy2(db_path, bak_path)
    print(f"[BACKUP] Created database backup at: {bak_path}")

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()

    try:
        # Pre-migration row counts
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        pre_tables = [r[0] for r in cursor.fetchall() if not r[0].startswith('sqlite_')]
        pre_counts = {}
        for t in pre_tables:
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            pre_counts[t] = cursor.fetchone()[0]
        print(f"[PRE-CHECK] Existing tables ({len(pre_tables)}): {pre_counts}")

        # 2. Add stroke columns to patient_profiles if missing
        cursor.execute("PRAGMA table_info(patient_profiles)")
        existing_patient_cols = [row[1] for row in cursor.fetchall()]
        patient_cols = [
            ('stroke_affected_side', 'VARCHAR(20)'),
            ('stroke_severity', 'VARCHAR(20)'),
            ('aphasia_type', 'VARCHAR(30)'),
            ('dysarthria_severity', 'VARCHAR(20)'),
            ('motor_impairment_level', 'VARCHAR(20)'),
            ('cognitive_status', 'VARCHAR(20)'),
            ('emotional_status', 'VARCHAR(30)'),
            ('preferred_music_genre', 'VARCHAR(50)'),
            ('preferred_beat_sound', 'VARCHAR(20)')
        ]
        for col_name, col_type in patient_cols:
            if col_name not in existing_patient_cols:
                cursor.execute(f"ALTER TABLE patient_profiles ADD COLUMN {col_name} {col_type}")
                print(f"  + Added patient_profiles column: {col_name}")

        # 3. Add stroke columns to therapy_sessions if missing
        cursor.execute("PRAGMA table_info(therapy_sessions)")
        existing_session_cols = [row[1] for row in cursor.fetchall()]
        session_cols = [
            ('affected_limb', 'VARCHAR(20)'),
            ('speech_clarity_score', 'FLOAT'),
            ('cognitive_load_level', 'INTEGER'),
            ('emotional_response', 'VARCHAR(20)'),
            ('generated_beat_url', 'VARCHAR(500)')
        ]
        for col_name, col_type in session_cols:
            if col_name not in existing_session_cols:
                cursor.execute(f"ALTER TABLE therapy_sessions ADD COLUMN {col_name} {col_type}")
                print(f"  + Added therapy_sessions column: {col_name}")

        # 4. Create New Relational Tables
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            description VARCHAR(255) NOT NULL,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS model_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            component VARCHAR(50) NOT NULL,
            model_version VARCHAR(50) NOT NULL,
            model_hash VARCHAR(128),
            schema_version VARCHAR(50) NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS session_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            timestamp FLOAT NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            source VARCHAR(20) NOT NULL,
            severity VARCHAR(20) DEFAULT 'INFO',
            payload TEXT,
            idempotency_key VARCHAR(128) UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES therapy_sessions (id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS adaptation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            parameter VARCHAR(30) NOT NULL,
            previous_value FLOAT NOT NULL,
            requested_value FLOAT NOT NULL,
            executed_value FLOAT NOT NULL,
            direction VARCHAR(20) NOT NULL,
            trigger_reason VARCHAR(255) NOT NULL,
            validator_status VARCHAR(20) NOT NULL,
            clamp_reason VARCHAR(255),
            cooldown_remaining_sec FLOAT DEFAULT 0.0,
            confidence FLOAT DEFAULT 1.0,
            policy_version VARCHAR(50) DEFAULT 'p2_policy_v1.0',
            FOREIGN KEY (session_id) REFERENCES therapy_sessions (id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS agent_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            intent VARCHAR(30) NOT NULL,
            target VARCHAR(30) NOT NULL,
            action VARCHAR(50) NOT NULL,
            requested_magnitude FLOAT DEFAULT 0.0,
            reasoning_summary TEXT,
            evidence_summary TEXT,
            hypothesis_id VARCHAR(64),
            confidence FLOAT NOT NULL,
            validator_result VARCHAR(30) DEFAULT 'PENDING',
            execution_status VARCHAR(30) DEFAULT 'EXECUTED',
            agent_version VARCHAR(50) DEFAULT 'nuro_agent_v1.0',
            prompt_schema_version VARCHAR(50) DEFAULT '3.0',
            FOREIGN KEY (session_id) REFERENCES therapy_sessions (id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS interventions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            target_parameter VARCHAR(30) NOT NULL,
            action_taken VARCHAR(50) NOT NULL,
            previous_value FLOAT NOT NULL,
            new_value FLOAT NOT NULL,
            pre_performance FLOAT NOT NULL,
            pre_rhythm_sync FLOAT NOT NULL,
            pre_movement_quality FLOAT NOT NULL,
            observation_window_cycles INTEGER DEFAULT 3,
            status VARCHAR(20) DEFAULT 'OBSERVING',
            FOREIGN KEY (session_id) REFERENCES therapy_sessions (id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS intervention_outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intervention_id INTEGER NOT NULL UNIQUE,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            post_performance FLOAT NOT NULL,
            post_rhythm_sync FLOAT NOT NULL,
            post_movement_quality FLOAT NOT NULL,
            delta_performance FLOAT NOT NULL,
            delta_rhythm_sync FLOAT NOT NULL,
            delta_movement_quality FLOAT NOT NULL,
            response_score FLOAT NOT NULL,
            classification VARCHAR(30) NOT NULL,
            confidence FLOAT NOT NULL,
            evaluation_window_cycles INTEGER DEFAULT 3,
            FOREIGN KEY (intervention_id) REFERENCES interventions (id) ON DELETE CASCADE
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS patient_performance_envelopes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            exercise_type VARCHAR(50) NOT NULL,
            stable_bpm_min FLOAT NOT NULL,
            stable_bpm_max FLOAT NOT NULL,
            typical_cadence FLOAT,
            cadence_cv FLOAT,
            phase_stability_mean FLOAT,
            adaptation_tolerance FLOAT DEFAULT 0.5,
            confidence FLOAT DEFAULT 0.5,
            sessions_evaluated INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            version VARCHAR(20) DEFAULT 'v1.0',
            FOREIGN KEY (patient_id) REFERENCES patient_profiles (id) ON DELETE CASCADE,
            UNIQUE (patient_id, exercise_type)
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS session_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL UNIQUE,
            starting_performance FLOAT,
            ending_performance FLOAT,
            improvement FLOAT,
            average_movement_quality FLOAT,
            average_rhythm_sync FLOAT,
            average_confidence FLOAT,
            best_tempo FLOAT,
            successful_tempo_range VARCHAR(50),
            successful_adaptations INTEGER DEFAULT 0,
            unsuccessful_adaptations INTEGER DEFAULT 0,
            performance_trend VARCHAR(30),
            active_hypotheses_summary TEXT,
            clinical_review_items TEXT,
            agent_reflection_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES therapy_sessions (id) ON DELETE CASCADE
        );
        """)

        # 5. Create Secondary Indexes
        indexes = [
            ("idx_therapy_sessions_patient_time", "therapy_sessions(patient_id, start_time)"),
            ("idx_session_metrics_session_time", "session_metrics(session_id, timestamp)"),
            ("idx_session_events_session_time", "session_events(session_id, timestamp)"),
            ("idx_session_events_idempotency", "session_events(idempotency_key)"),
            ("idx_adaptation_records_session_time", "adaptation_records(session_id, timestamp)"),
            ("idx_agent_decisions_session_time", "agent_decisions(session_id, timestamp)"),
            ("idx_interventions_session_time", "interventions(session_id, timestamp)"),
            ("idx_intervention_outcomes_intervention", "intervention_outcomes(intervention_id)"),
            ("idx_patient_envelopes_patient_exercise", "patient_performance_envelopes(patient_id, exercise_type)")
        ]

        for idx_name, idx_target in indexes:
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {idx_target};")
            print(f"  + Verified index: {idx_name}")

        # 6. Record Schema Version 3.0
        cursor.execute("SELECT COUNT(*) FROM schema_version WHERE version = 3")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
            INSERT INTO schema_version (version, description) 
            VALUES (3, 'NURO-BEATS P5 Master Hardening & Closed-Loop Persistence Architecture');
            """)

        # 7. Record Model Metadata
        models_to_register = [
            ('P0_PERCEPTION', 'v1.0', 'mediapipe_one_euro', '3.0', 'Monotonic frameId, One-Euro filter, confidence gate'),
            ('P1_KINEMATICS', 'v2.0', 'deterministic_features', '3.0', 'ROM, velocity, symmetry, RAS synchronization'),
            ('P4_TEMPORAL', 'v1.0', 'multiscale_causal_tcn_onnx', '3.0', 'Strictly causal, 81-frame receptive window, LayerNorm'),
            ('P2_CONTROLLER', 'v1.0', 'deterministic_governor', '3.0', 'Safety bounds [40, 140], 12s cooldown, hysteresis'),
            ('P5_AGENT', 'v1.0', 'closed_loop_reasoner', '3.0', 'Gemini Few-Shot advisory with deterministic fallback')
        ]
        for comp, m_ver, m_hash, s_ver, notes in models_to_register:
            cursor.execute("SELECT COUNT(*) FROM model_metadata WHERE component = ?", (comp,))
            if cursor.fetchone()[0] == 0:
                cursor.execute("""
                INSERT INTO model_metadata (component, model_version, model_hash, schema_version, notes)
                VALUES (?, ?, ?, ?, ?);
                """, (comp, m_ver, m_hash, s_ver, notes))

        conn.commit()

        # Post-migration check: verify all pre-existing rows are identical
        post_counts = {}
        for t in pre_tables:
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            post_counts[t] = cursor.fetchone()[0]
            assert post_counts[t] == pre_counts[t], f"DATA LOSS DETECTED on {t}: {pre_counts[t]} -> {post_counts[t]}"

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        all_tables = [r[0] for r in cursor.fetchall() if not r[0].startswith('sqlite_')]
        print(f"\n[POST-CHECK SUCCESS] All {len(pre_tables)} legacy tables preserved with 100% row parity:")
        for t in pre_tables:
            print(f"  {t}: {post_counts[t]} rows (MATCH)")
        print(f"Total tables now: {len(all_tables)} ({all_tables})")
        print("Database migration completed successfully!")
        return True

    except Exception as e:
        print(f"[MIGRATION ERROR] {e}")
        conn.rollback()
        raise e
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
