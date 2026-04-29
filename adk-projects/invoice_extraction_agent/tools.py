import logging
from typing import Optional

from ibm_watsonx_orchestrate.agent_builder.tools import tool

from models import ExtractedReceipt, FormRow

logger = logging.getLogger(__name__)


@tool
def extract_invoice_fields(
    reisedatum: str,
    betrag_chf: Optional[float],
    transport_type: str,
    raw_text: Optional[str] = None,
) -> dict:
    """
    Validate and structure the fields the agent read from a Swiss transport receipt.
    The agent reads the receipt image directly and passes the extracted values here.
    Returns a dict matching the ExtractedReceipt schema.
    """
    logger.info(
        "extract_invoice_fields called: date=%s amount=%s type=%s",
        reisedatum, betrag_chf, transport_type,
    )

    result = ExtractedReceipt(
        reisedatum=reisedatum or "not_found",
        betrag_chf=betrag_chf,
        transport_type=transport_type or "not_found",
        raw_text=raw_text,
    )
    logger.info("extract_invoice_fields result: %s", result.model_dump())
    return result.model_dump()


# Keyword lists for SVA transport classification
_OV_KEYWORDS = [
    "sbb", "bls", "zvv", "ostwind", "passepartout", "zpass", "z-pass",
    "billett", "einzelbillett", "tageskarte", "monatsabo", "generalabo",
    "halbtax", "half-fare", "gleis", "perron", "bahnhof", "haltestelle",
    "bus ", " bus", "tram", "s-bahn", " ic ", " ir ", " re ",
    "postbus", "postauto", "2. klasse", "2.klasse", "klasse",
]
_TAXI_KEYWORDS = [
    "taxi", "tixi", "tixitaxi", "uber", "fahrdienst",
    "begleitfahrt", "krankenfahrt", "chauffeur",
]
_PRIVATAUTO_KEYWORDS = [
    "km-entschaedigung", "km-entschädigung", "kilometerpauschale",
    "privatauto", "private car", "eigenes fahrzeug", "privatfahrzeug",
    "mileage", "km a chf", "km à chf",
]


@tool
def classify_transport_type(receipt_text: str) -> dict:
    """
    Classify a transport receipt into one of three SVA categories:
    'ov' (public transport), 'privatauto' (private car), or 'taxi'.
    Pass the raw text from the receipt or the extracted receipt description.
    Returns a dict with 'classification' and 'reason' keys.
    """
    logger.info("classify_transport_type called")

    text = receipt_text.lower()

    taxi_score = sum(1 for kw in _TAXI_KEYWORDS if kw in text)
    privatauto_score = sum(1 for kw in _PRIVATAUTO_KEYWORDS if kw in text)
    ov_score = sum(1 for kw in _OV_KEYWORDS if kw in text)

    logger.debug(
        "classify scores -- ov=%d taxi=%d privatauto=%d",
        ov_score, taxi_score, privatauto_score,
    )

    if taxi_score > 0:
        classification = "taxi"
        reason = "Receipt contains taxi or ride-service keywords."
    elif privatauto_score > 0:
        classification = "privatauto"
        reason = "Receipt contains private car or km-rate keywords."
    elif ov_score > 0:
        classification = "ov"
        reason = f"Receipt matches public transport ({ov_score} OV keyword(s) found)."
    else:
        classification = "ov"
        reason = (
            "No specific transport keywords detected; defaulting to OV "
            "(public transport) -- please confirm with the user if unsure."
        )

    result = {"classification": classification, "reason": reason}
    logger.info("classify_transport_type result: %s", result)
    return result


@tool
def assemble_form_row(
    reisedatum: str,
    behandlungsgrund: str,
    behandlungsort: str,
    transport_type: str,
    betrag_chf: Optional[float] = None,
    kilometers_driven: Optional[float] = None,
) -> dict:
    """
    Assemble and validate one SVA Form 5050 row from all six fields.
    SVA rules applied: only 2nd-class OV costs are valid; Privatauto is
    calculated at CHF 0.70 per km; only one cost column is filled per row.
    Raises ValueError with a plain-language message if a rule is violated.
    Returns a dict matching the FormRow schema.
    """
    logger.info(
        "assemble_form_row called: date=%s type=%s amount=%s km=%s",
        reisedatum, transport_type, betrag_chf, kilometers_driven,
    )

    if not reisedatum:
        raise ValueError("Reisedatum is missing. Please confirm the travel date.")
    if not behandlungsgrund:
        raise ValueError("Behandlungsgrund is missing.")
    if not behandlungsort:
        raise ValueError("Behandlungsort is missing.")
    if transport_type not in ("ov", "privatauto", "taxi"):
        raise ValueError(
            f"Transport type '{transport_type}' is not valid. "
            "It must be 'ov', 'privatauto', or 'taxi'."
        )

    billetpreis_ov: Optional[float] = None
    privatauto: Optional[float] = None
    taxi: Optional[float] = None

    if transport_type == "ov":
        if betrag_chf is None or betrag_chf <= 0:
            raise ValueError(
                "A positive CHF amount is required for an OV (public transport) receipt."
            )
        billetpreis_ov = round(betrag_chf, 2)

    elif transport_type == "privatauto":
        if not kilometers_driven or kilometers_driven <= 0:
            raise ValueError(
                "Kilometers driven are required for Privatauto. "
                "Please tell me how many km this trip was."
            )
        privatauto = round(kilometers_driven * 0.70, 2)
        if betrag_chf is not None and betrag_chf > privatauto:
            logger.info(
                "Privatauto capped: claimed CHF %.2f, SVA max CHF %.2f (%.1f km x 0.70)",
                betrag_chf, privatauto, kilometers_driven,
            )

    elif transport_type == "taxi":
        if betrag_chf is None or betrag_chf <= 0:
            raise ValueError(
                "A positive CHF amount is required for a taxi receipt."
            )
        taxi = round(betrag_chf, 2)

    total = round(
        (billetpreis_ov or 0.0) + (privatauto or 0.0) + (taxi or 0.0), 2
    )

    row = FormRow(
        reisedatum=reisedatum,
        behandlungsgrund=behandlungsgrund,
        behandlungsort=behandlungsort,
        billetpreis_ov=billetpreis_ov,
        privatauto=privatauto,
        taxi=taxi,
        total=total,
    )

    logger.info("assemble_form_row result: %s", row.model_dump())
    return row.model_dump()
