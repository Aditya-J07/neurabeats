# REST API Reference & Integrated APIs — NeuroBeat

This document provides the complete specification of all APIs utilized across NeuroBeat, including external cloud AI services, client-side vision/audio APIs, and internal backend REST services.

All API responses use standard JSON encoding with uniform error handling.

---

## 0. Integrated APIs & Services Overview

NeuroBeat integrates the following external and core APIs:

| API / Service | Provider | Purpose & Usage | Configuration / Key Required |
| :--- | :--- | :--- | :--- |
| **Google Gemini API** | Google AI Studio | Clinical Intelligence (Agent 1): Generates clinical progress analysis, patient-friendly insights, and standardized SOAP notes. | `GEMINI_API_KEY` (via environment variable) |
| **Hugging Face Inference API** | Hugging Face | Generative Beat Synthesis (Agent 2): Generates personalized MusicGen therapeutic rhythmic auditory tracks. | `HUGGINGFACE_API_TOKEN` (optional; falls back to Tone.js) |
| **Google MediaPipe Pose API** | Google | Edge Vision API: Performs real-time kinematic posture and movement tracking in the browser. | Client-side JavaScript library (no secret key required) |
| **Web Audio & Tone.js API** | W3C / Tone.js | Audio Processing: Real-time vocal FFT cadence extraction, acoustic feedback, and local rhythmic beat synthesis. | Browser Web Audio API (client-side) |
| **NeuroBeat REST & JWT API** | Internal Flask Backend | Session lifecycle management, kinematic telemetry streaming, patient analytics, and secure auth. | `SESSION_SECRET`, `JWT_SECRET_KEY` (via environment variables) |

---


## 1. Authentication Endpoints

### `POST /login`
Authenticates a patient or clinician and establishes an encrypted session.

* **Request Headers**: `Content-Type: application/x-www-form-urlencoded` or `application/json`
* **Request Body**:
  ```json
  {
    "username": "patient_01",
    "password": "SecurePassword123"
  }
  ```
* **Success Response (200 OK / 302 Redirect)**:
  ```json
  {
    "success": true,
    "user_id": 4,
    "user_type": "patient",
    "redirect": "/patient/dashboard"
  }
  ```

### `POST /register`
Registers a new clinician or patient profile.

* **Request Body**:
  ```json
  {
    "username": "dr_smith",
    "email": "drsmith@hospital.org",
    "password": "StrongPassword!2026",
    "first_name": "Sarah",
    "last_name": "Smith",
    "user_type": "clinician"
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Registration successful. Please log in."
  }
  ```

### `GET /logout`
Clears session cookies and terminates the active session context.

---

## 2. Therapy Session Lifecycle Endpoints

### `POST /session/start/<patient_id>`
Initializes a new therapy session with target parameters.

* **URL Parameters**: `patient_id` (integer)
* **Request Body**:
  ```json
  {
    "session_type": "speech_rhythm",
    "initial_bpm": 60.0,
    "target_bpm": 65.0
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "session_id": 1682,
    "session_type": "speech_rhythm",
    "initial_bpm": 60.0,
    "target_bpm": 65.0,
    "status": "in_progress"
  }
  ```

### `POST /api/session/<session_id>/update`
Periodically streams telemetry and live kinematic markers during an active session (every 5 seconds).

* **URL Parameters**: `session_id` (integer)
* **Request Body**:
  ```json
  {
    "current_bpm": 62.0,
    "accuracy_score": 84.5,
    "duration_seconds": 45,
    "vocal_cadence": 64.0,
    "timing_error_ms": 32.0,
    "motion_detected": true
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "session_id": 1682,
    "status": "running"
  }
  ```

### `POST /api/session/<session_id>/complete`
Finalizes an active session, locks telemetry records, and triggers metric aggregation.

* **URL Parameters**: `session_id` (integer)
* **Request Body**:
  ```json
  {
    "final_bpm": 65.0,
    "duration": 180,
    "accuracy_score": 88.0,
    "total_syllables": 46,
    "average_cadence": 64.2
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "session_id": 1682,
    "summary": {
      "duration_formatted": "3m 00s",
      "final_score": 88.0,
      "cadence_gain": "+5.0 BPM"
    }
  }
  ```

---

## 3. Gemini 2.5 Clinical Intelligence Endpoints

### `POST /api/session/<session_id>/report`
Triggers Agent 1 (Gemini 2.5 Flash) to analyze the finalized session against the patient's 30-day longitudinal trajectory.

* **URL Parameters**: `session_id` (integer)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "report": {
      "patient_name": "John Doe",
      "session_date": "2026-09-27",
      "duration": "3m 00s",
      "overall_score": 88.0,
      "clinical_summary": "Patient demonstrated excellent auditory-motor entrainment with speech syllable stability.",
      "what_you_did": [
        "Completed 3 minutes of Rhythmic Auditory Stimulation.",
        "Articulated 46 rhythmic syllables on beat.",
        "Maintained an average cadence of 64 SPM."
      ],
      "what_went_well": [
        "Reduced timing latency from +120ms to +32ms by mid-session.",
        "Zero motor freezing or vocal arrest observed."
      ],
      "areas_to_improve": [
        "Gentle acceleration toward 70 SPM in upcoming sessions."
      ],
      "recommendations": [
        "Practice speech pacing twice daily.",
        "Hydrate prior to vocal entrainment exercises."
      ]
    }
  }
  ```

### `GET /api/session/<session_id>/soap`
Retrieves or generates the standardized clinical SOAP documentation for clinician export.

* **URL Parameters**: `session_id` (integer)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "soap_report": {
      "subjective": "Patient reported high motivation; no cognitive fatigue noted.",
      "objective": "Target BPM: 65. Final BPM: 65. Sync Accuracy: 88%. Timing Error: 32ms.",
      "assessment": "Significant gait/speech rhythm entrainment progress compared to 7-day baseline (+8%).",
      "plan": "Maintain 65 BPM for next 2 sessions, then calibrate upward to 70 BPM."
    }
  }
  ```

---

## 4. Acoustic Synthesis Endpoints

### `POST /api/generate-beat`
Requests Agent 2 to synthesize or configure a therapeutic rhythmic track via Hugging Face MusicGen or Tone.js fallbacks.

* **Request Body**:
  ```json
  {
    "bpm": 65,
    "genre": "classical",
    "accent_pattern": "4/4",
    "duration_seconds": 60
  }
  ```
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "audio_url": "/static/audio/generated/beat_65bpm_classical.mp3",
    "fallback_tonejs": false,
    "bpm": 65
  }
  ```
*(If Hugging Face is unavailable, `fallback_tonejs: true` is returned and Tone.js renders the rhythm locally).*

---

## 5. Clinician Analytics & Longitudinal Data

### `GET /api/patient/<patient_id>/progress`
Returns multi-session longitudinal trend vectors across cadence, synchronization accuracy, and duration.

* **URL Parameters**: `patient_id` (integer)
* **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "patient_id": 3,
    "dates": ["2026-09-20", "2026-09-22", "2026-09-25", "2026-09-27"],
    "cadence_data": [55.0, 58.0, 60.0, 65.0],
    "accuracy_data": [72.0, 78.0, 82.0, 88.0],
    "total_sessions": 4,
    "compliance_rate": "92%"
  }
  ```

---

## 6. Error Response Schema

All failure cases return informative HTTP status codes alongside a structured JSON envelope:

```json
{
  "success": false,
  "error": "SESSION_NOT_FOUND",
  "message": "Therapy session with ID 9999 does not exist.",
  "timestamp": "2026-09-27T08:20:00Z"
}
```
