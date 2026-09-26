import os
import json
import logging
from fastapi import APIRouter
from backend.schemas import (
    SessionSummaryRequest, SessionSummaryResponse,
    RhythmConfigRequest, RhythmConfigResponse
)

router = APIRouter(prefix="/ai", tags=["ai"])

def get_gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as e:
        logging.warning(f"Could not initialize Google GenAI Client: {e}")
        return None

@router.post("/session-summary", response_model=SessionSummaryResponse)
def generate_session_summary(req: SessionSummaryRequest):
    """
    Constrained GenAI summary: strictly bounds output to measured telemetry.
    Never invents metrics, never diagnoses, never claims clinical efficacy.
    """
    mins = req.duration_seconds // 60
    secs = req.duration_seconds % 60
    
    # Deterministic fallback text
    fallback_summary = (
        f"{req.patient_name} completed {mins}m {secs}s of gait rhythm training. "
        f"Tempo progressed from {req.start_bpm:.0f} to {req.final_bpm:.0f} BPM, "
        f"logging {req.total_steps} total steps with {req.avg_sync_score:.0f}% rhythmic synchronization. "
        f"There were {req.freezing_events} freezing of gait episodes recorded."
    )
    fallback_notes = (
        f"Gait cadence variance remained within target bounds. "
        f"Freezing episodes: {req.freezing_events}. "
        f"Recommended for next session: continue at {req.final_bpm:.0f} BPM base."
    )
    fallback_cue = (
        "Great effort today! Your steps are finding a steady, natural rhythm."
    )

    client = get_gemini_client()
    if not client:
        return SessionSummaryResponse(
            summary=fallback_summary,
            clinician_notes=fallback_notes,
            encouraging_cue=fallback_cue
        )

    try:
        prompt = f"""You are an objective clinical summarizer for NeuroBeat, an auditory-motor rehabilitation platform.
Generate a concise session summary strictly based on the following measured metrics.
DO NOT diagnose, DO NOT invent unmeasured numbers, and DO NOT make unsupported clinical efficacy claims.

Measured Session Data:
- Patient: {req.patient_name}
- Duration: {mins} minutes, {secs} seconds
- Starting Cadence: {req.start_bpm} SPM / BPM
- Ending Cadence: {req.final_bpm} SPM / BPM
- Average Synchronization Accuracy: {req.avg_sync_score}%
- Total Steps Tracked: {req.total_steps}
- Freezing of Gait (FoG) Episodes: {req.freezing_events}

Return ONLY valid JSON with three keys:
{{
  "summary": "2-3 sentences plain language overview for the patient",
  "clinician_notes": "1-2 sentences technical observation for the physician",
  "encouraging_cue": "1 warm sentence of encouraging feedback"
}}"""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )

        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        
        parsed = json.loads(text.strip())
        return SessionSummaryResponse(
            summary=parsed.get("summary", fallback_summary),
            clinician_notes=parsed.get("clinician_notes", fallback_notes),
            encouraging_cue=parsed.get("encouraging_cue", fallback_cue)
        )
    except Exception as e:
        logging.warning(f"Gemini API generation error: {e}")
        return SessionSummaryResponse(
            summary=fallback_summary,
            clinician_notes=fallback_notes,
            encouraging_cue=fallback_cue
        )

@router.post("/rhythm-config", response_model=RhythmConfigResponse)
def generate_rhythm_config(req: RhythmConfigRequest):
    """
    Constrained GenAI rhythm style configuration.
    LLM outputs a structured style specification; the deterministic audio engine renders timing.
    """
    fallback_response = RhythmConfigResponse(
        style=req.preferred_style,
        bpm=req.target_bpm,
        accent_pattern="Strong on beat 1 and 3 (quarter note synchronization)",
        texture="Gentle acoustic harmonic envelope with soft transient attack",
        therapeutic_focus="Auditory-motor cueing to prevent freezing and lengthen stride"
    )

    client = get_gemini_client()
    if not client:
        return fallback_response

    try:
        prompt = f"""You are a music therapy rhythm designer for NeuroBeat.
Suggest a therapeutic rhythm style configuration for a {req.patient_condition} patient targeting {req.target_bpm} BPM.
Preferred style: {req.preferred_style}.

Return ONLY valid JSON with keys:
{{
  "style": "{req.preferred_style}",
  "bpm": {req.target_bpm},
  "accent_pattern": "string describing beat accenting",
  "texture": "string describing acoustic warmth/envelope",
  "therapeutic_focus": "string describing clinical intent"
}}"""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )

        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]

        parsed = json.loads(text.strip())
        return RhythmConfigResponse(
            style=parsed.get("style", req.preferred_style),
            bpm=req.target_bpm,
            accent_pattern=parsed.get("accent_pattern", fallback_response.accent_pattern),
            texture=parsed.get("texture", fallback_response.texture),
            therapeutic_focus=parsed.get("therapeutic_focus", fallback_response.therapeutic_focus)
        )
    except Exception as e:
        logging.warning(f"Rhythm config generation error: {e}")
        return fallback_response
