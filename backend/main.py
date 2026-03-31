from pathlib import Path
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

from routes import invoice, mileage, schedule

app = FastAPI(title="CareConnect API", version="1.0.0")

# Allow requests from the React frontend during development
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
)
allowed_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(invoice.router, prefix="/api/invoice", tags=["Invoice Agent"])
app.include_router(mileage.router, prefix="/api/mileage", tags=["Mileage Agent"])
app.include_router(schedule.router, prefix="/api/schedule", tags=["Annual Schedule"])


@app.get("/")
def health_check():
    return {"status": "CareConnect API is running"}
