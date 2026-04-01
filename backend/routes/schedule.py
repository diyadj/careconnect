import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()

# Store the schedule in a simple JSON file for the prototype
# In production you would swap this for a database or Google Sheets
SCHEDULE_FILE = os.path.join(os.path.dirname(__file__), "../data/schedule.json")


def read_schedule() -> dict:
    if not os.path.exists(SCHEDULE_FILE):
        return {}
    with open(SCHEDULE_FILE, "r") as f:
        return json.load(f)


def write_schedule(data: dict):
    os.makedirs(os.path.dirname(SCHEDULE_FILE), exist_ok=True)
    with open(SCHEDULE_FILE, "w") as f:
        json.dump(data, f, indent=2)


class ScheduleSetupRequest(BaseModel):
    year: int
    regular_days: List[str]       # e.g. ["Monday", "Tuesday", "Wednesday"]
    closure_weeks: Optional[List[str]] = []  # e.g. ["2026-08-03", "2026-12-21"]
    notes: Optional[str] = ""


class ScheduleUpdateRequest(BaseModel):
    year: int
    closure_weeks: Optional[List[str]] = None
    regular_days: Optional[List[str]] = None
    notes: Optional[str] = None


class ScheduleSendRequest(BaseModel):
    year: int


class ScheduleResetRequest(BaseModel):
    year: Optional[int] = None


@router.post("/setup")
def setup_annual_schedule(request: ScheduleSetupRequest):
    """
    Called once at the start of the year (Phase 1).
    Saves the father's approved annual transport schedule.
    """
    schedule = read_schedule()

    schedule[str(request.year)] = {
        "year": request.year,
        "regular_days": request.regular_days,
        "closure_weeks": request.closure_weeks,
        "notes": request.notes,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }

    write_schedule(schedule)

    return {
        "status": "saved",
        "year": request.year,
        "regular_days": request.regular_days,
        "closure_weeks": request.closure_weeks,
        "message": f"Annual schedule for {request.year} saved successfully."
    }


@router.get("/current")
def get_current_schedule(year: Optional[int] = None):
    """
    Returns the saved schedule for a given year.
    Defaults to the current year if no year is provided.
    """
    target_year = str(year) if year else str(datetime.now().year)
    schedule = read_schedule()

    if target_year not in schedule:
        raise HTTPException(
            status_code=404,
            detail=f"No schedule found for {target_year}. Please set it up first."
        )

    return schedule[target_year]


@router.patch("/update")
def update_schedule(request: ScheduleUpdateRequest):
    """
    Updates an existing schedule - add closure weeks mid-year
    or correct the regular days without setting up from scratch.
    """
    schedule = read_schedule()
    year_key = str(request.year)

    if year_key not in schedule:
        raise HTTPException(
            status_code=404,
            detail=f"No schedule found for {request.year}. Use /setup first."
        )

    if request.regular_days is not None:
        schedule[year_key]["regular_days"] = request.regular_days
    if request.closure_weeks is not None:
        schedule[year_key]["closure_weeks"] = request.closure_weeks
    if request.notes is not None:
        schedule[year_key]["notes"] = request.notes

    schedule[year_key]["updated_at"] = datetime.now().isoformat()

    write_schedule(schedule)

    return {
        "status": "updated",
        "schedule": schedule[year_key]
    }


@router.post("/send")
def send_schedule_pdf(request: ScheduleSendRequest):
    """
    Mock endpoint for sending the saved schedule PDF to taxi company by email.
    """
    schedule = read_schedule()
    year_key = str(request.year)

    if year_key not in schedule:
        raise HTTPException(
            status_code=404,
            detail=f"No schedule found for {request.year}. Save it first before sending."
        )

    # TODO: Enable actual email sending via email agent/API after configuration.
    # from agents.email_agent import send_schedule_pdf_email
    # send_schedule_pdf_email(schedule=schedule[year_key], recipient="tixi_taxi_company@example.com")

    return {
        "status": "sent",
        "year": request.year,
        "message": "Email has been sent."
    }


@router.post("/reset")
def reset_schedule(request: ScheduleResetRequest):
    """
    Delete an annual schedule so the demo can start from a clean slate.
    Defaults to the current year when year is not provided.
    """
    target_year = str(request.year) if request.year else str(datetime.now().year)
    schedule = read_schedule()

    if target_year not in schedule:
        raise HTTPException(
            status_code=404,
            detail=f"No schedule found for {target_year}. Nothing to reset."
        )

    del schedule[target_year]
    write_schedule(schedule)

    return {
        "status": "reset",
        "year": int(target_year),
        "message": f"Schedule for {target_year} has been reset."
    }
