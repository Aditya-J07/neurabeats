# Nuro-Beats

**An AI-assisted rhythmic rehabilitation platform.**

Nuro-Beats uses rhythm as a therapy mechanism for patients recovering from Parkinson's disease and stroke. It continuously measures how well a patient synchronizes movement (or speech) with a therapeutic rhythm, and adapts that rhythm in real time based on measured performance.

> Built for **Build for Billions** (Track: Agentic AI for Billions) by **Team String Coders**.

---

## Core Idea

```
CAMERA / MICROPHONE
      ↓
POSE / MOVEMENT DETECTION
      ↓
RHYTHM SYNCHRONIZATION MEASUREMENT
      ↓
ADAPTIVE BPM / DIFFICULTY
      ↓
NEXT RHYTHM
      ↓
SESSION ANALYTICS
```

The system doesn't just play a beat — it senses how the patient is moving, decides how well they're syncing to the rhythm, and acts by adjusting the therapy in real time, within clinician-set safety limits.

## Hero Demo (Hackathon Focus)

**Real-Time Gait / Movement Trainer**: patient walks in front of a phone camera → the app detects steps via pose landmarks → compares step timing to the therapeutic beat → computes a synchronization score → adapts BPM up or down → patient continues, system keeps adapting.

## Why This Matters

- 11.7M people live with Parkinson's disease; ~12M new strokes occur every year.
- Rhythmic Auditory Stimulation (RAS) is a clinically proven technique — but access to therapists and equipment is limited to hospitals and cities.
- Nuro-Beats turns a smartphone patients already own into a home rehab coach: no special hardware, works offline, and gives clinicians remote visibility without more clinic hours.

## Repository Structure

```
nuro-beats/
├── android/              # Native Android client (Kotlin + Compose)
├── backend/              # FastAPI backend (auth, sessions, therapy, AI)
├── ml/                   # Personalization model (training/inference)
├── frontend-clinician/   # Clinician web dashboard
├── docs/                 # PRD, architecture, API, demo, ML docs
└── scripts/ / docker/    # Dev tooling
```

See `docs/ARCHITECTURE.md`, `docs/PRD.md`, `docs/API.md`, `docs/DEMO.md`, and `docs/ML.md` for details.

## Tech Stack Summary

| Layer | Choice |
|---|---|
| Android | Kotlin, Jetpack Compose, Material 3, Hilt, Retrofit, CameraX |
| Pose detection | MediaPipe Pose Landmarker (on-device) |
| Backend | FastAPI, PostgreSQL/Supabase |
| ML | Lightweight model (XGBoost / Random Forest) for personalization |
| GenAI | LLM for session summaries + rhythm style config only — never controls timing directly |
| Agent | Lightweight "Therapy Agent" that orchestrates data, never diagnoses or overrides safety limits |

## Development Priority Order

1. Working Android app shell
2. Camera → pose detection
3. Movement/step detection
4. Rhythm generation (deterministic)
5. Synchronization measurement (no randomness, no fake scores)
6. Adaptive BPM controller (deterministic rules first)
7. Session persistence (backend)
8. Polished live therapy UI
9. ML personalization (measured data only)
10. GenAI session summary
11. Therapy Agent orchestration
12. Clinician dashboard polish

**Never sacrifice items 1–9 to add another AI feature.**

## Non-Goals for the Hackathon

- No Kubernetes, Kafka, microservices sprawl, or custom pose-model training.
- No reinforcement learning system.
- No fabricated patient data or invented clinical claims.
- No LLM-controlled beat timing — timing is always deterministic.

## Security Note

⚠️ If this repo previously contained a hard-coded Hugging Face token or any other credential, treat it as compromised. Rotate it, move all secrets to environment variables, and confirm `.gitignore` excludes any secret files before continuing development.

## Status Labeling

Anything using synthetic/prototype/demo data must be clearly labeled as such in the UI and docs. Real patient data is never fabricated.

## License / Attribution

Concept originally prototyped as "Neura-Beats" at an earlier hackathon; this build is a substantial extension with a new team, new architecture (agentic sense-think-act-report loop, camera-based sensing, clinician safety controls), and new scope for Build for Billions.
