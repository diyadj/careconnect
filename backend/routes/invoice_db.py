import os
import json
import uuid
import re
import shutil
import asyncio
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from .invoice import (
    create_run,
    wait_for_run_completion,
    get_latest_assistant_message,
    extract_text_from_message,
    WXO_INVOICE_AGENT_ID,
)

router = APIRouter()

INVOICE_DB_FILE = os.path.join(os.path.dirname(__file__), "../data/invoice_db.json")
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "../data/invoice_uploads")

VALID_CATEGORIES = {"transport", "meal"}
VALID_TRANSPORT_TYPES = {"tixitaxi", "public_transport", "private_car", "other", ""}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


# ---------- persistence ----------

def read_db() -> dict:
    if not os.path.exists(INVOICE_DB_FILE):
        return {}
    with open(INVOICE_DB_FILE, "r") as f:
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
    """Return all invoices for a year, optionally filtered by category."""
    target_year = str(year) if year else str(datetime.now().year)
    all_data = read_db()
    invoices = list(all_data.get(target_year, {}).values())

    if category and category in VALID_CATEGORIES:
        invoices = [i for i in invoices if i.get("category") == category]

    invoices.sort(key=lambda i: i["date"], reverse=True)
    return invoices


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


def _parse_form_row(text: str, behandlungsgrund: str, behandlungsort: str) -> Optional[dict]:
    """Parse FormRow fields from agent response text (JSON block or formatted block)."""
    if not text:
        return None

    # Try JSON first — agent returns FormRow as JSON after step-5 confirmation
    json_match = re.search(r'\{[\s\S]*?"reisedatum"[\s\S]*?\}', text)
    if json_match:
        try:
            data = json.loads(json_match.group())
            if data.get("reisedatum"):
                return data
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: parse the step-4 formatted block
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
        "behandlungsgrund": behandlungsgrund,
        "behandlungsort": behandlungsort,
        "billetpreis_ov": _chf(ov_match),
        "privatauto": _chf(privat_match),
        "taxi": _chf(taxi_match),
        "total": _chf(total_match),
    }
    return result if result["reisedatum"] and result["total"] else None


@router.post("/agent-extract")
async def agent_extract_invoice(
    file: UploadFile = File(...),
    behandlungsgrund: str = Form(...),
    behandlungsort: str = Form(...),
    year: Optional[int] = Form(None),
):
    """Send a receipt to the WatsonX invoice extraction agent, auto-confirm, and save the record."""
    agent_id = (WXO_INVOICE_AGENT_ID or "").strip()
    if not agent_id:
        raise HTTPException(
            status_code=500,
            detail=(
                "WXO_INVOICE_AGENT_ID is not set. "
                "Run 'orchestrate agents list', copy the ID for invoice_extraction_agent, "
                "and add it to backend/.env as WXO_INVOICE_AGENT_ID=<id>."
            ),
        )

    original_name = file.filename or "invoice"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"File type '{ext}' not allowed. Use PDF, JPG, or PNG.")

    file_bytes = await file.read()

    context_message = (
        f"Here is my Swiss transport receipt. "
        f"The appointment reason (Behandlungsgrund) is: {behandlungsgrund}. "
        f"The care provider and location (Behandlungsort) is: {behandlungsort}. "
        f"Please extract the receipt details and assemble the SVA Form 5050 row."
    )

    # Compress image to JPEG ≤1024px so it fits in the vision model's context window.
    # PDFs are sent as text-only (vision models can't read PDF bytes directly).
    image_bytes = None
    image_mime = "image/jpeg"
    if ext in (".jpg", ".jpeg", ".png"):
        try:
            from PIL import Image
            import io as _io
            img = Image.open(_io.BytesIO(file_bytes))
            img.thumbnail((1024, 1536), Image.LANCZOS)
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")
            buf = _io.BytesIO()
            img.save(buf, format="JPEG", quality=75, optimize=True)
            image_bytes = buf.getvalue()
        except ImportError:
            # Pillow not installed — send raw bytes and hope they fit
            image_bytes = file_bytes
            image_mime = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

    # Turn 1: send receipt image inline as multimodal content
    run1 = await create_run(
        context_message,
        agent_id=agent_id,
        image_bytes=image_bytes,
        image_mime=image_mime,
    )
    thread_id = run1.get("thread_id")
    if not thread_id:
        raise HTTPException(status_code=500, detail="Failed to start extraction session.")
    if run1.get("run_id"):
        await wait_for_run_completion(run1["run_id"])

    msg1 = await get_latest_assistant_message(thread_id)
    text1 = extract_text_from_message(msg1) if msg1 else ""

    # If agent still asks for the two missing fields, supply them explicitly
    still_asking = (
        any(kw in text1.lower() for kw in ["behandlungsgrund", "appointment", "reason for", "care provider"])
        and "does this look correct" not in text1.lower()
        and "Total:" not in text1
    )
    if still_asking:
        run2 = await create_run(
            f"{behandlungsgrund}\n{behandlungsort}",
            thread_id=thread_id,
            agent_id=agent_id,
        )
        if run2.get("run_id"):
            await wait_for_run_completion(run2["run_id"])
        msg2 = await get_latest_assistant_message(thread_id)
        text1 = extract_text_from_message(msg2) if msg2 else text1

    # If agent shows the formatted row and asks for confirmation, auto-confirm
    if "does this look correct" in text1.lower() or "look correct" in text1.lower():
        run_c = await create_run(
            "Yes, it looks correct. Please save it.",
            thread_id=thread_id,
            agent_id=agent_id,
        )
        if run_c.get("run_id"):
            await wait_for_run_completion(run_c["run_id"])
        msg_c = await get_latest_assistant_message(thread_id)
        final_text = extract_text_from_message(msg_c) if msg_c else text1
    else:
        final_text = text1

    # Parse FormRow from whichever response has the most data
    form_row = _parse_form_row(final_text, behandlungsgrund, behandlungsort) \
        or _parse_form_row(text1, behandlungsgrund, behandlungsort)

    if not form_row:
        raise HTTPException(
            status_code=422,
            detail=(
                "The agent could not extract a valid date or amount from this receipt. "
                f"Agent response: {(final_text or text1)[:400]}"
            ),
        )

    # Determine transport type and amount from the FormRow columns
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

    # Normalise date to YYYY-MM-DD
    raw_date = form_row.get("reisedatum", "")
    swiss = re.match(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', raw_date)
    iso = re.match(r'(\d{4})-(\d{2})-(\d{2})', raw_date)
    if swiss:
        date_str = f"{swiss.group(3)}-{swiss.group(2).zfill(2)}-{swiss.group(1).zfill(2)}"
    elif iso:
        date_str = raw_date[:10]
    else:
        date_str = datetime.now().strftime("%Y-%m-%d")

    # Save file to disk
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
        "vendor": form_row.get("behandlungsort", behandlungsort),
        "amount": round(float(amount), 2),
        "description": form_row.get("behandlungsgrund", behandlungsgrund),
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
