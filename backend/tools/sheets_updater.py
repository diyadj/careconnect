import os
import json
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

SHEET_ID = os.getenv("GOOGLE_SHEET_ID")
CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "./google_credentials.json")
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Tab name inside your Google Sheet
SHEET_TAB = "Mileage Log"


def get_sheets_service():
    creds = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds)


def append_mileage_row(week_date: str, data: dict):
    """
    Appends one row to the mileage log sheet.
    Columns: Week | Normal Schedule | Sick Days | Extra KM | Extra Trip Notes | Other Notes
    """
    service = get_sheets_service()

    sick_days_str = ", ".join(data.get("sick_days", [])) or "None"

    extra_trips = data.get("extra_trips", [])
    extra_km = sum(t.get("km", 0) for t in extra_trips)
    extra_notes = "; ".join(
        f"{t.get('reason', '')} ({t.get('km', 0)} km)" for t in extra_trips
    ) or "None"

    row = [
        week_date,
        "Yes" if data.get("normal_schedule_completed") else "No",
        sick_days_str,
        extra_km,
        extra_notes,
        data.get("notes", "")
    ]

    body = {"values": [row]}

    service.spreadsheets().values().append(
        spreadsheetId=SHEET_ID,
        range=f"{SHEET_TAB}!A:F",
        valueInputOption="USER_ENTERED",
        body=body
    ).execute()
