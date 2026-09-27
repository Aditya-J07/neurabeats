# Demo Guide — Nuro-Beats

## Target Length: 2–3 minutes

## Script

1. **Login → Dashboard** — show patient name, current therapy, latest score, "Start Therapy" button.
2. **Select Gait Training** — show baseline cadence (e.g. 88 BPM), target cadence, recommended starting BPM (e.g. 90 BPM).
3. **Camera starts** — live preview + pose skeleton overlay, current BPM, target BPM, cadence, sync score, timing error, session timer all visible.
4. **Live movement analysis** — narrate detected step events (left step, right step...) as they appear on screen.
5. **Synchronization** — point out the sync score updating live as timing error is calculated beat-by-beat.
6. **Adaptation** — call out an explicit BPM change on screen, e.g. "Sync = 68% → BPM 90 → 88" then later "Sync = 91% → BPM increasing within safe limits."
7. **Session completion** — show duration, average/final BPM, sync, cadence, improvement, timeline chart.
8. **AI summary** — read the generated summary aloud, emphasizing it's derived only from measured session data (no invented claims).

## Fallback: Demo Mode

If camera conditions are poor at the venue, switch to **Demo Mode**, which replays a prerecorded landmark stream / simulated movement events. This must be clearly labeled on-screen as "DEMO MODE" — never presented as live patient data.

## One-Minute Pitch (backup, if time is cut short)

> "Nuro-Beats turns any smartphone into an adaptive rehab coach for Parkinson's and stroke patients. It watches how someone moves, measures how well they're syncing to a therapeutic rhythm, and adjusts that rhythm live — all on-device, all within limits the doctor sets. No hospital visit, no special hardware, just a phone."

## Anticipated Judge Questions

- **"Is this AI actually deciding anything risky?"** → No: the therapy engine is deterministic and bounded by clinician-set limits; the LLM is only used for summaries and rhythm *style*, never for timing control.
- **"Where does the data go?"** → Raw video/audio never leaves the device; only aggregate metrics sync to the clinician.
- **"Is any of this reused from a prior project?"** → Be direct: the original concept and prototype were built earlier under a different team; this build substantially extends it with a new agent architecture, camera-based sensing, and clinician safety controls, with a new team this time.
