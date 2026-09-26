"""
End-to-End Verification Script for Nuro-Beats
Verifies:
1. Session start & complete
2. Real metrics calculation & persistence
3. Automatic clinical report generation
4. Progress page rendering (Zero N/A, real metrics, View Report link)
5. Recent sessions API (has_report=True, report_url bound)
6. Dedicated clinical report view (SOAP, 4-card matrix, Print/PDF buttons)
7. ReportLab PDF download (binary stream, valid PDF header)
8. Centralized Prompt Control API (GET/POST)
9. Hugging Face configuration and inference test API
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from app import app, db
import routes
from models import User, PatientProfile, TherapySession, ClinicalReport

def run_verification():
    with app.app_context():
        with app.test_client() as client:
            # 1. Create or fetch test patient
            user = User.query.filter_by(username='e2e_verifier').first()
            if not user:
                user = User(
                    username='e2e_verifier',
                    email='verifier@example.com',
                    user_type='patient',
                    first_name='Arthur',
                    last_name='Dent'
                )
                user.set_password('Secret123!')
                db.session.add(user)
                db.session.commit()

            patient = PatientProfile.query.filter_by(user_id=user.id).first()
            if not patient:
                patient = PatientProfile(
                    user_id=user.id,
                    condition='parkinsons',
                    baseline_cadence=60.0,
                    target_cadence=72.0
                )
                db.session.add(patient)
                db.session.commit()

            with client.session_transaction() as sess:
                sess['user_id'] = user.id
                sess['user_type'] = 'patient'

            # 2. Start session
            resp = client.post('/session/start', json={
                'session_type': 'gait_trainer',
                'initial_bpm': 60.0,
                'target_bpm': 72.0
            })
            assert resp.status_code == 200, f"Start failed: {resp.data}"
            sess_id = resp.get_json()['session_id']
            print(f"[GATE 1] Session #{sess_id} started successfully.")

            # 3. Complete session
            comp_resp = client.post(f'/session/{sess_id}/complete', json={
                'duration': 90,
                'final_bpm': 66.0,
                'accuracy_score': 85.5,
                'left_steps': 48,
                'right_steps': 46,
                'gait_symmetry': 95.8,
                'notes': 'End-to-end automated verification run'
            })
            assert comp_resp.status_code == 200, f"Complete failed: {comp_resp.data}"
            comp_data = comp_resp.get_json()
            assert comp_data['success'] is True
            assert comp_data['clinical_report'] is not None
            print(f"[GATE 2] Session #{sess_id} completed, clinical report generated automatically.")

            # 4. Check Progress page (Zero N/A)
            prog_resp = client.get(f'/progress/{patient.id}')
            assert prog_resp.status_code == 200
            prog_html = prog_resp.data.decode('utf-8')
            assert '<h4>N/A</h4>' not in prog_html, "Found <h4>N/A</h4> on progress page!"
            assert '<div class="h5">N/A</div>' not in prog_html, "Found <div class='h5'>N/A</div> on progress page!"
            assert 'View Report' in prog_html, "Missing 'View Report' button on progress page!"
            assert f'/session/{sess_id}/report' in prog_html, "Missing report link on progress page!"
            print("[GATE 3] Progress page verified - ZERO N/A values, real metrics displayed, View Report link present.")

            # 5. Check Recent Sessions API
            rec_resp = client.get('/api/patient/recent-sessions')
            assert rec_resp.status_code == 200
            rec_data = rec_resp.get_json()
            latest_sess = [s for s in rec_data['sessions'] if s['id'] == sess_id][0]
            assert latest_sess['has_report'] is True
            assert latest_sess['report_url'] == f'/session/{sess_id}/report'
            print("[GATE 4] Recent Sessions API verified - has_report=True, report_url bound.")

            # 6. Check View Report Page
            rep_resp = client.get(f'/session/{sess_id}/report')
            assert rep_resp.status_code == 200
            rep_html = rep_resp.data.decode('utf-8')
            assert 'NURO-BEATS REHABILITATION PLATFORM' in rep_html
            assert 'Print Report' in rep_html
            assert 'Download PDF' in rep_html
            assert 'SUBJECTIVE (S)' in rep_html
            assert 'OBJECTIVE (O)' in rep_html
            assert 'ASSESSMENT (A)' in rep_html
            assert 'PLAN (P)' in rep_html
            assert 'What You Did' in rep_html
            assert 'Performance Observations' in rep_html
            print(f"[GATE 5] Clinical Report view verified for session #{sess_id}.")

            # 7. Check PDF Export
            pdf_resp = client.get(f'/session/{sess_id}/report/pdf')
            assert pdf_resp.status_code == 200
            assert pdf_resp.content_type == 'application/pdf'
            assert pdf_resp.data.startswith(b'%PDF-')
            assert len(pdf_resp.data) > 1500
            print(f"[GATE 6] Clinical PDF export verified - valid binary stream ({len(pdf_resp.data)} bytes).")

            # 8. Check Prompt Control & HF Config
            p_resp = client.get('/api/ai/prompts')
            assert p_resp.status_code == 200
            prompts = p_resp.get_json()['prompts']
            assert 'session_planner' in prompts
            assert 'clinical_report' in prompts
            assert 'rhythm_audio_generation' in prompts

            hf_resp = client.get('/api/hf/config')
            assert hf_resp.status_code == 200
            cfg = hf_resp.get_json()['config']
            assert cfg['model'] == 'facebook/musicgen-small'

            test_gen = client.post('/api/hf/inference-test', json={
                'bpm': 65,
                'prompt': 'walking drum rhythm',
                'duration': 2,
                'parameters': {'temperature': 0.75}
            })
            assert test_gen.status_code == 200
            gen_data = test_gen.get_json()
            assert gen_data['success'] is True
            assert gen_data['audio_url'] is not None
            print(f"[GATE 7] Prompt Control & Hugging Face Config APIs verified - audio generated ({gen_data['engine_used']}).")

            print("\n" + "="*70)
            print(">>> ALL 7 CORE INTEGRATION GATES VERIFIED AND PASSING SUCCESSFULLY! <<<")
            print("="*70)

if __name__ == '__main__':
    run_verification()
