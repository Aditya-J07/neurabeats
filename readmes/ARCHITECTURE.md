# Architecture — Nuro-Beats

## High-Level Flow

```
Android App (Kotlin/Compose)
   │
   ├─ CameraX ──► MediaPipe Pose Landmarker ──► NuroMotion (movement events)
   │
   ├─ Rhythm Engine (deterministic BPM/beat generation)
   │
   ├─ NuroSync (beat timestamps + movement timestamps → sync score)
   │
   ├─ Adaptation Engine (deterministic rules → new BPM, within clinician limits)
   │
   └─ Retrofit/OkHttp ──► FastAPI Backend
                              │
                              ├─ Auth
                              ├─ Sessions / Metrics (PostgreSQL / Supabase)
                              ├─ ML personalization model (XGBoost/RandomForest)
                              ├─ GenAI: session summary + rhythm style config (LLM)
                              └─ Therapy Agent (orchestration only, no diagnosis)
```

## Key Modules

### NuroMotion (movement processing)
Pipeline: pose landmarks → normalization → temporal smoothing → movement features (ankle position/velocity/acceleration, knee/hip angle, foot distance) → deterministic event detection (peak detection on smoothed velocity → step event).

Event shape:
```json
{ "timestamp": 12.42, "type": "STEP", "side": "LEFT", "confidence": 0.94 }
```

### Rhythm Engine
Deterministic BPM/beat generator. Supports start/pause/resume/stop, multiple sound types (metronome, bell, drum, wooden block, piano). Never uses generative AI for core timing.

### NuroSync (synchronization engine)
For each movement event, finds nearest valid beat timestamp, computes timing error, then aggregates: mean absolute error, standard deviation, % within tolerance, consistency, and a single synchronization score. No randomness — this must be fully reproducible from the same inputs.

### Adaptation Engine
Deterministic controller (baseline before any ML):
- Poor sync → reduce BPM slightly
- Stable/improving sync → hold
- Consistently high sync → increase BPM slightly (within clinician-set limits)

### ML Personalization (Phase 8, after deterministic system works)
Lightweight model (XGBoost/RandomForest) trained on measured session telemetry (BPM, cadence, sync score, timing error/variance, session history) to predict next-session difficulty recommendations. Must be clearly labeled if trained on synthetic/prototype data.

### GenAI (two constrained uses only)
1. **Session summary** — takes structured measured metrics, returns a plain-language summary. Must not invent measurements, diagnose, or claim clinical efficacy.
2. **Rhythm style config** — LLM may output a structured spec (style, complexity, accent pattern, texture, bpm) that the deterministic rhythm engine then renders. The LLM never controls timing directly.

### Therapy Agent (lightweight orchestration only)
Tools: `get_patient_profile`, `get_baseline`, `get_recent_sessions`, `get_latest_metrics`, `calculate_trend`, `get_recommended_parameters`, `create_session`, `generate_session_summary`.
Constraints: cannot diagnose, cannot invent medical facts, cannot bypass hard-coded therapy limits, cannot make unsupported medical recommendations.

## Data Flow / Privacy

Raw camera and audio data is processed on-device and never uploaded. Only session-level aggregates (BPM, sync %, cadence, duration) sync to the backend for clinician visibility and analytics.

## Offline Strategy

The live loop (camera → pose → movement → sync → BPM) runs entirely on-device. The server is only used for auth, persistence, analytics, AI summary, and ML recommendations — never inside the latency-critical loop.
