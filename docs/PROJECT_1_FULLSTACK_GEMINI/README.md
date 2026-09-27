# PROJECT 1: NeuroBeat — Gemini 2.5 Flash + Full-Stack Adaptive Recovery Platform

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-green.svg)](https://flask.palletsprojects.com/)
[![Gemini](https://img.shields.io/badge/Google%20Gemini-2.5%20Flash-orange.svg)](https://deepmind.google/technologies/gemini/)
[![MediaPipe](https://img.shields.io/badge/Google-MediaPipe-brightgreen.svg)](https://mediapipe.dev)
[![Tests](https://img.shields.io/badge/Tests-187%20Passing-success.svg)](#testing--verification)

## 1. Executive Summary

**NeuroBeat (Project 1)** is an enterprise-grade, closed-loop neurological motor and speech rehabilitation web application. Designed for stroke and Parkinson's disease recovery, the platform delivers **Rhythmic Auditory Stimulation (RAS)** coupled with real-time computer vision tracking (MediaPipe) and automated clinical intelligence powered by **Google Gemini 2.5 Flash**.

Every session is evaluated in real time: motion kinematics and acoustic vocal cues are streamed into a deterministic adaptive engine (P2) and autonomous agent (P3), which dynamically adjust pacing. Upon completion, Gemini 2.5 Flash consolidates multi-session history with instant session telemetry to generate EMR-ready structured medical documentation (SOAP notes) and actionable patient coaching.

---

## 2. Key Capabilities & Architectural Highlights

### A. Closed-Loop Rhythmic Auditory Stimulation (RAS)
- **Multi-Modality Therapy**: Gait training, upper limb motor coordination, melodic intonation therapy (MIT), speech rhythm pacing, and balance posture stability.
- **Real-Time Entrainment**: Dynamic tempo adaptation based on continuous cadence sync, kinematic jerk, and movement smoothness.

### B. Gemini 2.5 Flash Clinical Reporting Engine
- **Structured JSON Schema Enforcement**: Strict output validation mapping to clinical bullet points (`summary`, `what_you_did`, `performance_observations`, `what_to_improve`, `recommendations`).
- **SOAP Medical Documentation**: Automatically formats notes into **S**ubjective, **O**bjective, **A**ssessment, and **P**lan standards compliant with hospital Electronic Medical Records (EMR).
- **Few-Shot Recovery Coaching**: High-empathy patient-facing summaries explaining neuroplasticity gains and next-session starting cadence.
- **100% Offline Resilience**: Integrated deterministic fallback (`_generate_deterministic_structured_report`) guaranteeing zero downtime or null responses even during total network disconnects.

### C. 9-Feature Longitudinal Historical Intelligence Layer
- Zero external vector database overhead: executes via fast, relational SQLAlchemy queries on SQLite/PostgreSQL.
- Multi-session trend classification (`improving`, `declining`, `stable`).
- Clinical advisory recommended BPM with safety clamps ($40 \le \text{BPM} \le 140$).
- Contextual accuracy deltas versus historical personal baselines.
- Prompt injection builder feeding longitudinal patient trajectory into Gemini prompts.

### D. Zero "N/A" Metrics Guarantee
- Authoritative telemetry synchronization ensures duration, step count, accuracy, and baseline/target BPM are persistently computed and rendered across all dashboard and modal interfaces.

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Backend API** | Python 3.12, Flask, Flask-SQLAlchemy | Lightweight, production-tested WSGI/ASGI service layer |
| **GenAI Model** | Google Gemini 2.5 Flash (`google-genai` / REST) | Sub-second latency, high instruction following, large context window |
| **Vision Tracking** | Google MediaPipe Pose & Holistic | Edge-computed 33-landmark 3D skeletal tracking at 30+ FPS |
| **Audio Engine** | Web Audio API + HTML5 Audio | Sub-5ms scheduling jitter with synthesized metronomes and chords |
| **Frontend UI** | HTML5, Bootstrap 5, Feather Icons, Chart.js, Vanilla JS | High-contrast `#042046` navy / `#01aac5` cyan accessible medical interface |
| **Testing** | Python `unittest`, Vitest | 187 automated tests (96 backend + 91 frontend) |

---

## 4. Directory Structure

```
├── app.py                             # Flask app initialization, DB binding, error handling
├── routes.py                          # Authoritative API endpoints & view controllers
├── models.py                          # Relational SQLAlchemy models (ClinicalReport, TherapySession)
├── services/
│   ├── gemini_service.py              # Gemini 2.5 Flash clinical engine & SOAP generator
│   └── historical_analysis.py         # 9-feature longitudinal clinical intelligence service
├── templates/
│   ├── session.html                   # Interactive therapy session & clinical complete modal
│   ├── patient_dashboard.html         # Longitudinal metrics & session launch pad
│   └── clinician_dashboard.html       # Patient management & EMR reports
├── static/
│   ├── js/session.js                  # Client session state machine & telemetry forwarding
│   ├── js/audio.js                    # Web Audio API rhythmic pulse generator
│   └── css/custom.css                 # Medical design system styles
└── tests/
    ├── test_clinical_reports_and_hf.py # ClinicalReport & historical intelligence tests
    └── test_master_integration.py     # Closed-loop integration test suite
```

---

## 5. Quick Start & Setup

### Prerequisites
- Python 3.10+ (Python 3.12 recommended)
- Google Gemini API Key (`GEMINI_API_KEY`)

### Environment Configuration
Create or update your `.env` file in the root directory:
```bash
GEMINI_API_KEY="your-gemini-api-key-here"
SESSION_SECRET="your-secure-session-secret"
DATABASE_URL="sqlite:///instance/neurobeat.db"
```

### Installation & Execution
```powershell
# 1. Activate virtual environment
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run automated tests (ensures 187 tests pass)
python -m unittest discover -s tests -p "test_*.py"

# 4. Start local production development server
python main.py
```
Open your browser at `http://127.0.0.1:5000`.

---

## 6. API Reference (Clinical Intelligence)

### `GET /api/session/<int:session_id>/clinical-report`
Returns structured report and SOAP documentation for a completed session.
```json
{
  "success": true,
  "session_id": 142,
  "clinical_report": {
    "activity_type": "gait_trainer",
    "accuracy_score": 86.5,
    "duration_seconds": 120,
    "final_bpm": 68.0,
    "initial_bpm": 62.0,
    "movement_count": 84,
    "summary": "Patient Eleanor completed 120s gait training with 86.5% accuracy.",
    "what_you_did": ["Achieved 84 steps", "Maintained rhythmic entrainment"],
    "performance_observations": ["Cadence rose smoothly from 62 to 68 BPM"],
    "what_to_improve": ["Left toe-off latency was slightly delayed"],
    "recommendations": ["Progress starting BPM to 65 next session"],
    "soap_subjective": "Patient reported comfortable pacing.",
    "soap_objective": "Completed 120s at 68 BPM with 86.5% accuracy across 84 steps.",
    "soap_assessment": "Consistent motor entrainment observed.",
    "soap_plan": "Advance starting cadence."
  }
}
```

### `GET /api/patient/<int:patient_id>/historical-trends`
Returns 9-feature longitudinal metrics, session history, and safe advisory BPM.
```json
{
  "success": true,
  "patient_id": 12,
  "activity_type": "gait_trainer",
  "trend": "improving",
  "advisory_bpm": 70.0,
  "delta": {
    "delta": 4.2,
    "historical_average": 82.3,
    "text": "+4.2% vs historical average (82.3%)"
  },
  "history": [ ... ]
}
```
