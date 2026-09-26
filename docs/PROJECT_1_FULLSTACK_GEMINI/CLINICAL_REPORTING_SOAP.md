# PROJECT 1: Clinical Reporting Engine & EMR SOAP Documentation

## 1. Clinical Background & Medical Justification

In physical medicine and neuro-rehabilitation (stroke and Parkinson's disease), **SOAP documentation** (**S**ubjective, **O**bjective, **A**ssessment, **P**lan) is the global gold standard for clinical progress notes. 

Traditional physical therapy sessions require clinicians to spend 15–25 minutes manually transcribing cadence measurements, gait symmetry, and observations into Hospital Information Systems (HIS) or Electronic Medical Records (EMR).

**NeuroBeat automates this workflow end-to-end**:
- **Subjective (S)**: Patient's reported tolerance, perceived exertion, and session interaction.
- **Objective (O)**: Hard kinematic telemetry (duration in seconds, initial vs final BPM, rhythm synchronization accuracy %, step counts, gait symmetry %).
- **Assessment (A)**: Clinical interpretation of auditory entrainment stability, motor fatigue indicators, and cadence progression responsiveness.
- **Plan (P)**: Specific next-session cadence targets, resting intervals, and exercise complexity adjustments.

---

## 2. Gemini 2.5 Flash Integration Architecture

The reporting engine is implemented in `services/gemini_service.py` via `generate_structured_clinical_report(session_data, historical_context)`:

```
[ Session Telemetry Payload ] + [ Longitudinal Patient History (5 Sessions) ]
                             │
                             ▼
                 [ Prompt Builder with Few-Shot Examples ]
                             │
                             ▼
                 [ Google Gemini 2.5 Flash API Call ]
                    ├─ Temperature: 0.2 (deterministic, clinical)
                    └─ Response MimeType: application/json
                             │
            ┌────────────────┴────────────────┐
     [ Success: Valid JSON ]          [ Failure: Network/Quota/Parse Error ]
            │                                 │
            ▼                                 ▼
   [ Schema Validation ]             [ Deterministic Fallback Engine ]
            │                                 │
            └────────────────┬────────────────┘
                             │
                             ▼
            [ Persist to ClinicalReport Model ]
```

---

## 3. Prompt Engineering & Few-Shot Schema

The prompt enforces strict clinical constraints:
1. **Never diagnose diseases or prescribe pharmaceutical medications**.
2. Focus strictly on **motor coordination, rhythm entrainment, cadence adaptability, and physical safety**.
3. Adhere to the following JSON schema:

```json
{
  "summary": "1-2 sentence executive clinical summary",
  "what_you_did": [
    "Completed X seconds of activity",
    "Tracked auditory cues from X to Y BPM",
    "Achieved N total movement cycles"
  ],
  "performance_observations": [
    "Cadence stability and rhythm synchronization notes",
    "Gait symmetry or bilateral movement coordination observations"
  ],
  "what_to_improve": [
    "Specific kinematic focus area (e.g. toe-off latency, posture sway)"
  ],
  "recommendations": [
    "Actionable guidance for patient's next session",
    "Target cadence recommendation"
  ],
  "soap": {
    "subjective": "Patient-reported tolerance and perceived exertion summary",
    "objective": "Verified kinematic metrics: duration, BPM range, accuracy %, count",
    "assessment": "Clinical assessment of auditory-motor entrainment and fatigue",
    "plan": "Next session starting cadence, resting intervals, and exercise focus"
  }
}
```

---

## 4. Deterministic Offline Fallback Engine

Network failures or rate limits must never compromise patient safety or clinical workflows. When the Gemini API is unreachable, `_generate_deterministic_structured_report(session_data)` computes clinically sound documentation directly from kinematic parameters:

### Tri-Tier Clinical Rule Formulation:
- **Tier 1 (High Entrainment $\ge 85\%$ accuracy)**:
  - *Assessment*: "Excellent rhythm synchronization demonstrating strong auditory-motor entrainment."
  - *Plan*: "Progress baseline tempo by $+2\text{ to } +3\text{ BPM}$ in next session."
- **Tier 2 (Moderate Tracking $70\% \le \text{acc} < 85\%$)**:
  - *Assessment*: "Functional auditory entrainment with moderate consistency. Motor output tracked auditory cues effectively."
  - *Plan*: "Maintain target tempo at current final BPM for one additional session to stabilize cadence."
- **Tier 3 (Fatigue / Boundary $\text{acc} < 70\%$)**:
  - *Assessment*: "Reduced synchronization accuracy indicating potential motor fatigue or pacing boundary reached."
  - *Plan*: "Consolidate pace at a baseline tempo with increased rest intervals to prevent compensatory movement patterns."

---

## 5. Sample Live Output (Verified EMR Format)

```json
{
  "summary": "The patient demonstrated robust auditory-motor synchronization during gait_trainer rehabilitation, achieving 86.5% accuracy across 84 steps at a final cadence of 68 BPM.",
  "what_you_did": [
    "Completed 120 seconds (2.0 min) of gait_trainer training.",
    "Achieved 84 total movement cycles with rhythmic cueing.",
    "Tracked auditory rhythmic stimulation from 62.0 to 68.0 BPM."
  ],
  "performance_observations": [
    "Achieved an overall motor synchronization accuracy of 86.5%.",
    "Maintained smooth bilateral cadence response across 84 verified kinematic steps/cycles."
  ],
  "what_to_improve": [
    "Maintain bilateral step length consistency during tempo transitions"
  ],
  "recommendations": [
    "Target cadence for next session: 70.0 BPM",
    "Maintain rhythmic pacing consistency before challenging higher velocity."
  ],
  "soap": {
    "subjective": "Patient tolerated 120s gait_trainer session with steady engagement.",
    "objective": "Completed 120 seconds of gait_trainer at 62.0->68.0 BPM. Recorded 84 movements with 86.5% synchronization accuracy.",
    "assessment": "Excellent rhythm synchronization (accuracy: 86.5%). Strong auditory-motor entrainment observed with zero freezing episodes.",
    "plan": "Progress baseline tempo to 70.0 BPM for the subsequent session with standard 30s rest intervals."
  },
  "ai_model": "gemini-2.5-flash"
}
```
