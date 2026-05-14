import os
import json
import uuid
import re
import shutil
import asyncio
import time
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from .invoice import (
    create_run,
    wait_for_run_completion,
    get_thread_messages,
    extract_text_from_message,
    upload_files_to_wxo,
)

router = APIRouter()

INVOICE_DB_FILE = os.path.join(os.path.dirname(__file__), "../data/invoice_db.json")
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "../data/invoice_uploads")
RIDES_FILE = os.path.join(os.path.dirname(__file__), "../data/rides.json")

VALID_CATEGORIES = {"transport", "meal"}
VALID_TRANSPORT_TYPES = {"tixitaxi", "public_transport", "private_car", "other", ""}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}

_TIXI_DEST_PRICES = [
    (["zürich", "zurich", "zuerich"], 92.0),
    (["luzern", "lucerne"], 145.0),
    (["herisau", "appenzell", "trogen", "heiden"], 45.0),
]

def _estimate_ride_amount(ride: dict) -> float:
    if ride.get("cost_chf") is not None:
        return float(ride["cost_chf"])
    if (ride.get("ride_type") or "") != "tixitaxi":
        return 0.0
    dest = (ride.get("destination") or "").lower()
    for keywords, price in _TIXI_DEST_PRICES:
        if any(k in dest for k in keywords):
            return price
    return 28.50


# ---------- persistence ----------

def read_db() -> dict:
    if not os.path.exists(INVOICE_DB_FILE):
        return {}
    with open(INVOICE_DB_FILE, "r") as f:
        return json.load(f)


def _read_rides() -> dict:
    if not os.path.exists(RIDES_FILE):
        return {}
    with open(RIDES_FILE, "r") as f:
        return json.load(f)


def write_db(data: dict):
    os.makedirs(os.path.dirname(INVOICE_DB_FILE), exist_ok=True)
    with open(INVOICE_DB_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ---------- models ----------

class InvoiceUpdate(BaseModel):
    category: Optional[str] = None
    date: Optional[str] = None
    vendor: Optional[str] = None
    amount: Optional[float] = None
    transport_type: Optional[str] = None
    description: Optional[str] = None


# ---------- endpoints ----------

@router.get("")
def list_invoices(year: Optional[int] = None, category: Optional[str] = None):
    """Return all invoices and ride plan records for a year, optionally filtered by category."""
    target_year = str(year) if year else str(datetime.now().year)
    all_data = read_db()
    year_invoices = all_data.get(target_year, {})
    records = [{"source": "invoice", **inv} for inv in year_invoices.values()]

    # Build dedup set: skip ride plan entries already covered by an invoice record
    invoice_keys = {(inv["date"], inv.get("transport_type", "")) for inv in year_invoices.values()}

    for ride in _read_rides().get(target_year, {}).values():
        ride_type = ride.get("ride_type") or ""
        if (ride["date"], ride_type) in invoice_keys:
            continue
        records.append({
            "id": ride["id"],
            "source": "ride",
            "category": "transport",
            "transport_type": ride_type,
            "date": ride["date"],
            "vendor": ride.get("destination") or "",
            "amount": _estimate_ride_amount(ride),
            "description": ride.get("appointment_type") or "",
            "filename": None,
            "stored_name": None,
            "year": ride.get("year") or int(target_year),
            "created_at": ride.get("created_at") or "",
            "updated_at": ride.get("updated_at") or "",
        })

    if category and category in VALID_CATEGORIES:
        records = [r for r in records if r.get("category") == category]

    records.sort(key=lambda r: r["date"], reverse=True)
    return records


@router.post("/upload")
async def upload_invoice(
    file: UploadFile = File(...),
    category: str = Form(...),
    date: str = Form(...),
    vendor: str = Form(...),
    amount: float = Form(...),
    transport_type: str = Form(""),
    description: str = Form(""),
    year: Optional[int] = Form(None),
):
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Invalid category '{category}'.")
    if not date or not vendor:
        raise HTTPException(status_code=422, detail="date and vendor are required.")
    if amount < 0:
        raise HTTPException(status_code=422, detail="amount must be non-negative.")
    if transport_type and transport_type not in VALID_TRANSPORT_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid transport_type '{transport_type}'.")

    original_name = file.filename or "invoice"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"File type '{ext}' not allowed. Use PDF, JPG, or PNG.")

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    inv_id = str(uuid.uuid4())
    stored_name = f"{inv_id}{ext}"
    file_path = os.path.join(UPLOADS_DIR, stored_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    year_key = str(year) if year else str(datetime.now().year)
    all_data = read_db()
    if year_key not in all_data:
        all_data[year_key] = {}

    now = datetime.now().isoformat()
    record = {
        "id": inv_id,
        "category": category,
        "transport_type": transport_type if category == "transport" else "",
        "date": date,
        "vendor": vendor,
        "amount": round(float(amount), 2),
        "description": description or "",
        "filename": original_name,
        "stored_name": stored_name,
        "year": int(year_key),
        "created_at": now,
        "updated_at": now,
    }

    all_data[year_key][inv_id] = record
    write_db(all_data)
    return record


@router.get("/file/{inv_id}")
def get_invoice_file(inv_id: str):
    """Serve the uploaded file for an invoice record."""
    all_data = read_db()
    found_year = next((y for y, rows in all_data.items() if inv_id in rows), None)
    if not found_year:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    inv = all_data[found_year][inv_id]
    stored_name = inv.get("stored_name")
    if not stored_name:
        raise HTTPException(status_code=404, detail="No file attached to this invoice.")

    file_path = os.path.join(UPLOADS_DIR, stored_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server.")

    return FileResponse(
        file_path,
        filename=inv.get("filename", stored_name),
    )


@router.patch("/{inv_id}")
def update_invoice(inv_id: str, updates: InvoiceUpdate):
    if updates.category is not None and updates.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Invalid category '{updates.category}'.")
    if updates.transport_type is not None and updates.transport_type not in VALID_TRANSPORT_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid transport_type '{updates.transport_type}'.")
    if updates.amount is not None and updates.amount < 0:
        raise HTTPException(status_code=422, detail="amount must be non-negative.")

    all_data = read_db()
    found_year = next((y for y, rows in all_data.items() if inv_id in rows), None)
    if not found_year:
        raise HTTPException(status_code=404, detail=f"Invoice '{inv_id}' not found.")

    inv = all_data[found_year][inv_id]

    for field in ("category", "date", "vendor", "description"):
        val = getattr(updates, field)
        if val is not None:
            inv[field] = val

    if updates.amount is not None:
        inv["amount"] = round(updates.amount, 2)

    if updates.transport_type is not None:
        inv["transport_type"] = updates.transport_type if inv["category"] == "transport" else ""

    inv["updated_at"] = datetime.now().isoformat()
    all_data[found_year][inv_id] = inv
    write_db(all_data)
    return inv


def _parse_form_row(text: str, appointment_reason: str, appointment_address: str) -> Optional[dict]:
    """Parse extracted receipt fields from agent/flow response text."""
    if not text:
        return None

    # Path 1: old ADK agent returns FormRow as JSON with German key "reisedatum"
    json_match = re.search(r'\{[\s\S]*?"reisedatum"[\s\S]*?\}', text)
    if json_match:
        try:
            data = json.loads(json_match.group())
            if data.get("reisedatum"):
                if not data.get("behandlungsgrund"):
                    data["behandlungsgrund"] = appointment_reason
                if not data.get("behandlungsort"):
                    data["behandlungsort"] = appointment_address
                return data
        except (json.JSONDecodeError, ValueError):
            pass

    # Path 2: WatsonX Flow Builder JSON output (invoice_details wrapper or flat object)
    # Also handles new agent format: {"Date": "...", "Cost": "CHF X.XX", "Appointment Reason": "...", ...}
    flow_json_match = re.search(r'\{[\s\S]*?"invoice_details"[\s\S]*?\}(?=\s*\})', text)
    if not flow_json_match:
        flow_json_match = re.search(r'\{[\s\S]*?\}', text)
    if flow_json_match:
        try:
            outer = json.loads(flow_json_match.group())
            d = outer.get("invoice_details") if isinstance(outer.get("invoice_details"), dict) else outer
            raw_date = str(d.get("Date") or d.get("date") or "")
            cost_raw = d.get("Cost") if d.get("Cost") is not None else d.get("cost")
            if raw_date and cost_raw is not None:
                swiss = re.match(r'(\d{1,2})[./](\d{1,2})[./](\d{4})', raw_date)
                iso = re.match(r'(\d{4})-(\d{2})-(\d{2})', raw_date)
                if swiss:
                    norm_date = f"{swiss.group(3)}-{swiss.group(2).zfill(2)}-{swiss.group(1).zfill(2)}"
                elif iso:
                    norm_date = raw_date[:10]
                else:
                    norm_date = None
                # Handle "CHF 6.30" string or plain numeric value
                cost_str = str(cost_raw).upper().replace("CHF", "").strip().replace(",", ".")
                try:
                    cost = float(cost_str)
                except ValueError:
                    cost = None
                if norm_date and cost is not None:
                    return {
                        "reisedatum": norm_date,
                        "behandlungsgrund": (d.get("Appointment Reason") or d.get("appointment_reason") or appointment_reason or "").strip(),
                        "behandlungsort": (d.get("Appointment Address") or d.get("appointment_address") or d.get("appointment_location") or appointment_address or "").strip(),
                        "billetpreis_ov": cost,
                        "privatauto": None,
                        "taxi": None,
                        "total": cost,
                    }
        except (json.JSONDecodeError, ValueError):
            pass

    # Path 3: WatsonX Flow "Display message" plain text, e.g.:
    #   Date: 08.05.2026, Cost: CHF 6.30, Location from: St. Gallen, Location to: Jakobsbad,
    #   Appointment Reason: Doctor Visit, Appointment Address: St Gallen Cantonal Hospital
    eng_date_match = re.search(r'Date:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})', text, re.IGNORECASE)
    eng_cost_match = re.search(r'Cost:\s*(?:CHF\s*)?([\d]+[.,][\d]+|[\d]+)', text, re.IGNORECASE)
    if eng_date_match and eng_cost_match:
        raw = eng_date_match.group(1)
        swiss = re.match(r'(\d{1,2})[./](\d{1,2})[./](\d{4})', raw)
        iso = re.match(r'(\d{4})-(\d{2})-(\d{2})', raw)
        norm_date = (
            f"{swiss.group(3)}-{swiss.group(2).zfill(2)}-{swiss.group(1).zfill(2)}" if swiss
            else raw[:10] if iso else None
        )
        try:
            cost = float(eng_cost_match.group(1).replace(",", "."))
        except ValueError:
            cost = None
        appt_reason_match = re.search(r'Appointment Reason:\s*([^,\n]+)', text, re.IGNORECASE)
        appt_address_match = re.search(r'Appointment Address:\s*([^\n]+)', text, re.IGNORECASE)
        if norm_date and cost is not None:
            return {
                "reisedatum": norm_date,
                "behandlungsgrund": appt_reason_match.group(1).strip() if appt_reason_match else appointment_reason,
                "behandlungsort": appt_address_match.group(1).strip() if appt_address_match else appointment_address,
                "billetpreis_ov": cost,
                "privatauto": None,
                "taxi": None,
                "total": cost,
            }

    # Path 4: old ADK agent formatted text block (German labels)
    date_match = re.search(r'Reisedatum:\s*(\d{1,2}[./]\d{1,2}[./]\d{4})', text)
    ov_match = re.search(r'Billetpreis[^:\n]*:\s*CHF\s*([\d.,]+)', text, re.IGNORECASE)
    privat_match = re.search(r'Privatauto:\s*CHF\s*([\d.,]+)', text, re.IGNORECASE)
    taxi_match = re.search(r'Taxi[^:\n]*:\s*CHF\s*([\d.,]+)', text, re.IGNORECASE)
    total_match = re.search(r'Total:\s*CHF\s*([\d.,]+)', text, re.IGNORECASE)

    if not date_match and not total_match:
        return None

    reisedatum = None
    if date_match:
        raw = date_match.group(1).replace("/", ".")
        parts = raw.split(".")
        if len(parts) == 3:
            d, m, y = parts
            reisedatum = f"{y}-{m.zfill(2)}-{d.zfill(2)}"

    def _chf(m):
        if not m:
            return None
        try:
            return float(m.group(1).replace(",", "."))
        except ValueError:
            return None

    result = {
        "reisedatum": reisedatum,
        "behandlungsgrund": appointment_reason,
        "behandlungsort": appointment_address,
        "billetpreis_ov": _chf(ov_match),
        "privatauto": _chf(privat_match),
        "taxi": _chf(taxi_match),
        "total": _chf(total_match),
    }
    return result if result["reisedatum"] and result["total"] else None


@router.post("/agent-extract")
async def agent_extract_invoice(
    file: UploadFile = File(...),
    appointment_reason: str = Form(...),
    appointment_address: str = Form(...),
    year: Optional[int] = Form(None),
):
    agent_id = (os.getenv("WXO_INVOICE_AGENT_ID") or "").strip()
    if not agent_id:
        raise HTTPException(status_code=500, detail="WXO_INVOICE_AGENT_ID is not set in backend/.env.")

    original_name = file.filename or "invoice"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"File type '{ext}' not allowed. Use PDF, JPG, or PNG.")

    file_bytes = await file.read()

    # Turn 1: text trigger only — agent will ask for the file next
    run1 = await create_run("I want to submit my transport receipts", agent_id=agent_id)
    thread_id = run1.get("thread_id")
    if not thread_id:
        raise HTTPException(status_code=500, detail="Failed to start invoice session.")
    if run1.get("run_id"):
        await wait_for_run_completion(run1["run_id"])

    # Upload the file to WXO S3 (surfaces the real error if it fails)
    file_urls = await upload_files_to_wxo([{"filename": original_name, "content": file_bytes}])

    # Turn 2: send the file (source="USER" so the flow recognises it as the upload)
    run2 = await create_run("", thread_id=thread_id, agent_id=agent_id, file_urls=file_urls, context_source="USER")
    if run2.get("run_id"):
        await wait_for_run_completion(run2["run_id"])

    # Turn 3: agent asks "Enter Appointment Reason" — answer with the provided value
    run3 = await create_run(appointment_reason, thread_id=thread_id, agent_id=agent_id)
    if run3.get("run_id"):
        await wait_for_run_completion(run3["run_id"])

    # Turn 4: agent asks "Enter Appointment Address" — answer with the provided value
    run4 = await create_run(appointment_address, thread_id=thread_id, agent_id=agent_id)
    if run4.get("run_id"):
        await wait_for_run_completion(run4["run_id"])

    # Iterate messages newest-to-oldest; use first one that parses successfully.
    all_messages = await get_thread_messages(thread_id)
    form_row = None
    last_agent_text = ""
    for msg in reversed(all_messages):
        if msg.get("role") != "assistant":
            continue
        text = extract_text_from_message(msg)
        if not last_agent_text:
            last_agent_text = text
        form_row = _parse_form_row(text, appointment_reason, appointment_address)
        if form_row:
            break

    if not form_row:
        raise HTTPException(
            status_code=422,
            detail=f"Agent could not extract receipt data. Last response: {last_agent_text[:400]}",
        )

    if form_row.get("billetpreis_ov"):
        transport_type = "public_transport"
        amount = form_row["billetpreis_ov"]
    elif form_row.get("privatauto"):
        transport_type = "private_car"
        amount = form_row["privatauto"]
    elif form_row.get("taxi"):
        transport_type = "tixitaxi"
        amount = form_row["taxi"]
    else:
        transport_type = "other"
        amount = form_row.get("total", 0.0)

    raw_date = form_row.get("reisedatum", "")
    swiss = re.match(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', raw_date)
    iso = re.match(r'(\d{4})-(\d{2})-(\d{2})', raw_date)
    if swiss:
        date_str = f"{swiss.group(3)}-{swiss.group(2).zfill(2)}-{swiss.group(1).zfill(2)}"
    elif iso:
        date_str = raw_date[:10]
    else:
        date_str = datetime.now().strftime("%Y-%m-%d")

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    inv_id = str(uuid.uuid4())
    stored_name = f"{inv_id}{ext}"
    with open(os.path.join(UPLOADS_DIR, stored_name), "wb") as f:
        f.write(file_bytes)

    year_key = str(year) if year else str(datetime.now().year)
    now = datetime.now().isoformat()
    record = {
        "id": inv_id,
        "category": "transport",
        "transport_type": transport_type,
        "date": date_str,
        "vendor": form_row.get("behandlungsort", appointment_address),
        "amount": round(float(amount), 2),
        "description": form_row.get("behandlungsgrund", appointment_reason),
        "filename": original_name,
        "stored_name": stored_name,
        "year": int(year_key),
        "created_at": now,
        "updated_at": now,
    }

    all_data = read_db()
    if year_key not in all_data:
        all_data[year_key] = {}
    all_data[year_key][inv_id] = record
    write_db(all_data)
    return record


async def _wait_for_async_flow(thread_id: str, known_msg_ids: set, timeout: int = 90) -> str:
    """Poll thread messages until a new substantive assistant message appears."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        await asyncio.sleep(3)
        msgs = await get_thread_messages(thread_id)
        for msg in reversed(msgs):
            if msg.get("role") != "assistant":
                continue
            if msg.get("id") in known_msg_ids:
                continue
            text = extract_text_from_message(msg)
            # Skip the async-flow-started placeholder
            if "new flow has started" in text.lower():
                continue
            if text.strip():
                return text
    return ""


def _parse_meal_response(text: str) -> Optional[dict]:
    """Extract date, vendor, amount from meal agent response."""
    if not text:
        return None

    json_match = re.search(r'\{[\s\S]*?\}', text)
    if json_match:
        try:
            d = json.loads(json_match.group())
            raw_date = str(d.get("Date") or d.get("date") or "")
            cost_raw = next((d.get(k) for k in ("Cost", "cost", "Amount", "amount", "totalamt", "Totalamt") if d.get(k) is not None), None)
            vendor = (d.get("Vendor") or d.get("vendor") or d.get("Restaurant") or d.get("restaurant") or d.get("recipientName") or d.get("RecipientName") or "").strip()
            if raw_date and cost_raw is not None:
                from datetime import datetime as _dt
                swiss = re.match(r'(\d{1,2})[./](\d{1,2})[./](\d{4})', raw_date)
                iso = re.match(r'(\d{4})-(\d{2})-(\d{2})', raw_date)
                month_name = None
                for fmt in ("%d %B %Y", "%d %b %Y"):
                    try:
                        month_name = _dt.strptime(raw_date, fmt).strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        pass
                if swiss:
                    norm_date = f"{swiss.group(3)}-{swiss.group(2).zfill(2)}-{swiss.group(1).zfill(2)}"
                elif iso:
                    norm_date = raw_date[:10]
                elif month_name:
                    norm_date = month_name
                else:
                    norm_date = None
                cost_str = str(cost_raw).upper().replace("CHF", "").strip().replace(",", ".")
                try:
                    cost = float(cost_str)
                except ValueError:
                    cost = None
                if norm_date and cost is not None:
                    return {"date": norm_date, "vendor": vendor, "amount": cost}
        except (json.JSONDecodeError, ValueError):
            pass

    date_match = re.search(
        r'Date:\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\s+\w+\s+\d{4})',
        text, re.IGNORECASE,
    )
    cost_match = re.search(r'(?:Cost|Amount|Total|totalamt):\s*(?:CHF\s*)?([\d]+[.,][\d]+|[\d]+)', text, re.IGNORECASE)
    vendor_match = re.search(r'(?:Vendor|Restaurant|Shop|recipientName):\s*([^\n,]+)', text, re.IGNORECASE)
    if date_match and cost_match:
        raw = date_match.group(1).strip()
        swiss = re.match(r'(\d{1,2})[./](\d{1,2})[./](\d{4})', raw)
        iso = re.match(r'(\d{4})-(\d{2})-(\d{2})', raw)
        # Handle "14 May 2026" / "14 May 2026" month-name formats
        from datetime import datetime as _dt
        month_name = None
        for fmt in ("%d %B %Y", "%d %b %Y"):
            try:
                month_name = _dt.strptime(raw, fmt).strftime("%Y-%m-%d")
                break
            except ValueError:
                pass
        norm_date = (
            f"{swiss.group(3)}-{swiss.group(2).zfill(2)}-{swiss.group(1).zfill(2)}" if swiss
            else raw[:10] if iso else month_name
        )
        try:
            cost = float(cost_match.group(1).replace(",", "."))
        except ValueError:
            cost = None
        if norm_date and cost is not None:
            return {
                "date": norm_date,
                "vendor": vendor_match.group(1).strip() if vendor_match else "",
                "amount": cost,
            }
    return None


def _find_matching_appointment(meal_date: str) -> Optional[dict]:
    """Find the nearest transport invoice or ride within ±1 day of meal_date."""
    from datetime import date as dt_date, timedelta
    try:
        meal_dt = dt_date.fromisoformat(meal_date)
    except ValueError:
        return None
    window = {(meal_dt + timedelta(days=d)).isoformat() for d in (-1, 0, 1)}
    year_key = str(meal_dt.year)

    for inv in read_db().get(year_key, {}).values():
        if inv.get("category") == "transport" and inv.get("date") in window:
            return {"date": inv["date"], "description": inv.get("description") or "", "vendor": inv.get("vendor") or ""}

    for ride in _read_rides().get(year_key, {}).values():
        if ride.get("date") in window:
            return {"date": ride["date"], "description": ride.get("appointment_type") or "", "vendor": ride.get("destination") or ""}

    return None


@router.post("/meal-extract")
async def meal_extract_invoice(
    file: UploadFile = File(...),
    year: Optional[int] = Form(None),
):
    agent_id = (os.getenv("WXO_MEAL_AGENT_ID") or "").strip()
    if not agent_id:
        raise HTTPException(status_code=500, detail="WXO_MEAL_AGENT_ID is not set in backend/.env.")

    original_name = file.filename or "meal_receipt"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"File type '{ext}' not allowed. Use PDF, JPG, or PNG.")

    file_bytes = await file.read()

    run1 = await create_run("I want to submit a meal receipt", agent_id=agent_id)
    thread_id = run1.get("thread_id")
    if not thread_id:
        raise HTTPException(status_code=500, detail="Failed to start meal extraction session.")
    if run1.get("run_id"):
        await wait_for_run_completion(run1["run_id"])

    # Record all message IDs before the async flow triggers
    pre_msgs = await get_thread_messages(thread_id)
    known_ids = {m.get("id") for m in pre_msgs}

    file_urls = await upload_files_to_wxo([{"filename": original_name, "content": file_bytes}])
    run2 = await create_run("", thread_id=thread_id, agent_id=agent_id, file_urls=file_urls, context_source="USER")
    if run2.get("run_id"):
        await wait_for_run_completion(run2["run_id"])

    # Flow runs async — poll until the result message appears
    flow_result_text = await _wait_for_async_flow(thread_id, known_ids, timeout=90)
    print("=== FLOW RESULT TEXT ===")
    print(repr(flow_result_text))

    meal_data = _parse_meal_response(flow_result_text) if flow_result_text else None

    if not meal_data:
        raise HTTPException(
            status_code=422,
            detail=f"Agent could not extract meal data. Flow result: {flow_result_text[:800]}",
        )

    match_info = _find_matching_appointment(meal_data["date"])
    description = f"Meal · {match_info['description']}" if match_info else "Meal"

    os.makedirs(UPLOADS_DIR, exist_ok=True)
    inv_id = str(uuid.uuid4())
    stored_name = f"{inv_id}{ext}"
    with open(os.path.join(UPLOADS_DIR, stored_name), "wb") as f:
        f.write(file_bytes)

    year_key = str(year) if year else str(datetime.now().year)
    now = datetime.now().isoformat()
    record = {
        "id": inv_id,
        "category": "meal",
        "transport_type": "",
        "date": meal_data["date"],
        "vendor": meal_data["vendor"],
        "amount": round(meal_data["amount"], 2),
        "description": description,
        "filename": original_name,
        "stored_name": stored_name,
        "year": int(year_key),
        "created_at": now,
        "updated_at": now,
        "match_ref": match_info,
    }

    all_data = read_db()
    if year_key not in all_data:
        all_data[year_key] = {}
    all_data[year_key][inv_id] = record
    write_db(all_data)
    return {"record": record, "match_info": match_info}


@router.delete("/{inv_id}")
def delete_invoice(inv_id: str):
    all_data = read_db()
    found_year = next((y for y, rows in all_data.items() if inv_id in rows), None)
    if not found_year:
        raise HTTPException(status_code=404, detail=f"Invoice '{inv_id}' not found.")

    inv = all_data[found_year][inv_id]
    stored_name = inv.get("stored_name")
    if stored_name:
        file_path = os.path.join(UPLOADS_DIR, stored_name)
        if os.path.exists(file_path):
            os.remove(file_path)

    del all_data[found_year][inv_id]
    write_db(all_data)
    return {"status": "deleted", "id": inv_id}
