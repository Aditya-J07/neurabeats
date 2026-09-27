"""
Historical Analysis Service for NeuroBeat Neurorehabilitation Platform.
Provides deterministic, lightweight longitudinal data processing:
1. Historical session retrieval (last 5-10 sessions per patient)
2. Deterministic trend analysis (accuracy trend, BPM trend, averages)
3. Advisory historical BPM recommendation (purely optional/advisory, never overwrites authoritative logic)
4. Contextual accuracy comparison
5. Isolated Prototype / Demonstration dataset (strictly separated from database records)
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

def get_patient_history(
    patient_id: int,
    activity_type: Optional[str] = None,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """
    Retrieve the most recent completed therapy sessions and clinical reports for a specific patient.
    Lightweight and capped to `limit` records (default 5, max 10) to maintain high performance.
    """
    try:
        from models import TherapySession, ClinicalReport
        from app import db

        # Query completed sessions for this specific patient
        query = TherapySession.query.filter(
            TherapySession.patient_id == patient_id,
            TherapySession.completed == True
        )

        # Normalize activity_type if provided
        if activity_type:
            clean_activity = activity_type.strip().lower()
            # Handle potential underscore/space variations
            query = query.filter(
                (TherapySession.session_type == clean_activity) |
                (TherapySession.session_type == clean_activity.replace(' ', '_'))
            )

        # Order by newest first, capped to limit (max 10)
        safe_limit = max(1, min(10, limit))
        recent_sessions = query.order_by(TherapySession.end_time.desc()).limit(safe_limit).all()

        history = []
        for s in recent_sessions:
            # Check for linked clinical report
            report = ClinicalReport.query.filter_by(session_id=s.id).first()
            avg_bpm = round((s.initial_bpm + s.final_bpm) / 2.0, 1) if (s.initial_bpm and s.final_bpm) else (s.final_bpm or s.initial_bpm or 60.0)

            history.append({
                "session_id": s.id,
                "activity": s.session_type.replace('_', ' ').title() if s.session_type else "General Therapy",
                "session_type": s.session_type,
                "activity_type": s.session_type,
                "date": s.end_time.strftime("%Y-%m-%d %H:%M") if s.end_time else (s.start_time.strftime("%Y-%m-%d %H:%M") if s.start_time else "Recent"),
                "duration_seconds": s.duration_seconds or 0,
                "accuracy": round(s.accuracy_score, 1) if s.accuracy_score is not None else None,
                "accuracy_score": round(s.accuracy_score, 1) if s.accuracy_score is not None else None,
                "starting_bpm": round(s.initial_bpm, 1) if s.initial_bpm is not None else 60.0,
                "initial_bpm": round(s.initial_bpm, 1) if s.initial_bpm is not None else 60.0,
                "final_bpm": round(s.final_bpm, 1) if s.final_bpm is not None else (s.initial_bpm or 60.0),
                "average_bpm": avg_bpm,
                "target_bpm": round(s.target_bpm, 1) if s.target_bpm is not None else 70.0,
                "movement_count": report.movement_count if (report and report.movement_count) else 0,
                "report_summary": report.summary if report else None
            })

        return history

    except Exception as e:
        logging.error(f"[historical_analysis] Error fetching patient history for patient_id={patient_id}: {str(e)}", exc_info=True)
        return []

def calculate_historical_trends(sessions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate simple, deterministic trends across historical sessions without external AI dependencies.
    Transparent, verifiable, and fast (<1ms).
    """
    if not sessions:
        return {
            "number_of_previous_sessions": 0,
            "average_previous_accuracy": None,
            "recent_average_accuracy": None,
            "recent_best_accuracy": None,
            "accuracy_trend": "insufficient_data",
            "average_previous_bpm": None,
            "recent_best_bpm": None,
            "bpm_trend": "insufficient_data",
            "previous_successful_bpm_range": None
        }

    total_sessions = len(sessions)
    
    # 1. Accuracy calculations (safe against both 'accuracy' and 'accuracy_score' keys)
    raw_accs = [
        s.get("accuracy") if s.get("accuracy") is not None else s.get("accuracy_score")
        for s in sessions
    ]
    valid_accuracies = [a for a in raw_accs if a is not None]
    if valid_accuracies:
        avg_acc = round(sum(valid_accuracies) / len(valid_accuracies), 1)
        best_acc = round(max(valid_accuracies), 1)
        # Recent average: up to the last 3 sessions (sessions are ordered newest-first)
        recent_3 = valid_accuracies[:3]
        recent_avg_acc = round(sum(recent_3) / len(recent_3), 1)
    else:
        avg_acc = None
        best_acc = None
        recent_avg_acc = None

    # Trend detection (chronological: compare older vs newer)
    if len(valid_accuracies) >= 2:
        # Note: sessions are newest first. Reverse to get chronological order
        chronological_accs = list(reversed(valid_accuracies))
        first_half = chronological_accs[:len(chronological_accs)//2 or 1]
        second_half = chronological_accs[len(chronological_accs)//2:]
        avg_first = sum(first_half) / len(first_half)
        avg_second = sum(second_half) / len(second_half)

        if (avg_second - avg_first) >= 3.0:
            accuracy_trend = "improving"
        elif (avg_first - avg_second) >= 3.0:
            accuracy_trend = "declining"
        else:
            accuracy_trend = "stable"
    elif len(valid_accuracies) == 1:
        accuracy_trend = "stable"
    else:
        accuracy_trend = "insufficient_data"

    # 2. BPM calculations
    valid_bpms = [s["final_bpm"] for s in sessions if s["final_bpm"] is not None]
    if valid_bpms:
        avg_bpm = round(sum(valid_bpms) / len(valid_bpms), 1)
        best_bpm = round(max(valid_bpms), 1)
        min_bpm = round(min(valid_bpms), 1)
        bpm_range_str = f"{int(min_bpm)}–{int(best_bpm)}" if min_bpm != best_bpm else f"{int(min_bpm)}"
    else:
        avg_bpm = None
        best_bpm = None
        bpm_range_str = None

    if len(valid_bpms) >= 2:
        chronological_bpms = list(reversed(valid_bpms))
        if chronological_bpms[-1] > chronological_bpms[0] + 2:
            bpm_trend = "progressing"
        elif chronological_bpms[0] > chronological_bpms[-1] + 2:
            bpm_trend = "decreasing"
        else:
            bpm_trend = "stable"
    elif len(valid_bpms) == 1:
        bpm_trend = "stable"
    else:
        bpm_trend = "insufficient_data"

    return {
        "number_of_previous_sessions": total_sessions,
        "average_previous_accuracy": avg_acc,
        "recent_average_accuracy": recent_avg_acc,
        "recent_best_accuracy": best_acc,
        "accuracy_trend": accuracy_trend,
        "average_previous_bpm": avg_bpm,
        "recent_best_bpm": best_bpm,
        "bpm_trend": bpm_trend,
        "previous_successful_bpm_range": bpm_range_str
    }

def calculate_recommended_bpm(
    patient_profile: Any,
    activity_type: str,
    trends: Dict[str, Any],
    current_target_bpm: float = 70.0,
    current_initial_bpm: float = 60.0
) -> Dict[str, Any]:
    """
    Produce an OPTIONAL advisory BPM recommendation based on previous performance.
    IMPORTANT: This recommendation is purely advisory and NEVER automatically overwrites
    authoritative baseline calculations unless explicitly activated.
    """
    count = trends.get("number_of_previous_sessions", 0)
    recent_acc = trends.get("recent_average_accuracy")
    avg_bpm = trends.get("average_previous_bpm") or current_initial_bpm
    trend = trends.get("accuracy_trend", "stable")

    # If insufficient history, recommend starting at existing authoritative baseline
    if count == 0 or recent_acc is None:
        return {
            "historical_recommended_bpm": round(current_initial_bpm, 1),
            "rationale": "Initial baseline recommendation based on clinical intake profile.",
            "is_advisory": True
        }

    # Clinical pacing logic:
    # 1. High accuracy (>80%) and improving -> gradual +2 BPM increase towards target
    if recent_acc >= 80.0 and trend in ["improving", "stable"]:
        recommended = min(float(current_target_bpm), avg_bpm + 2.0)
        rationale = f"Patient demonstrated strong rhythm synchronization ({recent_acc}%). Gradual +2 BPM progression recommended."
    # 2. Low accuracy (<60%) -> maintain safe baseline or gentle -2 BPM to rebuild regularity
    elif recent_acc < 60.0:
        recommended = max(current_initial_bpm * 0.85, avg_bpm - 2.0)
        rationale = f"Recent accuracy ({recent_acc}%) suggests fatigue or difficulty matching tempo. Consolidating cadence at safe tempo."
    # 3. Stable performance (60-80%) -> hold steady at historical average
    else:
        recommended = avg_bpm
        rationale = f"Stable performance ({recent_acc}%). Consolidating motor rhythm entrainment at current cadence."

    # Safety clamps
    is_speech = activity_type in ["speech_rhythm", "speech_therapy"]
    if is_speech:
        clamped_recommended = max(60.0, min(180.0, recommended))
    else:
        clamped_recommended = max(40.0, min(200.0, recommended))

    return {
        "historical_recommended_bpm": round(clamped_recommended, 1),
        "historical_average_bpm": avg_bpm,
        "historical_average_accuracy": recent_acc,
        "rationale": rationale,
        "is_advisory": True
    }

def build_accuracy_comparison(
    current_accuracy: Optional[float],
    trends: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Build a safe, objective comparison between current session accuracy and historical performance.
    Never alters the raw current_accuracy recorded by the sensors.
    """
    if current_accuracy is None:
        return {
            "current_accuracy": None,
            "historical_average_accuracy": trends.get("average_previous_accuracy"),
            "historical_trend": trends.get("accuracy_trend", "insufficient_data"),
            "accuracy_delta": None,
            "status": "No real-time accuracy captured for current session."
        }

    hist_avg = trends.get("average_previous_accuracy")
    if hist_avg is not None:
        delta = round(current_accuracy - hist_avg, 1)
        delta_str = f"+{delta}%" if delta > 0 else f"{delta}%"
    else:
        delta = None
        delta_str = "Baseline session"

    return {
        "current_accuracy": round(current_accuracy, 1),
        "historical_average_accuracy": hist_avg,
        "accuracy_delta": delta_str,
        "historical_trend": trends.get("accuracy_trend", "stable")
    }

def get_demo_historical_context(activity_type: str = "Gait Trainer") -> Dict[str, Any]:
    """
    Feature 7: DEMONSTRATION / PROTOTYPE MODE.
    Provides a small, clean synthetic dataset to demonstrate longitudinal learning
    without fabricating real clinical records or inserting anything into the real database.
    """
    synthetic_sessions = [
        {
            "session_id": "DEMO-004",
            "activity": activity_type,
            "session_type": activity_type.lower().replace(' ', '_'),
            "date": "Demo Progression 3",
            "duration_seconds": 200,
            "accuracy": 80.0,
            "starting_bpm": 59.0,
            "final_bpm": 61.0,
            "average_bpm": 60.0,
            "target_bpm": 65.0,
            "movement_count": 202,
            "report_summary": "Strong synchronization achieved across target cadence."
        },
        {
            "session_id": "DEMO-003",
            "activity": activity_type,
            "session_type": activity_type.lower().replace(' ', '_'),
            "date": "Demo Progression 2",
            "duration_seconds": 180,
            "accuracy": 76.0,
            "starting_bpm": 57.0,
            "final_bpm": 59.0,
            "average_bpm": 58.0,
            "target_bpm": 65.0,
            "movement_count": 174,
            "report_summary": "Auditory following stabilized with higher rhythm alignment."
        },
        {
            "session_id": "DEMO-002",
            "activity": activity_type,
            "session_type": activity_type.lower().replace(' ', '_'),
            "date": "Demo Progression 1",
            "duration_seconds": 150,
            "accuracy": 72.0,
            "starting_bpm": 55.0,
            "final_bpm": 57.0,
            "average_bpm": 56.0,
            "target_bpm": 65.0,
            "movement_count": 142,
            "report_summary": "Improved step consistency noted during middle interval."
        },
        {
            "session_id": "DEMO-001",
            "activity": activity_type,
            "session_type": activity_type.lower().replace(' ', '_'),
            "date": "Demo Baseline",
            "duration_seconds": 120,
            "accuracy": 68.0,
            "starting_bpm": 55.0,
            "final_bpm": 55.0,
            "average_bpm": 55.0,
            "target_bpm": 65.0,
            "movement_count": 110,
            "report_summary": "Initial baseline entrainment established."
        }
    ]

    trends = calculate_historical_trends(synthetic_sessions)
    recommended = {
        "historical_recommended_bpm": 63.0,
        "historical_average_bpm": 57.2,
        "historical_average_accuracy": 74.0,
        "rationale": "Prototype demo shows an improving trajectory from 68% to 80% accuracy. Progression to 63 BPM recommended.",
        "is_advisory": True
    }

    return {
        "is_demo": True,
        "mode": "PROTOTYPE_DEMONSTRATION",
        "patient_id": "DEMO_PATIENT",
        "activity": activity_type,
        "previous_sessions": synthetic_sessions,
        "trends": trends,
        "recommended_bpm": recommended,
        "note": "Demonstration mode only. This synthetic data is never saved to the medical database."
    }

def build_historical_context(
    patient_id: int,
    activity_type: Optional[str] = None,
    limit: int = 5,
    allow_demo_fallback: bool = False,
    current_target_bpm: float = 70.0,
    current_initial_bpm: float = 60.0
) -> Dict[str, Any]:
    """
    Unified entry point to construct a compact historical context object for a patient.
    Safely fallbacks to empty/demo context if patient is brand new.
    """
    # 1. Fetch real sessions
    real_sessions = get_patient_history(patient_id=patient_id, activity_type=activity_type, limit=limit)

    # 2. Check if we should use demo fallback (strictly when real history is empty AND explicitly requested)
    if not real_sessions and allow_demo_fallback:
        return get_demo_historical_context(activity_type=activity_type or "Gait Trainer")

    # 3. Calculate deterministic trends
    trends = calculate_historical_trends(real_sessions)

    # 4. Calculate advisory recommended BPM
    recommendation = calculate_recommended_bpm(
        patient_profile=None,
        activity_type=activity_type or "gait_trainer",
        trends=trends,
        current_target_bpm=current_target_bpm,
        current_initial_bpm=current_initial_bpm
    )

    # 5. Assemble compact historical context
    activity_name = activity_type.replace('_', ' ').title() if activity_type else "General Therapy"
    return {
        "is_demo": False,
        "patient_id": patient_id,
        "activity": activity_name,
        "previous_sessions_count": len(real_sessions),
        "previous_sessions": real_sessions,
        "trends": trends,
        "recommended_bpm": recommendation
    }


def format_historical_context_for_prompt(patient_id: int, activity_type: Optional[str] = None) -> str:
    """
    Format previous session metrics into a concise clinical prompt string
    for Gemini AI SOAP and report generation.
    """
    from models import TherapySession
    history = get_patient_history(patient_id=patient_id, activity_type=activity_type, limit=5)
    if not history:
        return "Patient has no recorded previous sessions for this activity. This is their baseline evaluation."

    trends = calculate_historical_trends(history)
    trend = trends.get("accuracy_trend", "stable")
    avg_acc = trends.get("average_previous_accuracy", 75.0)

    accuracies = [f"{s['accuracy']}%" for s in reversed(history) if s.get('accuracy') is not None]
    if not accuracies:
        accuracies = ["N/A"]

    last_s = history[0]
    context = (
        f"PATIENT RECENT HISTORY ({len(history)} sessions) for Patient #{patient_id} ({last_s.get('activity', 'Therapy')}):\n"
        f"- Total completed previous sessions: {len(history)}\n"
        f"- Historical Average Accuracy: {avg_acc}%\n"
        f"- Recent Accuracies (chronological): {' -> '.join(accuracies)}\n"
        f"- Overall Longitudinal Trend: {trend.upper()}\n"
        f"- Last Session Target: {last_s.get('final_bpm', 60)} BPM with {last_s.get('accuracy', 75)}% accuracy\n"
        f"Ensure clinical report reflects whether patient is showing entrainment progress over time."
    )
    return context


def save_or_update_clinical_report(
    session_id: int,
    report_dict: Dict[str, Any]
):
    """
    Structured Report Storage with Idempotency.
    Updates existing row if session already has a report, otherwise creates a new one.
    """
    import json
    from app import db
    from models import TherapySession, ClinicalReport

    ts = db.session.get(TherapySession, session_id) if hasattr(db.session, 'get') else TherapySession.query.get(session_id)
    if not ts:
        raise ValueError(f"TherapySession #{session_id} not found.")

    report = ClinicalReport.query.filter_by(session_id=session_id).first()
    if not report:
        report = ClinicalReport(
            session_id=session_id,
            patient_id=ts.patient_id
        )
        db.session.add(report)

    # Populate quantitative session data
    report.activity_type = ts.session_type
    report.duration_seconds = ts.duration_seconds or 0
    report.initial_bpm = ts.initial_bpm
    report.final_bpm = ts.final_bpm or ts.initial_bpm
    report.target_bpm = ts.target_bpm
    report.accuracy_score = ts.accuracy_score or 0.0
    report.movement_count = int(report_dict.get("movement_count", getattr(ts, 'total_steps', 0) or 0))

    def _to_json_or_text(val):
        if isinstance(val, (list, dict)):
            return json.dumps(val)
        return str(val) if val is not None else ""

    report.summary = _to_json_or_text(report_dict.get("summary", ""))
    report.what_you_did = _to_json_or_text(report_dict.get("what_you_did", []))
    report.performance_observations = _to_json_or_text(report_dict.get("performance_observations", []))
    report.what_to_improve = _to_json_or_text(report_dict.get("what_to_improve", []))
    report.recommendations = _to_json_or_text(report_dict.get("recommendations", []))

    # SOAP documentation
    soap = report_dict.get("soap") or {}
    report.soap_subjective = str(soap.get("subjective", ""))
    report.soap_objective = str(soap.get("objective", f"Completed {report.duration_seconds}s at {report.final_bpm} BPM with {report.accuracy_score}% accuracy."))
    report.soap_assessment = str(soap.get("assessment", ""))
    report.soap_plan = str(soap.get("plan", ""))

    report.ai_model = str(report_dict.get("ai_model", "gemini-3.5-flash-lite"))
    report.created_at = datetime.utcnow()

    db.session.commit()
    return report


def get_mock_trajectory_for_demo() -> List[Dict[str, Any]]:
    """
    Prototype Demo Mode: Returns 4 synthetic sessions showing positive trajectory (68% -> 80% accuracy)
    with zero database writes.
    """
    return [
        {"session_id": 901, "activity_type": "gait_trainer", "accuracy_score": 68.0, "final_bpm": 58.0, "date": "2026-09-20"},
        {"session_id": 902, "activity_type": "gait_trainer", "accuracy_score": 72.0, "final_bpm": 60.0, "date": "2026-09-22"},
        {"session_id": 903, "activity_type": "gait_trainer", "accuracy_score": 77.0, "final_bpm": 62.0, "date": "2026-09-24"},
        {"session_id": 904, "activity_type": "gait_trainer", "accuracy_score": 81.5, "final_bpm": 64.0, "date": "2026-09-26"}
    ]


def compute_accuracy_trend(history: List[Dict[str, Any]]) -> str:
    """
    Deterministic Trend Analysis.
    Compares recent session accuracies against older baseline:
    - 'improving' if recent average > baseline average + 2.0%
    - 'declining' if recent average < baseline average - 2.0%
    - 'stable' otherwise
    """
    if len(history) < 2:
        return "stable"

    accuracies = [
        h.get("accuracy_score") if h.get("accuracy_score") is not None else h.get("accuracy")
        for h in history
    ]
    accuracies = [a for a in accuracies if a is not None]
    if len(accuracies) < 2:
        return "stable"

    # Reverse to chronological order (oldest to newest)
    chronological = list(reversed(accuracies))
    midpoint = len(chronological) // 2

    baseline_avg = sum(chronological[:midpoint]) / max(1, len(chronological[:midpoint]))
    recent_avg = sum(chronological[midpoint:]) / max(1, len(chronological[midpoint:]))

    diff = recent_avg - baseline_avg
    if diff > 2.0:
        return "improving"
    elif diff < -2.0:
        return "declining"
    return "stable"


def calculate_advisory_bpm(
    current_bpm: float,
    accuracy_score: float,
    trend: str,
    min_bpm: float = 40.0,
    max_bpm: float = 140.0
) -> float:
    """
    Advisory Recommended BPM for next session.
    Safe, advisory pacing recommendation:
    - High accuracy (>= 85%) & improving: +3 BPM
    - High accuracy (>= 80%): +2 BPM
    - Low accuracy (< 60%): -3 BPM
    - Low accuracy (< 70%) & declining: -2 BPM
    - Clamped strictly within [min_bpm, max_bpm]
    """
    base_bpm = float(current_bpm)

    if accuracy_score >= 85.0 and trend == "improving":
        delta = 3.0
    elif accuracy_score >= 80.0:
        delta = 2.0
    elif accuracy_score < 60.0:
        delta = -3.0
    elif accuracy_score < 70.0 and trend == "declining":
        delta = -2.0
    else:
        delta = 0.0

    advisory = base_bpm + delta
    return max(min_bpm, min(max_bpm, advisory))


def calculate_accuracy_delta(
    current_accuracy: float,
    history: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Contextual Accuracy Comparison.
    Computes difference between current accuracy and historical average.
    """
    if not history:
        return {
            "historical_average": current_accuracy,
            "delta": 0.0,
            "text": "First session on record"
        }

    valid_scores = [
        h.get("accuracy_score") if h.get("accuracy_score") is not None else h.get("accuracy")
        for h in history
    ]
    valid_scores = [s for s in valid_scores if s is not None]
    if not valid_scores:
        avg_score = current_accuracy
    else:
        avg_score = sum(valid_scores) / len(valid_scores)

    delta = current_accuracy - avg_score
    sign = "+" if delta >= 0 else ""
    return {
        "historical_average": round(avg_score, 1),
        "delta": round(delta, 1),
        "text": f"{sign}{delta:.1f}% vs historical average ({avg_score:.1f}%)"
    }


