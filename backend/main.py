import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import engine, Base, SessionLocal
from backend.models import User, PatientProfile, TherapySession, BaselineAssessment
from backend.routers import auth, patients, sessions, ai, adaptation

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    Base.metadata.create_all(bind=engine)
    
    # Seed default sample data if empty
    db = SessionLocal()
    try:
        existing_user = db.query(User).filter(User.username == "arthur").first()
        if not existing_user:
            # Create Arthur Pendelton (Patient)
            arthur = User(
                username="arthur",
                email="arthur.pendelton@example.com",
                hashed_password="demo_hashed_password",
                role="patient",
                full_name="Arthur Pendelton"
            )
            db.add(arthur)
            db.flush()

            arthur_profile = PatientProfile(
                user_id=arthur.id,
                condition="parkinsons",
                baseline_cadence=44.0,
                target_cadence=54.0,
                min_safe_bpm=45.0,
                max_safe_bpm=72.0,
                max_duration_mins=15,
                freezing_tolerance=2
            )
            db.add(arthur_profile)
            db.flush()

            # Seed past session for Arthur
            past_session = TherapySession(
                patient_id=arthur_profile.id,
                session_type="gait",
                status="completed",
                initial_bpm=50.0,
                final_bpm=54.0,
                target_bpm=54.0,
                duration_seconds=860,
                avg_sync_score=94.2,
                total_steps=412,
                freezing_events_count=0,
                ai_summary="Arthur completed 14m 20s of gait rhythm training. Tempo progressed from 50 to 54 BPM with 94% rhythmic synchronization."
            )
            db.add(past_session)

            # Create Dr. Sarah Sharma (Clinician)
            dr_sharma = User(
                username="drsharma",
                email="dr.sharma@hospital.org",
                hashed_password="demo_hashed_password",
                role="clinician",
                full_name="Dr. Sarah Sharma, MD"
            )
            db.add(dr_sharma)

            db.commit()
    finally:
        db.close()

    yield

app = FastAPI(
    title="Nuro-Beats API",
    description="Adaptive Neurorehabilitation Backend API (Agentic AI for Billions)",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(sessions.router)
app.include_router(ai.router)
app.include_router(adaptation.router)

@app.get("/")
def root():
    return {
        "app": "Nuro-Beats API",
        "status": "online",
        "track": "Agentic AI for Billions",
        "team": "String Coders"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
