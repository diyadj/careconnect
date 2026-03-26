from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agents.mileage_agent import parse_weekly_report
from tools.sheets_updater import append_mileage_row

router = APIRouter()


class CheckinRequest(BaseModel):
    week_date: str        # e.g. "2026-03-24"
    father_message: str   # free text from the father


class MileageSummaryRequest(BaseModel):
    year: int
    rate_per_km: float = 0.70   # default IV reimbursement rate


@router.post("/checkin")
async def weekly_checkin(request: CheckinRequest):
    """
    Parses the father's weekly message using the mileage agent,
    then logs the result to Google Sheets.
    """
    try:
        parsed = await parse_weekly_report(
            week_date=request.week_date,
            father_message=request.father_message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing error: {str(e)}")

    try:
        append_mileage_row(week_date=request.week_date, data=parsed)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sheets error: {str(e)}")

    return {
        "week_date": request.week_date,
        "parsed_data": parsed,
        "status": "logged"
    }


@router.get("/summary")
async def get_mileage_summary(year: int, rate_per_km: float = 0.70):
    """
    Placeholder for reading the mileage log and computing the total
    reimbursable amount for the year. You will wire this to Sheets later.
    """
    # TODO: read from Google Sheets and calculate total km and amount
    return {
        "year": year,
        "rate_per_km": rate_per_km,
        "total_km": 0,
        "total_amount": 0.0,
        "message": "Connect to Google Sheets to see real data"
    }
