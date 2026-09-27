# ML & GenAI — Nuro-Beats

## Deterministic First, ML Second

The core loop (movement detection → sync scoring → BPM adaptation) is deterministic signal processing, not ML, for the hackathon MVP. This keeps the demo explainable and reliable. ML is added as a personalization layer on top, not a replacement.

## ML: Performance Personalization

- **Model**: lightweight — XGBoost, Random Forest, or Gradient Boosting. No custom deep learning or transformer training.
- **Inputs**: current BPM, target BPM, current cadence, sync score, mean/variance of timing error, previous session score, baseline cadence, session duration, session number, recent trend.
- **Outputs**: predicted next-session sync, recommended difficulty, recommended BPM adjustment.
- **Training data**: for the hackathon, this may be synthetic/prototype data used only to demonstrate the architecture. This must be clearly labeled as such in the UI and docs — never presented as validated on real patients.

## GenAI: Two Constrained Uses Only

1. **Session summary** — strict prompt: use only supplied structured metrics, never invent numbers, never diagnose, never claim clinical efficacy.
2. **Rhythm style configuration** — LLM outputs a structured spec (style, complexity, accent pattern, texture, target BPM); the deterministic rhythm engine renders the actual beat. The LLM never controls real-time timing.

## Agentic Layer: Therapy Agent

A lightweight orchestrator, not a decision-maker for medical judgments. Tools available: `get_patient_profile`, `get_baseline`, `get_recent_sessions`, `get_latest_metrics`, `calculate_trend`, `get_recommended_parameters`, `create_session`, `generate_session_summary`.

Hard constraints:
- No diagnosis
- No invented medical facts
- Cannot bypass hard-coded therapy safety limits
- Cannot make unsupported medical recommendations

## What NOT to Build During the Hackathon

- No custom pose estimation model (use MediaPipe as-is)
- No reinforcement learning
- No large-scale MLOps platform, model registry, or A/B testing infra
- No fabricated "clinical validation" claims anywhere in the app or docs
