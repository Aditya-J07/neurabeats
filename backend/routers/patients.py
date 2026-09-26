from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import PatientProfile, TherapySession, User
from backend.schemas import PatientProfileSchema, BaselineSchema, TherapySessionSchema, SafetyEnvelopeUpdate

router = APIRouter(prefix="/patients", tags=["patients"])

@router.get("/{patient_id}", response_model=PatientProfileSchema)
def get_patient(patient_id: int, db: Session = Depends(get_db)):
    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    if not profile:
        # Check if user exists and create default profile
        user = db.query(User).filter(User.id == patient_id).first()
        if user and user.role == "patient":
            profile = PatientProfile(
                user_id=user.id,
                condition="parkinsons",
                baseline_cadence=44.0,
                target_cadence=54.0,
                min_safe_bpm=45.0,
                max_safe_bpm=72.0
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": True, "code": "PATIENT_NOT_FOUND", "message": f"Patient with ID {patient_id} not found"}
            )

    resp = PatientProfileSchema.from_orm(profile)
    if profile.user:
        resp.full_name = profile.user.full_name
    return resp

@router.patch("/{patient_id}/safety", response_model=PatientProfileSchema)
def update_safety_envelope(patient_id: int, update: SafetyEnvelopeUpdate, db: Session = Depends(get_db)):
    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": True, "code": "PATIENT_NOT_FOUND", "message": "Patient not found"}
        )

    if update.min_safe_bpm is not None:
        profile.min_safe_bpm = update.min_safe_bpm
    if update.max_safe_bpm is not None:
        profile.max_safe_bpm = update.max_safe_bpm
    if update.max_duration_mins is not None:
        profile.max_duration_mins = update.max_duration_mins
    if update.freezing_tolerance is not None:
        profile.freezing_tolerance = update.freezing_tolerance

    db.commit()
    db.refresh(profile)

    resp = PatientProfileSchema.from_orm(profile)
    if profile.user:
        resp.full_name = profile.user.full_name
    return resp

@router.get("/{patient_id}/baseline", response_model=BaselineSchema)
def get_patient_baseline(patient_id: int, db: Session = Depends(get_db)):
    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": True, "code": "PATIENT_NOT_FOUND", "message": "Patient not found"}
        )

    return BaselineSchema(
        baseline_cadence=profile.baseline_cadence,
        target_cadence=profile.target_cadence,
        recommended_start_bpm=profile.baseline_cadence + 2.0
    )

@router.get("/{patient_id}/sessions", response_model=List[TherapySessionSchema])
def get_patient_sessions(patient_id: int, db: Session = Depends(get_db)):
    sessions = db.query(TherapySession).filter(TherapySession.patient_id == patient_id).order_by(TherapySession.start_time.desc()).all()
    return [TherapySessionSchema.from_orm(s) for s in sessions]

@router.get("/{patient_id}/progress")
def get_patient_progress(patient_id: int, db: Session = Depends(get_db)):
    profile = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": True, "code": "PATIENT_NOT_FOUND", "message": "Patient not found"}
        )

    sessions = db.query(TherapySession).filter(
        TherapySession.patient_id == patient_id,
        TherapySession.status == "completed"
    ).order_by(TherapySession.start_time.asc()).all()

    timeline = []
    for s in sessions:
        timeline.append({
            "date": s.start_time.strftime("%Y-%m-%d"),
            "initial_bpm": s.initial_bpm,
            "final_bpm": s.final_bpm,
            "avg_sync_score": s.avg_sync_score,
            "duration_minutes": round(s.duration_seconds / 60, 1),
            "freezing_events": s.freezing_events_count
        })

    return {
        "patient_id": patient_id,
        "baseline_cadence": profile.baseline_cadence,
        "target_cadence": profile.target_cadence,
        "current_cadence": timeline[-1]["final_bpm"] if timeline else profile.baseline_cadence,
        "total_sessions": len(sessions),
        "timeline": timeline
    }
