from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import User, PatientProfile
from backend.schemas import LoginRequest, AuthResponse, UserSchema

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=AuthResponse)
def login(creds: LoginRequest, db: Session = Depends(get_db)):
    # Find user
    user = db.query(User).filter(User.username == creds.username).first()
    
    # If not found or demo login, provide demo user seamlessly
    if not user:
        if creds.username in ["arthur", "patient", "demo"]:
            user = User(
                username=creds.username,
                email=f"{creds.username}@example.com",
                hashed_password="hashed_demo_password",
                role="patient",
                full_name="Arthur Pendelton"
            )
            db.add(user)
            db.flush()

            patient_profile = PatientProfile(
                user_id=user.id,
                condition="parkinsons",
                baseline_cadence=44.0,
                target_cadence=54.0,
                min_safe_bpm=45.0,
                max_safe_bpm=72.0,
                max_duration_mins=15,
                freezing_tolerance=2
            )
            db.add(patient_profile)
            db.commit()
            db.refresh(user)
        elif creds.username in ["drsharma", "clinician"]:
            user = User(
                username=creds.username,
                email="dr.sharma@hospital.org",
                hashed_password="hashed_demo_password",
                role="clinician",
                full_name="Dr. Sarah Sharma, MD"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": True, "code": "INVALID_CREDENTIALS", "message": "Invalid username or password"}
            )

    patient_id = None
    if user.patient_profile:
        patient_id = user.patient_profile.id

    # Simulated JWT token
    token = f"nurobeats_token_{user.id}_{user.role}"

    return AuthResponse(
        token=token,
        user=UserSchema.from_orm(user),
        patient_id=patient_id
    )
