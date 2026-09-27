from fastapi import APIRouter
from backend.schemas import AdaptationRecommendationRequest, AdaptationRecommendationResponse

router = APIRouter(prefix="/adaptation", tags=["adaptation"])

@router.post("/recommendation", response_model=AdaptationRecommendationResponse)
def get_adaptation_recommendation(req: AdaptationRecommendationRequest):
    """
    Personalization / Adaptation recommendation engine.
    Calculates next-session progression based on measured sync history and baseline.
    """
    scores = req.recent_sync_scores or [88.0, 91.0, 94.0]
    avg_score = sum(scores) / len(scores)

    # Progression logic
    if avg_score >= 90.0:
        recommended_bpm = min(req.current_bpm + 2.0, req.baseline_cadence * 1.25)
        difficulty = "Challenging (Cadence Lift)"
        rationale = f"Consistently high entrainment ({avg_score:.1f}% avg). Recommending gradual +2 BPM cadence lift."
    elif avg_score >= 80.0:
        recommended_bpm = min(req.current_bpm + 1.0, req.baseline_cadence * 1.2)
        difficulty = "Moderate (Consolidation)"
        rationale = f"Stable synchronization ({avg_score:.1f}% avg). Recommending +1 BPM to consolidate gait stability."
    else:
        recommended_bpm = max(req.current_bpm - 1.0, req.baseline_cadence)
        difficulty = "Gentle (Fatigue Protection)"
        rationale = f"Sync score below target threshold ({avg_score:.1f}% avg). Recommending slight ease in tempo."

    return AdaptationRecommendationResponse(
        recommended_bpm=round(recommended_bpm, 1),
        recommended_difficulty=difficulty,
        target_cadence=round(req.baseline_cadence * 1.15, 1),
        rationale=rationale
    )
