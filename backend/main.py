from pathlib import Path
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

from routes import invoice, rides, invoice_db, profile, auth, help

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
app.include_router(rides.router, prefix="/api/rides", tags=["Ride Planning"])
app.include_router(invoice_db.router, prefix="/api/invoice-db", tags=["Invoice Records"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(help.router, prefix="/api/help", tags=["Help"])


@app.get("/")
def health_check():
    return {"status": "CareConnect API is running"}
