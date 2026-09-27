# Nuro-Beats Movement Measurement Specification (v2.0)

## Overview & Architecture

Nuro-Beats operates on an **Edge-First Hybrid** paradigm:
1. **Local Processing**: Raw camera frames and raw microphone audio remain strictly on the user's client machine.
2. **Deterministic Measurement Layer**: MediaPipe Pose Landmarker Full landmarks undergo multi-stage deterministic signal processing (Quality Gating, Outlier Rejection, One Euro Filtering, Body Normalization, Multi-Signal Event Detection, Statistical Aggregation).
3. **Telemetry & Feature Vector**: Only validated, anonymous numerical telemetry packets (`schema_version: "2.0"`) leave the browser to the backend for session storage, adaptive pacing, and AI interpretation.
4. **Controlled GenAI Summary**: Gemini consumes structured, validated measurements with explicit uncertainty and confidence metadata. Gemini is barred from inventing measurements or diagnosing clinical conditions.

---

## 1. Metric Classification Taxonomy

Every metric within Nuro-Beats is classified according to its scientific and engineering validity:

| Category | Definition | Examples |
| :--- | :--- | :--- |
| **STANDARD MATHEMATICAL MEASURE** | Formally accepted, peer-reviewed mathematical and statistical formulations. | Mean, Median, SD, CV, MAD, RMSE, Percentile (P90, P95), Symmetry Index ($SI$). |
| **PROJECT DERIVED METRIC** | Transparent mathematical composite formulated specifically for this software's UX and telemetry. | Rhythm Alignment Score (0–100), Postural Stability Index (0–100), Movement Signal Quality. |
| **ENGINEERING HEURISTIC** | Configurable algorithmic weights, debounce thresholds, and signal gates tuned for monocular RGB webcams. | Multi-signal step detection weights, tracking quality thresholds, velocity thresholds. |
| **FUTURE VALIDATION METRIC** | Measures architected for future benchmarking against gold-standard instrumentation (e.g. pressure walkway, instrumented treadmill, stopwatch). | 10-Meter Walk Test speed ($m/s$), double-support duration proxy, acoustic jitter/shimmer. |

---

## 2. Anatomical Coordinate Space & Body Normalization

### Classification: STANDARD MATHEMATICAL MEASURE

### Landmarks
* **Left Hip**: Landmark 23
* **Right Hip**: Landmark 24
* **Left Knee**: Landmark 25
* **Right Knee**: Landmark 26
* **Left Ankle**: Landmark 27
* **Right Ankle**: Landmark 28
* **Left Heel**: Landmark 29
* **Right Heel**: Landmark 30
* **Left Foot Index**: Landmark 31
* **Right Foot Index**: Landmark 32
* **Left Shoulder**: Landmark 11
* **Right Shoulder**: Landmark 12

### Pelvis Centering
The coordinate origin is translated to the pelvis midpoint:
$$\mathbf{P}_{\text{pelvis}} = \frac{\mathbf{P}_{23} + \mathbf{P}_{24}}{2}$$

$$\mathbf{p}_{\text{norm}, i} = \mathbf{P}_i - \mathbf{P}_{\text{pelvis}}$$

### Biomechanical Scale Factor ($S$)
Primary scale is torso length (distance between shoulder midpoint and pelvis midpoint):
$$\mathbf{P}_{\text{shoulder}} = \frac{\mathbf{P}_{11} + \mathbf{P}_{12}}{2}$$
$$S_{\text{torso}} = \|\mathbf{P}_{\text{shoulder}} - \mathbf{P}_{\text{pelvis}}\|_2$$

Fallback scale (if shoulders are truncated or low confidence):
$$S_{\text{hip}} = \|\mathbf{P}_{23} - \mathbf{P}_{24}\|_2$$

To prevent frame-to-frame jitter from modulating anatomical scale, scale $S$ is smoothed using an exponential moving average ($\alpha_{\text{scale}} = 0.05$):
$$S_{\text{smoothed}, t} = \alpha_{\text{scale}} \cdot S_t + (1 - \alpha_{\text{scale}}) \cdot S_{\text{smoothed}, t-1}$$

Fully normalized coordinates:
$$\mathbf{p}^*_i = \frac{\mathbf{P}_i - \mathbf{P}_{\text{pelvis}}}{S_{\text{smoothed}}}$$

### Vertical Sign Convention
In screen pixel space, $Y$ increases downwards. In biomechanical coordinates, vertical displacement is flipped:
$$y^*_i = -\frac{Y_i - Y_{\text{pelvis}}}{S_{\text{smoothed}}}$$
* **Standing still**: $y^*_{\text{ankle}} \approx -1.8 \text{ to } -2.0$ (below pelvis).
* **Foot lifting (upward motion)**: $\frac{dy^*}{dt} > 0$.
* **Foot descending / foot strike (downward motion)**: $\frac{dy^*}{dt} < 0$.

---

## 3. Pose Quality Gate & Tracking Coverage

### Classification: ENGINEERING HEURISTIC & STANDARD MATHEMATICAL MEASURE

The quality gate evaluates 9 distinct criteria across every frame:
1. **Critical Landmark Visibility**: Hips (23, 24), Knees (25, 26), Ankles (27, 28), Heels (29, 30), Feet (31, 32).
2. **Lower-Body Completeness**: All 10 lower-limb landmarks present with confidence $\ge 0.35$.
3. **Bilateral Completeness**: Both left and right sides sufficiently visible.
4. **Implausible Jump Detection**: Normalized distance moved in $\Delta t < 50\text{ms}$ exceeding anatomical limits ($> 0.35 \times S$) is marked as an outlier.
5. **Body Framing Bounds**: Patient positioned within safe viewport bounds ($0.05 \le x \le 0.95$, $0.05 \le y \le 0.95$).
6. **Feet-in-Frame Status**: Ankles, heels, and toes not truncated by the bottom edge of the frame ($y < 0.96$).
7. **Temporal Continuity**: Time delta between consecutive frames $\Delta t \le 150\text{ms}$.
8. **Tracking Coverage**:
   $$\text{Coverage}_{\text{window}} = \frac{N_{\text{valid frames}}}{N_{\text{expected frames}}}$$
9. **Critical Landmark Coverage**:
   $$\text{Coverage}_{\text{critical}} = \frac{N_{\text{frames with 10 lower-body landmarks}}}{N_{\text{expected frames}}}$$

### Quality States
* **EXCELLENT**: Confidence $\ge 0.85$, Coverage $\ge 0.95$, feet in frame, no occlusion.
* **GOOD**: Confidence $\ge 0.70$, Coverage $\ge 0.85$, feet in frame.
* **FAIR**: Confidence $\ge 0.50$, Coverage $\ge 0.70$, partial lower limb tracking.
* **POOR**: Confidence $< 0.50$ or feet truncated. Authoritative gait metrics are suppressed.
* **LOST**: No person detected in frame.

---

## 4. Temporal Filtering: Adaptive One Euro Filter

### Classification: STANDARD MATHEMATICAL MEASURE (Casiez et al., 2012)

Applied per landmark coordinate independently to minimize jitter during stationary phases while preserving responsiveness during rapid foot strikes:

$$\alpha = \frac{1}{1 + \frac{\tau}{\Delta t}}, \quad \tau = \frac{1}{2 \pi f_c}$$

Cutoff frequency adapts dynamically to signal velocity $\dot{x}$:
$$f_c = f_{c,\text{min}} + \beta \cdot |\dot{x}|$$

### Default Movement Parameters
* **Gait (Lower Limbs)**: $f_{c,\text{min}} = 1.2\text{ Hz}$, $\beta = 0.008$, $f_{c,\text{deriv}} = 1.0\text{ Hz}$.
* **Balance (Trunk/Pelvis)**: $f_{c,\text{min}} = 0.8\text{ Hz}$, $\beta = 0.003$, $f_{c,\text{deriv}} = 1.0\text{ Hz}$.

### Reset Policy
The filter state is immediately reset upon tracking loss, tracking state change, or a frame gap exceeding $250\text{ms}$ to prevent history contamination.

---

## 5. Multi-Signal Gait Event & Heel-Strike Detection

### Classification: ENGINEERING HEURISTIC

Rather than triggering step events on single threshold crossings, Nuro-Beats employs a multi-signal evidence accumulator:

### Event Hierarchy
1. `FOOT_LIFT`: Ankle/toe vertical velocity crosses positive upward threshold.
2. `SWING_PEAK`: Vertical position reaches local maximum, velocity crosses zero.
3. `FOOT_CONTACT_CANDIDATE`: Downward velocity decelerates towards floor plane.
4. `STEP_EVENT`: Multi-signal evidence score exceeds validation threshold $E \ge E_{\text{thresh}}$ and satisfies temporal debounce ($\Delta t_{\text{same-side}} \ge 350\text{ms}$).
5. `HEEL_STRIKE_CANDIDATE`: Validated `STEP_EVENT` where heel landmark trajectory demonstrates distinct impact deceleration and positive foot-segment pitch angle ($\theta_{\text{heel-toe}} > 0$).

### Multi-Signal Evidence Score ($E$)
$$E = w_1 \cdot E_{\text{traj}} + w_2 \cdot E_{\text{vel}} + w_3 \cdot E_{\text{heel}} + w_4 \cdot E_{\text{toe}} + w_5 \cdot E_{\text{knee}} + w_6 \cdot E_{\text{tempo}} + w_7 \cdot E_{\text{conf}}$$

Default Engineering Weights:
* $w_1 = 0.25$ (Vertical trajectory displacement from baseline)
* $w_2 = 0.20$ (Vertical deceleration profile)
* $w_3 = 0.15$ (Heel trajectory deceleration)
* $w_4 = 0.15$ (Toe/foot-index return to baseline)
* $w_5 = 0.10$ (Knee flexion context)
* $w_6 = 0.10$ (Temporal consistency with cadence history)
* $w_7 = 0.05$ (Landmark visibility confidence)

---

## 6. Cadence Estimation & Interval Statistics

### Classification: STANDARD MATHEMATICAL MEASURE

For a sequence of step timestamps $\{t_1, t_2, \dots, t_N\}$, the inter-step intervals are:
$$\Delta t_k = t_k - t_{k-1}, \quad k \in [2, N]$$

### Robust Statistics
* **Mean Step Interval**: $\mu_{\Delta t} = \frac{1}{N-1} \sum \Delta t_k$
* **Median Step Interval**: $\tilde{\Delta t} = \text{median}(\{\Delta t_k\})$
* **Standard Deviation**: $\sigma_{\Delta t} = \sqrt{\frac{1}{N-2} \sum (\Delta t_k - \mu_{\Delta t})^2}$
* **Coefficient of Variation (CV)**:
  $$\text{CV}_{\Delta t} = \frac{\sigma_{\Delta t}}{\mu_{\Delta t}}$$
* **Median Absolute Deviation (MAD)**:
  $$\text{MAD} = \text{median}(|\Delta t_k - \tilde{\Delta t}|)$$
* **Instantaneous Cadence (SPM)**:
  $$\text{Cadence}_{\text{inst}} = \frac{60}{\Delta t_{\text{latest}}}$$
* **Rolling Median Cadence (SPM)**:
  $$\text{Cadence}_{\text{median}} = \frac{60}{\tilde{\Delta t}}$$

---

## 7. Gait Symmetry Formulations

### Classification: STANDARD MATHEMATICAL MEASURE

### Temporal Symmetry Index ($SI_{\text{temporal}}$)
Standard bilateral temporal symmetry formulation (0% = perfect symmetry):
$$SI_{\text{temporal}} = \frac{T_{\text{right}} - T_{\text{left}}}{0.5 \cdot (|T_{\text{right}}| + |T_{\text{left}}|)} \times 100$$

$$\text{Temporal Asymmetry (\%)} = |SI_{\text{temporal}}|$$

Where $T_{\text{left}}$ and $T_{\text{right}}$ are median left and right step durations.

### Bilateral Dimensions
1. **Step Count Balance**: $\frac{N_{\text{left}}}{N_{\text{left}} + N_{\text{right}}}$
2. **Temporal Asymmetry (\%)**: $|SI_{\text{temporal}}|$
3. **Swing Duration Asymmetry (\%)**:
   $$SI_{\text{swing}} = \frac{\text{Swing}_{\text{right}} - \text{Swing}_{\text{left}}}{0.5 \cdot (\text{Swing}_{\text{right}} + \text{Swing}_{\text{left}})} \times 100$$
4. **Lift Amplitude Asymmetry (\%)**:
   $$SI_{\text{lift}} = \frac{\text{Amp}_{\text{right}} - \text{Amp}_{\text{left}}}{0.5 \cdot (\text{Amp}_{\text{right}} + \text{Amp}_{\text{left}})} \times 100$$

---

## 8. NuroSync: Rhythmic Synchronization Engine (v2.0)

### Classification: STANDARD MATHEMATICAL MEASURE & PROJECT DERIVED METRIC

### Canonical Timeline
Internal events are referenced to a single monotonic timeline:
$$t_{\text{event}} = \text{performance.now()} / 1000.0$$

### Signed & Absolute Timing Error
For movement event at timestamp $t_{\text{step}}$, let $t_{\text{beat}}$ be the associated beat timestamp:
$$e_{\text{signed}} = (t_{\text{step}} - t_{\text{beat}}) \times 1000 \quad [\text{ms}]$$
$$e_{\text{abs}} = |e_{\text{signed}}| \quad [\text{ms}]$$

* $e_{\text{signed}} < 0$: Early foot strike (anticipation).
* $e_{\text{signed}} > 0$: Late foot strike (lag).

### Cycle-Normalized Phase Error
For beat period $T_{\text{beat}} = 60 / \text{BPM}$:
$$\phi = \frac{t_{\text{step}} - t_{\text{beat}}}{T_{\text{beat}}} \in [-0.5, 0.5]$$

### Distribution Statistics
* **Mean Absolute Error (MAE)**: $\text{MAE} = \frac{1}{N} \sum |e_k|$
* **Root Mean Square Error (RMSE)**: $\text{RMSE} = \sqrt{\frac{1}{N} \sum e_k^2}$
* **Median Absolute Error**: $\tilde{e}_{\text{abs}} = \text{median}(\{|e_k|\})$
* **90th Percentile Error (P90)**: 90th percentile of $\{|e_k|\}$
* **95th Percentile Error (P95)**: 95th percentile of $\{|e_k|\}$
* **On-Time Percentage**: Percentage of events where $e_{\text{abs}} \le \text{toleranceMs}$ (default $250\text{ms}$).

### Rhythm Alignment Score (Project Derived Metric)
Deterministic engineering score (0–100):
$$\text{Score}_{\text{instant}} = \max\left(0, \min\left(100, 100 \cdot \left(1 - \frac{e_{\text{abs}}}{\text{toleranceMs}}\right)\right)\right)$$
$$\text{Rhythm Alignment Score} = 0.3 \cdot \text{Score}_{\text{instant}} + 0.7 \cdot \text{Score}_{\text{rolling}}$$

---

## 9. Balance & Postural Sway Formulations

### Classification: STANDARD MATHEMATICAL MEASURE & PROJECT DERIVED METRIC

### Lateral Sway Proxy ($x_{\text{sway}}$)
Medial-lateral deviation of the pelvis center from the base of support center:
$$x_{\text{base}} = \frac{x_{\text{left ankle}} + x_{\text{right ankle}}}{2}$$
$$\Delta x_{\text{sway}, t} = x_{\text{pelvis}, t} - x_{\text{base}, t}$$

### Time Series Window Statistics
Over window of $M$ samples:
* **Mean Sway**: $\bar{x} = \frac{1}{M} \sum \Delta x_{\text{sway}, t}$
* **RMS Sway**: $\text{RMS}_{\text{sway}} = \sqrt{\frac{1}{M} \sum (\Delta x_{\text{sway}, t} - \bar{x})^2}$
* **Peak-to-Peak Sway**: $\max(\Delta x) - \min(\Delta x)$
* **Mean Sway Velocity**:
  $$\bar{v}_{\text{sway}} = \frac{1}{M-1} \sum \frac{|\Delta x_t - \Delta x_{t-1}|}{\Delta t}$$
* **Sway Path Length**: $L_{\text{sway}} = \sum |\Delta x_t - \Delta x_{t-1}|$
* **Trunk Orientation Angle**: Angle between shoulder midpoint and pelvis midpoint relative to vertical.

### Postural Stability Index (Project Derived Metric)
$$\text{Stability Index} = \max\left(0, \min\left(100, 100 \cdot (1 - 2.5 \cdot \text{RMS}_{\text{sway}})\right)\right)$$

---

## 10. Standardized Assessment Modes

### Classification: FUTURE VALIDATION METRIC

1. **10-Meter Walk Test (10MWT)**:
   * Requires established physical path of known distance $D = 10\text{ m}$.
   * Camera automates timing trigger at start line and finish line.
   * Walking speed: $v = \frac{D}{\Delta t_{\text{elapsed}}} \text{ [m/s]}$.
2. **6-Minute Walk Test (6MWT)**:
   * Continuous timing, turn-around counts, and cumulative cadence.
3. **Timed Up and Go (TUG)**:
   * Stand up from chair, walk 3m, turn around, return, sit down.
4. **5 Times Sit-to-Stand (5xSTS)**:
   * Hip-knee angle transition cycles and total elapsed time.

---

## 11. Unified Telemetry & Measurement Payload Schema (`schema_version: "2.0"`)

Every measurement reported to the backend conforms to this versioned contract:

```json
{
  "schema_version": "2.0",
  "session_id": 123,
  "timestamp": 1727362800.123,
  "session_type": "gait_trainer",
  "measurement_quality": {
    "state": "EXCELLENT",
    "confidence": 0.94,
    "tracking_coverage": 0.98,
    "critical_landmark_coverage": 0.96,
    "fps": 29.8,
    "latency_ms": 32.4,
    "outliers_rejected": 2
  },
  "gait": {
    "valid": true,
    "reason": null,
    "cadence_spm": 57.8,
    "cadence_median_spm": 58.0,
    "cadence_cv": 0.08,
    "step_interval_mean_s": 1.04,
    "step_interval_sd_s": 0.08,
    "total_steps": 28,
    "left_steps": 14,
    "right_steps": 14,
    "temporal_asymmetry_pct": 3.8,
    "swing_asymmetry_pct": 4.2,
    "lift_asymmetry_pct": 2.1
  },
  "balance": {
    "valid": false,
    "reason": "MODE_INACTIVE",
    "sway_rms": 0.024,
    "sway_velocity": 0.041,
    "path_length": 0.82,
    "stability_index": 94.0,
    "weight_distribution": "Centered"
  },
  "sync": {
    "valid": true,
    "signed_error_ms_mean": -18.4,
    "absolute_error_ms_mean": 42.1,
    "median_abs_error_ms": 38.0,
    "rmse_ms": 51.6,
    "p90_abs_error_ms": 78.0,
    "p95_abs_error_ms": 94.0,
    "on_time_pct": 85.7,
    "early_events": 16,
    "late_events": 8,
    "on_time_events": 24,
    "rhythm_alignment_score": 88.0,
    "mean_phase_error": -0.018
  },
  "movement": {
    "left_knee_rom_deg": 44.2,
    "right_knee_rom_deg": 43.8,
    "trunk_tilt_deg": 2.1,
    "coordinate_space": "world"
  }
}
```
