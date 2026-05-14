import os
import json
import uuid
import asyncio
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from typing import Annotated, Optional
from datetime import datetime

from .invoice import (
    get_auth_headers,
    get_runs_endpoint,
    wait_for_run_completion,
    WXO_API_KEY,
    WXO_INSTANCE_ID,
)
from .profile import read_profile

WXO_EMAIL_AGENT_ID = os.getenv("WXO_EMAIL_AGENT_ID")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER")

# Hardcoded cancellation destination requested by product owner.
TIXI_CANCELLATION_NUMBER = "+41795106281"

router = APIRouter()

RIDES_FILE = os.path.join(os.path.dirname(__file__), "../data/rides.json")

VALID_RIDE_TYPES = {"tixitaxi", "public_transport", "private_car", "other", ""}


# ---------- persistence helpers ----------

def read_rides() -> dict:
    if not os.path.exists(RIDES_FILE):
        return {}
    with open(RIDES_FILE, "r") as f:
        return json.load(f)


def write_rides(data: dict):
    os.makedirs(os.path.dirname(RIDES_FILE), exist_ok=True)
    with open(RIDES_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ---------- models ----------

class RideCreate(BaseModel):
    date: str
    time: str
    origin: str
    destination: str
    appointment_type: Optional[str] = ""
    ride_type: Optional[str] = ""
    kilometers_driven: Optional[float] = None
    notes: Optional[str] = ""
    year: Optional[int] = None


class RideUpdate(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    appointment_type: Optional[str] = None
    ride_type: Optional[str] = None
    kilometers_driven: Optional[float] = None
    notes: Optional[str] = None


class CancelRideRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    date: str
    from_location: Annotated[str, Field(alias="from")]
    to_location: Annotated[str, Field(alias="to")]
    purpose: Optional[str] = ""


# ---------- endpoints ----------

@router.get("")
def list_rides(year: Optional[int] = None):
    """Return all rides for a given year sorted by date and time."""
    target_year = str(year) if year else str(datetime.now().year)
    all_rides = read_rides()
    year_rides = list(all_rides.get(target_year, {}).values())
    year_rides.sort(key=lambda r: (r["date"], r["time"]))
    return year_rides


@router.post("")
def create_ride(ride: RideCreate):
    """Add a new planned ride."""
    if not ride.date or not ride.time or not ride.origin or not ride.destination:
        raise HTTPException(status_code=422, detail="date, time, origin, and destination are required.")

    if ride.ride_type and ride.ride_type not in VALID_RIDE_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid ride_type '{ride.ride_type}'.")

    ride_year = str(ride.year) if ride.year else str(datetime.now().year)
    all_rides = read_rides()
    if ride_year not in all_rides:
        all_rides[ride_year] = {}

    ride_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    km = ride.kilometers_driven if ride.ride_type == "private_car" else None
    cost = round(km * 0.7, 2) if km is not None else None

    all_rides[ride_year][ride_id] = {
        "id": ride_id,
        "date": ride.date,
        "time": ride.time,
        "origin": ride.origin,
        "destination": ride.destination,
        "appointment_type": ride.appointment_type or "",
        "ride_type": ride.ride_type or "",
        "kilometers_driven": km,
        "cost_chf": cost,
        "notes": ride.notes or "",
        "year": int(ride_year),
        "created_at": now,
        "updated_at": now,
    }

    write_rides(all_rides)
    return all_rides[ride_year][ride_id]


@router.post("/send-tixi-email")
async def send_tixi_email(year: Optional[int] = None):
    """Send TixiTaxi ride list via the IBM watsonx Outlook email agent."""
    taxi_email = os.getenv("TAXI_EMAIL")

    missing = [name for name, val in [
        ("TAXI_EMAIL", taxi_email),
        ("WXO_EMAIL_AGENT_ID", WXO_EMAIL_AGENT_ID),
        ("WXO_API_KEY", WXO_API_KEY),
        ("WXO_INSTANCE_ID", WXO_INSTANCE_ID),
    ] if not val]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Email agent not configured. Add to your .env file: {', '.join(missing)}",
        )

    target_year = str(year) if year else str(datetime.now().year)
    all_rides = read_rides()
    tixi_rides = [
        r for r in all_rides.get(target_year, {}).values()
        if r.get("ride_type") == "tixitaxi"
    ]
    tixi_rides.sort(key=lambda r: (r["date"], r["time"]))

    if not tixi_rides:
        raise HTTPException(
            status_code=404,
            detail=f"No TixiTaxi rides found for {target_year}.",
        )

    header = f"{'Date':<12} {'Time':<8} {'From':<25} {'To':<25} {'Appointment':<20} Notes"
    divider = "-" * 100
    table_rows = [header, divider] + [
        f"{r['date']:<12} {r['time']:<8} {r['origin']:<25} {r['destination']:<25} "
        f"{(r.get('appointment_type') or '—'):<20} {r.get('notes') or '—'}"
        for r in tixi_rides
    ]
    table = "\n".join(table_rows)

    count = len(tixi_rides)
    profile = read_profile()
    invoice_address = (profile.get("invoice_address") or "").strip()
    invoice_address_block = f"Invoice address:\n{invoice_address}\n\n" if invoice_address else ""
    agent_message = (
        f"Please send an Outlook email to {taxi_email} with the following details:\n\n"
        f"Subject: TixiTaxi Rides {target_year} – CareConnect\n\n"
        f"Body:\n"
        f"Hi,\n\n"
        f"Please find below the TixiTaxi rides planned for {target_year} "
        f"({count} ride{'s' if count != 1 else ''}):\n\n"
        f"{table}\n\n"
        f"{invoice_address_block}"
        f"Best regards,\nCareConnect"
    )

    headers = await get_auth_headers()
    payload = {
        "message": {"role": "user", "content": agent_message},
        "agent_id": WXO_EMAIL_AGENT_ID,
        "capture_logs": False,
    }

    async with httpx.AsyncClient(verify=False) as client:
        try:
            response = await client.post(get_runs_endpoint(), json=payload, headers=headers)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Failed to reach watsonx service: {exc}") from exc
        if response.status_code not in (200, 201, 202):
            raise HTTPException(status_code=500, detail=f"watsonx agent run failed: {response.text}")
        run_data = response.json()

    run_id = run_data.get("id") or run_data.get("run_id")
    if run_id:
        await wait_for_run_completion(run_id, timeout_seconds=30)

    return {"status": "sent", "to": taxi_email, "count": count}


@router.post("/cancel-ride")
async def cancel_ride(request: CancelRideRequest):
    """Initiate a phone call to TixiTaxi to cancel a ride."""
    if os.getenv("MOCK_CALLS", "").strip().lower() in {"1", "true", "yes"}:
        return {
            "status": "call_initiated",
            "call_sid": f"MOCK-{uuid.uuid4().hex[:20].upper()}",
            "to": TIXI_CANCELLATION_NUMBER,
            "from": os.getenv("TWILIO_FROM_NUMBER", "+10000000000"),
            "mock": True,
        }

    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()

    missing = [name for name, val in [
        ("TWILIO_ACCOUNT_SID", sid),
        ("TWILIO_AUTH_TOKEN", auth_token),
        ("TWILIO_FROM_NUMBER", from_number),
    ] if not val]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"Twilio not configured. Add to backend/.env: {', '.join(missing)}",
        )

    twiml_message = (
        "Hello. This is CareConnect calling to cancel a TixiTaxi ride. "
        f"Date: {request.date}. "
        f"From: {request.from_location}. "
        f"To: {request.to_location}. "
        f"Purpose: {request.purpose or 'not specified'}. "
        "Please confirm this cancellation. Thank you."
    )
    twiml = f'<Response><Say voice="alice">{twiml_message}</Say></Response>'

    twilio_url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls.json"
    payload = {
        "To": TIXI_CANCELLATION_NUMBER,
        "From": from_number,
        "Twiml": twiml,
    }

    async with httpx.AsyncClient(timeout=20, verify=False) as client:
        try:
            response = await client.post(
                twilio_url,
                data=payload,
                auth=(sid, auth_token),
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Failed to reach Twilio: {exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(status_code=500, detail=f"Twilio call failed: {response.text}")

    data = response.json()
    return {
        "status": "call_initiated",
        "call_sid": data.get("sid"),
        "to": TIXI_CANCELLATION_NUMBER,
        "from": from_number,
    }


@router.get("/check-twilio")
async def check_twilio():
    """Return which numbers Twilio considers verified for the configured account credentials."""
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    if not sid or not auth_token:
        raise HTTPException(status_code=503, detail="TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set.")

    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/OutgoingCallerIds.json"
    async with httpx.AsyncClient(timeout=10, verify=False) as client:
        try:
            response = await client.get(url, auth=(sid, auth_token))
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Failed to reach Twilio: {exc}") from exc

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Twilio credentials are invalid (401 Unauthorized).")
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Twilio error: {response.text}")

    data = response.json()
    verified = [entry.get("phone_number") for entry in data.get("outgoing_caller_ids", [])]
    return {
        "account_sid_used": sid,
        "verified_numbers": verified,
        "target_number": TIXI_CANCELLATION_NUMBER,
        "target_is_verified": TIXI_CANCELLATION_NUMBER in verified,
    }


@router.patch("/{ride_id}")
def update_ride(ride_id: str, updates: RideUpdate):
    """Partially update a ride."""
    if updates.ride_type is not None and updates.ride_type not in VALID_RIDE_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid ride_type '{updates.ride_type}'.")

    all_rides = read_rides()

    found_year = None
    for year_key, year_rides in all_rides.items():
        if ride_id in year_rides:
            found_year = year_key
            break

    if not found_year:
        raise HTTPException(status_code=404, detail=f"Ride '{ride_id}' not found.")

    ride = all_rides[found_year][ride_id]

    if updates.date is not None:
        ride["date"] = updates.date
    if updates.time is not None:
        ride["time"] = updates.time
    if updates.origin is not None:
        ride["origin"] = updates.origin
    if updates.destination is not None:
        ride["destination"] = updates.destination
    if updates.appointment_type is not None:
        ride["appointment_type"] = updates.appointment_type
    if updates.ride_type is not None:
        ride["ride_type"] = updates.ride_type
        if updates.ride_type != "private_car":
            ride["kilometers_driven"] = None
            ride["cost_chf"] = None
    if updates.kilometers_driven is not None:
        ride["kilometers_driven"] = updates.kilometers_driven

    if ride.get("ride_type") == "private_car" and ride.get("kilometers_driven") is not None:
        ride["cost_chf"] = round(ride["kilometers_driven"] * 0.7, 2)
    elif ride.get("ride_type") != "private_car":
        ride["cost_chf"] = None
    if updates.notes is not None:
        ride["notes"] = updates.notes

    ride["updated_at"] = datetime.now().isoformat()
    all_rides[found_year][ride_id] = ride

    write_rides(all_rides)
    return ride


@router.delete("/{ride_id}")
def delete_ride(ride_id: str):
    """Permanently remove a ride."""
    all_rides = read_rides()

    found_year = None
    for year_key, year_rides in all_rides.items():
        if ride_id in year_rides:
            found_year = year_key
            break

    if not found_year:
        raise HTTPException(status_code=404, detail=f"Ride '{ride_id}' not found.")

    del all_rides[found_year][ride_id]
    write_rides(all_rides)

    return {"status": "deleted", "id": ride_id}
