# Phase 1: Real-Time Body Movement Tracking & Audio Sensing Foundation

## 1. Executive Summary

Nuro-Beats Phase 1 establishes the real-time browser-side measurement infrastructure for synchronized auditory-motor movement tracking. The system runs real-time computer vision and audio sensing entirely on the client device inside the web browser, guaranteeing low latency, judge-demo reliability, and user privacy.

> **CRITICAL ARCHITECTURAL BOUNDARY:**  
> Phase 1 is pure **measurement infrastructure**. It strictly does **not** perform medical diagnosis, clinical conclusions, or autonomous treatment modifications. All metrics (cadence, symmetry, sync score) represent objective movement telemetry.

---

## 2. MediaPipe Pose Landmarker FULL Architecture

### 2.1 Model Choice: `pose_landmarker_full.task`
- **Primary Model**: Official Google MediaPipe `pose_landmarker_full.task` (9.4 MB float16 model).
- **Topology**: 33 3D body landmarks with visibility and presence confidence scores.
- **Critical Keypoints Tracked**:
  - Hips (23, 24)
  - Knees (25, 26)
  - Ankles (27, 28)
  - Heels (29, 30)
  - Foot Indices / Toes (31, 32)
  - Shoulders (11, 12) for torso normalization
- **Why FULL is Used**:
  - **Lower-Body Precision**: The Full model provides significantly higher precision and spatial stability on lower extremities (ankles, heels, and foot indices) compared to the Lite model, which is essential for gait strike detection.
  - **Browser Feasibility**: Running on WebAssembly SIMD and WebGL/GPU delegates, the Full model achieves 25–30+ FPS in modern browsers without the high latency and compute overhead of the Heavy model.
  - **Reliable Local Deployment**: Packaged directly in `/models/pose_landmarker_full.task` and supported with local WASM binaries in `/wasm/`, eliminating external CDN dependency failures during offline demos.

---

## 3. Sensing & Processing Pipeline

```
WEBCAM (1280x720 / 640x480 fallback)
  │
  ▼
Frame Manager (requestVideoFrameCallback, latest-frame non-blocking loop)
  │
  ▼
MediaPipe Pose Landmarker FULL (VIDEO mode, numPoses = 1)
  │
  ▼
Pose Quality Gate (evaluates hips, knees, ankles, feet; states: TRACKING, MOVING, STATIONARY, UNCERTAIN, LOST)
  │
  ▼
Temporal Filtering (One Euro Filter on 33 landmarks for adaptive jitter & lag suppression)
  │
  ▼
Body Normalization (pelvis-centric origin, torso-scale invariance)
  │
  ▼
Movement Feature Extraction (velocities, accelerations, knee/hip angles, stride width)
  │
  ▼
Movement Event Detector (deterministic gait state machine: stance → swing up → peak → descent → strike)
  │
  ▼
Cadence Estimator (rolling window SPM, stability index, safe display formatting)
  │
  ▼
Multimodal Audio Alignment (microphone RMS + synthesized rhythm beat timestamp alignment)
  │
  ▼
Telemetry Buffer (throttled 10 Hz compact emission to backend API)
```

---

## 4. Pipeline Details

### 4.1 Frame Processing & Camera Fallback
- Requests preferred 1280x720 resolution, automatically falling back to 640x480 if unsupported.
- Uses `HTMLVideoElement.requestVideoFrameCallback()` with fallback to `requestAnimationFrame()`.
- Implements **latest-frame processing**: if inference is currently executing, subsequent frames are dropped rather than queued, avoiding unbounded latency and memory growth.

### 4.2 Pose Quality Gate
- Before movement calculation, lower-body completeness and confidence are verified across hips, knees, ankles, and feet.
- Tracking States:
  - `TRACKING`: All critical landmarks present with high confidence.
  - `MOVING`: Lower body moving above velocity threshold.
  - `STATIONARY`: Subject in frame and stationary.
  - `UNCERTAIN`: Partial landmarks or low visibility (e.g. feet out of frame).
  - `LOST`: Subject not detected or hips obscured.

### 4.3 Temporal Smoothing (One Euro Filter)
- 1D One Euro Filter applied across $x, y, z$ for all landmarks.
- Reduces jitter at low velocity through low cutoff frequency ($f_c = 1.0\text{ Hz}$).
- Dynamically increases cutoff with velocity ($\beta = 0.007$) to avoid phase lag during rapid step transitions.
- Fully resets upon tracking loss to prevent boundary artifacts.

### 4.4 Body Normalization
- Coordinates normalized relative to the pelvic midpoint between left and right hips:
  $$\mathbf{p}_{\text{norm}} = \frac{\mathbf{p} - \mathbf{p}_{\text{hip\_center}}}{S}$$
- Scale factor $S$ defined by torso height (shoulder midpoint to hip midpoint) with fallback to hip width $\times 1.6$.
- Inverted Y ensures positive vertical displacement indicates upward movement.

### 4.5 Movement Event Detection
- Avoids fragile single-threshold rules (`ankle_y > threshold`).
- Implements a deterministic finite state machine per leg:
  1. `STANCE`: Leg planted near baseline.
  2. `SWING_UP`: Vertical velocity exceeds lift threshold.
  3. `SWING_PEAK`: Upward velocity crosses zero into descent.
  4. `SWING_DOWN`: Foot descends towards baseline.
  5. `FOOT_STRIKE`: Downward velocity decelerates near floor level; emits `LEFT_STEP` / `RIGHT_STEP`.
- Debounce windows: minimum 280ms interval on the same foot and 180ms between alternating feet, preventing impossible firing rates (> 200 SPM).

### 4.6 Cadence & Symmetry Telemetry
- Rolling window of inter-step intervals ($N = 6$).
- Computes instantaneous cadence, rolling cadence (SPM), and cadence stability based on the coefficient of variation.
- Never renders `NaN`, `Infinity`, or `undefined`; formats insufficient data gracefully as `--`.
- Bilateral balance calculated from step counts, timing symmetry, and lift amplitude.

---

## 5. Audio Sensing & Multimodal Alignment

- **Local Web Audio API**: Captures microphone stream via `AudioContext` and `AnalyserNode`.
- **Privacy First**: Raw audio never leaves the browser. Only extracted RMS energy and speech/audio activity flags are processed.
- **Multimodal Timestamp Alignment**:
  - Aligns movement timestamps against synthesized rhythm beat timestamps (`currentTime`).
  - Measures timing offset in milliseconds: $\Delta t = |t_{\text{step}} - t_{\text{beat}}|$.
  - Computes synchronization accuracy score and phase relationship (`ON_BEAT`, `EARLY`, `LATE`).

---

## 6. Telemetry Schema

Transmitted at a controlled rate of 10 Hz:

```json
{
  "session_id": 1,
  "timestamp": 128.452,
  "pose": {
    "confidence": 0.94,
    "tracking_state": "TRACKING"
  },
  "movement": {
    "state": "MOVING",
    "confidence": 0.92,
    "quality": 88
  },
  "gait": {
    "cadence_spm": 54.0,
    "left_steps": 14,
    "right_steps": 13,
    "balance": 96
  },
  "sync": {
    "target_bpm": 54,
    "score": 90,
    "timing_error_ms": 24
  },
  "audio": {
    "level": 0.08,
    "activity": false,
    "confidence": 0.85
  },
  "performance": {
    "camera_fps": 30.0,
    "pose_fps": 29.8,
    "inference_latency_ms": 16.4,
    "dropped_frames": 0
  }
}
```

---

## 7. How to Run & Validate

### 7.1 Running Frontend Tests
```bash
cd frontend-react
npm test
```
*Executes all 18 pure logic unit tests (normalization, vector geometry, One Euro Filter, quality gate, state machine, cadence, balance, telemetry serialization).*

### 7.2 Running ESLint
```bash
cd frontend-react
npm run lint
```
*Verifies clean code without lint errors or unhandled warnings.*

### 7.3 Building Production Bundle
```bash
cd frontend-react
npm run build
```

### 7.4 Running the Application
```bash
# Terminal 1 - Backend (port 8000)
uv run python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend (port 5000)
cd frontend-react
npm run dev
```
Open browser at `http://localhost:5000`.

---

## 8. Known Limitations
- Requires adequate room lighting for reliable foot landmark detection.
- Extremely loose, billowy pants may reduce visibility of knee angle definitions.
- Webcams positioned too high (steep downward angle) may compress vertical stride parallax.
