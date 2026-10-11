
import logging
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


# --------------------------------------------------
# Paths and logging
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "Mental_Health_Model.pkl"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

model = joblib.load(MODEL_PATH)

TOP_COUNTRIES = {
    "India", "USA", "Canada", "Australia", "UK",
    "Germany", "Mexico", "Turkey", "France"
}

app = FastAPI(title="Mental Health Signal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static assets must be requested from /static/...
app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR)),
    name="static",
)


# --------------------------------------------------
# Request schema
# --------------------------------------------------

class StudentData(BaseModel):
    age: int = Field(..., ge=10, le=100)
    gender: Literal["Male", "Female"]
    country: str = Field(..., min_length=1)

    academic_level: Literal[
        "Undergraduate", "Graduate", "High School"
    ]

    most_used_platform: Literal[
        "Facebook", "LinkedIn", "Instagram", "Snapchat",
        "Twitter", "YouTube", "TikTok", "LINE",
        "KakaoTalk", "VKontakte", "WhatsApp", "WeChat"
    ]

    purpose_of_use: Literal[
        "Networking", "Education", "Entertainment", "News"
    ]

    avg_daily_usage_hours: float = Field(..., ge=0, le=24)
    daily_unlocks: int = Field(..., ge=0)
    study_hours: float = Field(..., ge=0, le=24)
    physical_activity_hours: float = Field(..., ge=0, le=24)
    sleep_hours_per_night: float = Field(..., ge=0, le=24)

    stress_level: Literal["Medium", "Low", "Very High", "High"]


class PredictionResponse(BaseModel):
    predicted_mental_health_score: float


# --------------------------------------------------
# Frontend
# --------------------------------------------------

@app.get("/")
def home():
    return FileResponse(BASE_DIR / "index.html")


# --------------------------------------------------
# Health check
# --------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


# --------------------------------------------------
# Prediction
# --------------------------------------------------

@app.post("/predict", response_model=PredictionResponse)
def predict(data: StudentData):
    try:
        country_group = (
            data.country
            if data.country in TOP_COUNTRIES
            else "Other"
        )

        input_row = pd.DataFrame([{
            "Age": data.age,
            "Gender": data.gender,
            "Country": data.country,
            "Academic_Level": data.academic_level,
            "Most_Used_Platform": data.most_used_platform,
            "Purpose_Of_Use": data.purpose_of_use,
            "Avg_Daily_Usage_Hours": data.avg_daily_usage_hours,
            "Daily_Unlocks": data.daily_unlocks,
            "Study_Hours": data.study_hours,
            "Physical_Activity_Hours": data.physical_activity_hours,
            "Sleep_Hours_Per_Night": data.sleep_hours_per_night,
            "Stress_Level": data.stress_level,
            "Grouped_Country": country_group,
        }])

        logger.info("Prediction requested.")
        logger.info("Input columns: %s", input_row.columns.tolist())

        prediction = model.predict(input_row)[0]
        score = round(float(prediction), 2)

        logger.info("Prediction completed: %s", score)

        return PredictionResponse(
            predicted_mental_health_score=score
        )

    except Exception as exc:
        # Full traceback appears in the PowerShell terminal.
        logger.exception("Prediction failed")

        # Useful for local debugging. Do not expose raw errors
        # to public users in a production deployment.
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {exc}",
        ) from exc
