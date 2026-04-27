import os
import json
import uuid
import shutil
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

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
