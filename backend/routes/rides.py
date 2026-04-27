import os
import json
import uuid
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

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

    all_rides[ride_year][ride_id] = {
        "id": ride_id,
        "date": ride.date,
        "time": ride.time,
        "origin": ride.origin,
        "destination": ride.destination,
        "appointment_type": ride.appointment_type or "",
        "ride_type": ride.ride_type or "",
        "kilometers_driven": ride.kilometers_driven if ride.ride_type == "private_car" else None,
        "notes": ride.notes or "",
        "year": int(ride_year),
        "created_at": now,
        "updated_at": now,
    }

    write_rides(all_rides)
    return all_rides[ride_year][ride_id]


@router.post("/send-tixi-email")
def send_tixi_email(year: Optional[int] = None):
    """Email the TixiTaxi ride list for the given year to the configured taxi address."""
    taxi_email = os.getenv("TAXI_EMAIL")
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("EMAIL_SENDER", smtp_user)

    if not all([taxi_email, smtp_user, smtp_password]):
        raise HTTPException(
            status_code=503,
            detail="Email not configured. Add TAXI_EMAIL, SMTP_USER, and SMTP_PASSWORD to your .env file.",
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

    rows = "".join(
        f"""<tr>
          <td style="padding:0.5rem 0.75rem;border-bottom:1px solid #e5e7eb">{r['date']}</td>
          <td style="padding:0.5rem 0.75rem;border-bottom:1px solid #e5e7eb">{r['time']}</td>
          <td style="padding:0.5rem 0.75rem;border-bottom:1px solid #e5e7eb">{r['origin']}</td>
          <td style="padding:0.5rem 0.75rem;border-bottom:1px solid #e5e7eb">{r['destination']}</td>
          <td style="padding:0.5rem 0.75rem;border-bottom:1px solid #e5e7eb">{r.get('appointment_type') or '—'}</td>
          <td style="padding:0.5rem 0.75rem;border-bottom:1px solid #e5e7eb">{r.get('notes') or '—'}</td>
        </tr>"""
        for r in tixi_rides
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#111;padding:2rem;max-width:720px;margin:0 auto">
  <h2 style="margin-bottom:0.25rem">TixiTaxi Rides — {target_year}</h2>
  <p style="color:#666;font-size:0.9rem;margin-bottom:1.5rem">
    {len(tixi_rides)} ride{"s" if len(tixi_rides) != 1 else ""} planned
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
    <thead>
      <tr style="background:#0e7c86;color:#fff">
        <th style="padding:0.55rem 0.75rem;text-align:left">Date</th>
        <th style="padding:0.55rem 0.75rem;text-align:left">Time</th>
        <th style="padding:0.55rem 0.75rem;text-align:left">From</th>
        <th style="padding:0.55rem 0.75rem;text-align:left">To</th>
        <th style="padding:0.55rem 0.75rem;text-align:left">Appointment</th>
        <th style="padding:0.55rem 0.75rem;text-align:left">Notes</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
  </table>
  <p style="color:#999;font-size:0.8rem;margin-top:1.5rem">Sent via CareConnect</p>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"TixiTaxi Rides {target_year} – CareConnect"
    msg["From"] = sender
    msg["To"] = taxi_email
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(sender, [taxi_email], msg.as_string())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")

    return {"status": "sent", "to": taxi_email, "count": len(tixi_rides)}


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
    if updates.kilometers_driven is not None:
        ride["kilometers_driven"] = updates.kilometers_driven
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
