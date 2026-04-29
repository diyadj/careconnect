from pydantic import BaseModel
from typing import Optional


class ExtractedReceipt(BaseModel):
    reisedatum: Optional[str] = None        # travel date, ISO format if found
    betrag_chf: Optional[float] = None      # CHF amount actually paid
    transport_type: Optional[str] = None    # "ov", "privatauto", "taxi", "not_found"
    raw_text: Optional[str] = None          # full OCR text for debugging


class FormRow(BaseModel):
    reisedatum: str
    behandlungsgrund: str
    behandlungsort: str
    billetpreis_ov: Optional[float] = None  # null if not OV
    privatauto: Optional[float] = None      # null if not private car
    taxi: Optional[float] = None            # null if not taxi
    total: float
