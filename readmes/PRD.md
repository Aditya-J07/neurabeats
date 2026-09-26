# Product Requirements Document — Nuro-Beats

## Problem

Parkinson's and stroke patients benefit from Rhythmic Auditory Stimulation (RAS), but access is limited by geography, cost, and the tedium of unadaptive home exercises (fixed metronomes, no feedback, no monitoring).

## Solution

A smartphone-based agent that senses movement via camera, measures synchronization to a therapeutic rhythm, and adapts the rhythm live — with a clinician setting the safe operating range.

## Primary Persona

- **Patient**: often elderly, may have limited tech literacy, needs large text, simple controls, encouraging (not clinical/alarming) feedback.
- **Secondary — Clinician**: wants to assign therapy remotely, monitor trends, and trust that the AI stays within limits they set.

## Patient Features (MVP)

- Log in / view profile
- Start therapy, choose mode (gait training is the hero mode)
- View baseline metrics (baseline cadence, target cadence, starting BPM)
- Start camera-based live therapy session
- See real-time metrics: BPM, target BPM, cadence, sync score, timing error, session timer
- Pause / resume / complete session
- View session summary and historical progress

## Clinician Features (MVP, web-based)

- Log in, view patient list
- View patient profile, baseline data, session history
- View performance trends
- View latest session + AI-generated summary

## Explicit Non-Features (Hackathon Scope)

- No multi-condition support beyond gait (upper-limb and speech are stretch goals only after gait mode fully works)
- No diagnosis, no clinical claims of efficacy
- No AI-controlled timing (deterministic rhythm engine controls all timing)

## Success Criteria

A judge should be able to watch a 2–3 minute live demo and clearly see:

```
CAMERA → MOVEMENT → BEAT → SYNC SCORE → ADAPTATION → IMPROVED SCORE → SESSION SUMMARY
```

without any manual backend manipulation.

## Responsible AI Constraints

- Clinician sets hard BPM/difficulty limits; the agent cannot exceed them.
- Every tempo adjustment is logged with a reason (transparency).
- LLM session summaries must only restate measured data — no invented measurements, no diagnoses, no unsupported clinical conclusions.
- Raw camera/audio data stays on-device; only aggregate metrics (BPM, sync %, duration) are sent to the clinician.
