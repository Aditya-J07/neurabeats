# PROJECT 2: NeuroHugging — Hugging Face Inference Router & Dual-Engine Acoustic Synthesizer

[![Hugging Face](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Inference%20Router-yellow.svg)](https://router.huggingface.co)
[![MusicGen](https://img.shields.io/badge/Model-facebook%2Fmusicgen--small-purple.svg)](https://huggingface.co/facebook/musicgen-small)
[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://python.org)
[![Acoustic](https://img.shields.io/badge/Acoustic%20Engine-Pure%20Python%20WAV-brightgreen.svg)](#pure-python-acoustic-synthesis)
[![Tests](https://img.shields.io/badge/Tests-Passing-success.svg)](#testing)

## 1. Executive Summary

**NeuroHugging (Project 2)** is an open-source, dual-engine therapeutic audio generation and clinical intelligence suite. Built to interface with the modern **Hugging Face Inference Router (`router.huggingface.co`)**, the system pairs large neural foundation models with a zero-dependency mathematical acoustic synthesizer in pure Python.

The architecture solves the primary failure mode of cloud neural audio in therapeutic settings: **unpredictable cloud latency, GPU container cold-starts, and serverless 400 errors**. By combining `facebook/musicgen-small` with local procedural acoustic synthesis, NeuroHugging provides sub-10ms studio-grade 16-bit 44.1kHz audio tracks for therapeutic rhythmic entrainment under any network or GPU condition.

---

## 2. Model & Synthesis Lineup

### A. Level 1: Cloud Neural Inference (`facebook/musicgen-small`)
- **Architecture**: 300M parameter autoregressive Transformer conditioned on text prompts and BPM cues.
- **Modern Endpoint**: Routes through `https://router.huggingface.co/hf-inference/models/facebook/musicgen-small`.
- **Token Validation**: Automated permission checks via `https://huggingface.co/api/whoami-v2`.

### B. Level 2: Pure-Python Procedural Acoustic Synthesizer
- **Zero Third-Party Dependencies**: Synthesizes broadcast-quality 16-bit 44.1kHz stereo/mono WAV files using only standard library modules (`math`, `wave`, `struct`, `time`).
- **Acoustic Kick Drum**: Exponential pitch-sweeping sine waves with rapid decay envelopes:
  $$f(t) = 48 + 87 e^{-34t}\text{ Hz}, \quad A(t) = 0.85 e^{-26t}$$
- **Acoustic Snare & Rimshot**: High-pass filtered pseudo-random white noise combined with a 210 Hz body tone.
- **Lo-Fi Rhodes Piano**: Multi-harmonic Fourier synthesis playing 4-bar jazz chord cadences ($C^{\text{maj7}} \to A^{\text{m7}} \to D^{\text{m7}} \to G^7$).
- **Solfeggio Crystal Chimes**: High-order inharmonic partials tuned to therapeutic 432 Hz and 528 Hz frequencies.
- **Metronome Woodblock**: High-transient resonant woodblock (1120 Hz downbeat, 820 Hz offbeat).

---

## 3. Key Capabilities & Engineering Feats

1. **Endpoint Modernization**: Migrated legacy deprecated endpoints (`api-inference.huggingface.co`) to the modern, performant Hugging Face Inference Router (`router.huggingface.co`).
2. **Zero-Latency Fallback Architecture**: If a Hugging Face serverless container is cold, returns HTTP 400/503, or the client is offline, the procedural synthesizer generates and serves an acoustic WAV in under 10 milliseconds.
3. **Deterministic Audio Cache**: WAV files are written to `static/audio/generated/` with cache-busting timestamps (`?v=timestamp`) and collision-free identifiers.
4. **Open-Source Text Model Compatibility**: Integration-ready endpoints for open-source LLMs (such as `mistralai/Mistral-7B-Instruct-v0.2`) for offline clinical note structuring.

---

## 4. Directory Structure

```
├── beat_generator.py                  # Dual-engine audio generator & HF router interface
├── static/audio/generated/            # Local directory for synthesized WAV tracks
├── routes.py                          # Endpoints: /api/hf/status, /api/hf/token, /api/beat/generate_ai
├── docs/PROJECT_2_HUGGINGFACE_AI_ML/
│   ├── README.md                      # Project 2 master overview
│   ├── ARCHITECTURE.md                # Signal processing math & dual-engine architecture
│   ├── MODEL_BENCHMARKS_AND_ROUTER.md # HF Router benchmarks & serverless vs dedicated
│   └── INTERVIEW_TALKING_POINTS.md    # Technical interview questions and STAR stories
└── tests/
    └── test_clinical_reports_and_hf.py # Test suite verifying router status & audio generation
```

---

## 5. Quick Start & Setup

### Environment Variables
Configure your Hugging Face User Access Token in `.env`:
```bash
HUGGINGFACE_API_TOKEN="hf_your_actual_token_here"
```

### Direct Python Generation (Zero-Dependency)
```python
from beat_generator import BeatGenerator

bg = BeatGenerator()

# 1. Test Hugging Face connection
status = bg.check_connection()
print(f"HF Router Status: {status}")

# 2. Generate a 72 BPM gait rehabilitation track
result = bg.generate_beat_detailed(
    bpm=72,
    session_type="gait_trainer",
    duration=10
)

print(f"Generated Audio: {result['audio_url']}")
print(f"Engine Used: {result['engine_used']}")  # procedural_acoustic_synth or huggingface_router
```

---

## 6. API Reference

### `GET /api/hf/status`
Checks connection and authentication status with Hugging Face.
```json
{
  "success": true,
  "status": {
    "authenticated": true,
    "endpoint": "https://router.huggingface.co/hf-inference/models",
    "username": "aditya-j07",
    "details": {
      "status": "connected",
      "type": "user",
      "valid": true
    }
  }
}
```

### `POST /api/beat/generate_ai`
Synthesizes a therapeutic rhythm track at the requested BPM.
```json
{
  "bpm": 80.0,
  "session_type": "gait_trainer",
  "duration": 10
}
```
**Response**:
```json
{
  "success": true,
  "audio_url": "/static/audio/generated/ai_beat_drum_80_s529103_1727384912000.wav?v=1727384912000",
  "engine_used": "procedural_acoustic_synth",
  "bpm": 80.0,
  "details": { ... }
}
```
