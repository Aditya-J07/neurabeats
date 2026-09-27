# NURO-BEATS AI ECOSYSTEM — TWO COMPREHENSIVE PROJECTS

Welcome to the organized architectural documentation suite for **NURO-BEATS**. All existing AI, audio, computer vision, and full-stack engineering work has been consolidated into **two clearly separated, production-ready projects**.

---

## 🏛️ Project Directory & Quick Links

```
docs/
├── README.md                                    <-- You are here (Master Overview)
│
├── PROJECT_1_FULLSTACK_GEMINI/                  <-- Project 1 Documentation Suite
│   ├── README.md                                # Master overview, tech stack & setup
│   ├── ARCHITECTURE.md                          # Data flow, perception pipeline & DB schema
│   ├── CLINICAL_REPORTING_SOAP.md               # Gemini 2.5 Flash, SOAP notes & 9-feature layer
│   └── INTERVIEW_TALKING_POINTS.md              # STAR stories, architecture defense & Q&A
│
└── PROJECT_2_HUGGINGFACE_AI_ML/                 <-- Project 2 Documentation Suite
    ├── README.md                                # Master overview & model lineup
    ├── ARCHITECTURE.md                          # Dual-engine architecture & signal processing math
    ├── MODEL_BENCHMARKS_AND_ROUTER.md           # HF Inference Router benchmarks & serverless vs dedicated
    └── INTERVIEW_TALKING_POINTS.md              # Open-source AI defense, zero-dependency synth & Q&A
```

---

## 🔍 Side-by-Side Comparison of the Two Projects

| Dimension | **PROJECT 1: Full-Stack Gemini Recovery Platform** | **PROJECT 2: Hugging Face & Open-Source Audio Systems** |
|---|---|---|
| **Core Theme** | Full-Stack AI Application & Clinical Intelligence | Generative Audio, Open-Source ML & Acoustic Synthesis |
| **Primary AI Model** | **Google Gemini 2.5 Flash** (sub-second clinical JSON) | **Hugging Face `facebook/musicgen-small`** (300M Transformer) |
| **Perception Layer** | **Google MediaPipe Pose** (33 3D landmarks at 30+ FPS) | Acoustic frequency analysis & tempo-conditioning encoders |
| **Synthesis Layer** | Browser Web Audio API real-time interactive metronome | Server-side 16-bit 44.1kHz WAV procedural acoustic synthesizer |
| **Intelligence Engine**| 9-feature longitudinal analysis layer (`services/historical_analysis.py`) | Dual-engine failover router (`beat_generator.py`) |
| **EMR / Medical Output**| Structured SOAP notes (Subjective, Objective, Assessment, Plan) | Audio cues conditioned by modality (gait, vocal, arm motor) |
| **Persistence Layer**| `ClinicalReport`, `TherapySession`, `PatientPerformanceEnvelope` | Clean file cache (`static/audio/generated/*.wav`) |
| **Key Architectural Guarantee** | 100% deterministic fallback; Zero `"N/A"` UI metrics | Zero-dependency mathematical synthesis fallback ($<8\text{ ms}$) |
| **Target Audience** | Clinical physical therapists, stroke/Parkinson's patients | Audio engineers, ML researchers, open-source AI developers |
| **Interview Focus** | Full-Stack AI systems, clinical safety, LLM schema reliability | Generative audio, Hugging Face Router, DSP math, zero-dependency engineering |

---

## 🚀 How to Run and Test

Both projects share a single unified codebase where components are completely modular and non-invasive:

```powershell
# 1. Run full automated test suite (187 passing tests)
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
cd frontend-react && npm test -- --run && cd ..

# 2. Launch platform
.\.venv\Scripts\python.exe main.py
```

### Accessing the Features
1. **Gemini Clinical Reporting & SOAP Notes (Project 1)**: Complete any therapy session via `/patient/dashboard` or run `/session/<id>/complete`. Open the completed session modal to inspect the 4 observation cards and collapsible EMR SOAP notes.
2. **Hugging Face & Acoustic Synthesis (Project 2)**: Test router status at `/api/hf/status` or synthesize rhythmic tracks at `/api/beat/generate_ai` or click the **AI Track** button in any active session view.
