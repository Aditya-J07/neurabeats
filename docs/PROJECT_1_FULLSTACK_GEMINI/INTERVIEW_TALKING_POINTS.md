# PROJECT 1: Technical Interview Guide & Architecture Defense

## 1. Executive Elevator Pitch

### 30-Second Summary
> "NeuroBeat is a full-stack, closed-loop neurological recovery platform that combines edge computer vision (MediaPipe) with Google Gemini 2.5 Flash. It provides real-time Rhythmic Auditory Stimulation (RAS) for stroke and Parkinson's patients, adapting musical tempo on the fly based on movement kinematics. At the end of every session, our Gemini clinical engine automatically compiles hospital EMR-compliant SOAP notes and patient recovery coaching, backed by a 9-feature longitudinal intelligence layer with a 100% offline deterministic fallback."

### 2-Minute Architectural Walkthrough
> "In neurological rehabilitation, auditory entrainment triggers neuroplasticity in motor pathways. However, traditional physical therapy has two major bottlenecks: lack of adaptive real-time feedback during home exercise, and clinician documentation burnout.
> 
> To solve this, I designed a multi-stage closed-loop platform:
> 1. At the client edge, MediaPipe tracks 33 3D skeletal landmarks at 30 FPS. Our kinematics layer measures joint velocities, cadence, and gait symmetry.
> 2. A deterministic closed-loop controller dynamically adapts metronome tempo within strict medical safety bounds ($40 \le \text{BPM} \le 140$).
> 3. Instead of introducing a complex, resource-heavy vector database, I engineered a zero-overhead longitudinal analysis service in pure SQLAlchemy that computes multi-session trends and safe advisory cadences.
> 4. Upon session completion, Google Gemini 2.5 Flash synthesizes this telemetry and historical context into structured JSON containing actionable patient bullet points and EMR-ready SOAP notes.
> 5. If the network or LLM fails, a rule-based deterministic fallback guarantees zero downtime and zero unpopulated fields. The system is verified by 187 automated tests across Python and Vitest."

---

## 2. STAR Method Interview Stories

### Story 1: Production LLM Reliability in Clinical Workflows
- **Situation**: Integrating an LLM into a health-tech application requires strict guarantees: the system cannot hallucinate medication dosages, crash when offline, or output free-form markdown that breaks UI parsers.
- **Task**: Design an enterprise-grade clinical reporting pipeline that outputs structured SOAP documentation with sub-second latency and 100% availability.
- **Action**:
  - Leveraged Google Gemini 2.5 Flash for its high instruction adherence and low latency.
  - Implemented strict JSON schema enforcement via temperature clamping ($T=0.2$) and few-shot clinical examples.
  - Created `_generate_deterministic_structured_report`, a tri-tier mathematical fallback engine that computes clinical bullet points and SOAP notes directly from session kinematics if external APIs drop.
  - Built an idempotent database persistence model (`ClinicalReport`) with relational foreign keys.
- **Result**: Zero null-pointer exceptions, 100% uptime during network dropouts, and instant generation of EMR-ready records.

---

### Story 2: Why We Eliminated External Vector Databases
- **Situation**: Modern AI architectures often prematurely adopt vector databases (Pinecone, ChromaDB, Milvus) for user history retrieval, introducing unnecessary operational complexity, cold-start latency, and external dependencies.
- **Task**: Enable longitudinal patient intelligence across dozens of therapy sessions without deploying a dedicated vector cluster.
- **Action**:
  - Analyzed the access patterns: clinical rehabilitation relies on temporal, structured time-series metrics (cadence, accuracy %, symmetry, session dates) rather than fuzzy semantic embedding search.
  - Engineered `services/historical_analysis.py` using indexed relational queries in SQLAlchemy.
  - Implemented 9 longitudinal features: trend calculation (improving/declining/stable), advisory BPM calculation, accuracy delta vs historical mean, and prompt injection formatting.
- **Result**: Sub-5ms query times, zero cloud infrastructure cost, zero external API dependencies, and 100% test coverage.

---

### Story 3: Eradicating Telemetry Drift & "N/A" Dashboard Values
- **Situation**: In early prototype testing, users saw `"N/A"` for duration and baseline cadence on the dashboard because client-side timers had race conditions with server session completion.
- **Task**: Establish an authoritative telemetry contract between the Web Audio / MediaPipe frontend and the Flask database.
- **Action**:
  - Standardized duration tracking on monotonic client clock timestamps (`performance.now()`) with server fallback.
  - Implemented verified gait zero-crossing counters that forward integer step counts directly into the completion payload.
  - Configured intelligent defaults based on clinical rehabilitation standards (60 BPM baseline, 70 BPM target) whenever clinician-specified cadences are unpopulated.
- **Result**: Zero `"N/A"` displays across patient and clinician dashboards, verified by automated unit tests.

---

## 3. High-Frequency Interview Questions & Defense

#### Q: "Why did you choose Google Gemini 2.5 Flash over OpenAI GPT-4o or Claude 3.5 Sonnet?"
> "For this full-stack health platform, latency and instruction compliance were paramount. Gemini 2.5 Flash delivers sub-second JSON responses, offers native multimodality, and operates with remarkable cost-efficiency. Its native support for structured JSON schemas allowed us to eliminate regex post-parsing."

#### Q: "How does the platform ensure safety when automatically adjusting musical tempo?"
> "The adaptive engine (P2) is strictly deterministic. The LLM is never in the real-time execution loop. Tempo changes are capped at $\pm 4\text{ BPM}$ per adaptation step and strictly clamped between 40 and 140 BPM. If MediaPipe tracking confidence drops below 0.45 or the user is idle, the system automatically freezes tempo adjustments to prevent erratic pacing."

#### Q: "How does the frontend handle camera and audio synchronization?"
> "We decouple the high-frequency MediaPipe tracking loop (requestAnimationFrame at 30+ FPS) from the audio metronome (Web Audio API hardware-timed audio context). Kinematic metrics are buffered into sliding ring buffers and sampled every 5 seconds for telemetry sync, preventing browser UI thread jank."
