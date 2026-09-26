# API Contract — Nuro-Beats Backend

Single source of truth for Android ↔ backend communication. Legacy Flask endpoints are reference only — do not mix formats.

| Endpoint | Method | Purpose |
|---|---|---|
| `/auth/login` | POST | Authenticate user, return token |
| `/patients/{id}` | GET | Patient profile |
| `/patients/{id}/baseline` | GET | Baseline cadence/motor/speech assessment |
| `/sessions` | POST | Create a new therapy session |
| `/sessions/{id}/events` | POST | Push movement/beat events during a session |
| `/sessions/{id}/complete` | POST | Mark session complete, finalize metrics |
| `/sessions/{id}` | GET | Retrieve a single session's detail |
| `/patients/{id}/sessions` | GET | Session history for a patient |
| `/patients/{id}/progress` | GET | Aggregated progress/trend data |
| `/ai/session-summary` | POST | Generate LLM summary from measured metrics only |
| `/ai/rhythm-config` | POST | Generate structured rhythm style spec (not raw timing) |
| `/adaptation/recommendation` | POST | Get next-session BPM/difficulty recommendation |

## Core Entities

- `users`
- `patients`
- `patient_profiles`
- `baseline_assessments`
- `therapy_sessions`
- `session_metrics`
- `movement_events`
- `adaptation_events`
- `model_predictions`

## Auth

Token-based (JWT or equivalent). Token stored in Android via DataStore, never hard-coded. Every authenticated endpoint must reject expired/invalid tokens with a documented error shape.

## Error Format (documented, consistent across all endpoints)

```json
{
  "error": true,
  "code": "SESSION_NOT_FOUND",
  "message": "Human-readable message"
}
```

## Rules

- No endpoint should be created unless the Android app actually calls it.
- Request/response schemas must be documented before Android integration begins.
- No secrets (Hugging Face token, LLM API keys, DB passwords, JWT signing secret) ever ship inside the Android client — all such calls proxy through the backend.
