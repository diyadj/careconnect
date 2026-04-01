import os
import httpx
import uuid
import time
import asyncio
import json
import base64
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi import Form
from pydantic import BaseModel
from typing import Optional, Dict, List
from ibm_cloud_sdk_core.authenticators import (
    MCSPAuthenticator,
    MCSPV2Authenticator,
    IAMAuthenticator,
)

router = APIRouter()

# Pull config from environment
WXO_API_KEY = os.getenv("WXO_API_KEY")
WXO_INSTANCE_ID = os.getenv("WXO_INSTANCE_ID")
WXO_AGENT_ID = os.getenv("WXO_AGENT_ID")
WXO_REGION = os.getenv("WXO_REGION")
WXO_URL = os.getenv("WXO_URL")
WXO_AUTH_TYPE = os.getenv("WXO_AUTH_TYPE", "mcsp")
IBM_IAM_URL = os.getenv("IBM_IAM_URL", "https://iam.cloud.ibm.com")
IBM_MCSP_IAM_URL = os.getenv("IBM_MCSP_IAM_URL", "https://iam.platform.saas.ibm.com")
IBM_MCSP_V2_IAM_URL = os.getenv("IBM_MCSP_V2_IAM_URL", "https://account-iam.platform.saas.ibm.com")
MOCK_INVOICE_DIR = os.getenv("MOCK_INVOICE_DIR", str(Path(__file__).resolve().parents[1] / "mock_data" / "invoices"))

BASE_URL = "https://api.dl.watson-orchestrate.ibm.com"

# In-memory session storage (file references)
sessions_storage: Dict[str, Dict] = {}
_cached_access_token: Optional[str] = None
_cached_access_token_expiry: float = 0


def get_instance_base_url() -> str:
    if WXO_URL:
        return WXO_URL.rstrip("/")
    return f"{BASE_URL}/instances/{WXO_INSTANCE_ID}"


def get_runs_endpoint() -> str:
    return f"{get_instance_base_url()}/v1/orchestrate/runs"


def get_threads_endpoint(thread_id: str) -> str:
    return f"{get_instance_base_url()}/v1/orchestrate/threads/{thread_id}/messages"


def get_upload_endpoint() -> str:
    return f"{get_instance_base_url()}/v1/orchestrate/upload-to-s3/"


def get_upload_endpoint_candidates() -> List[str]:
    base = get_instance_base_url()
    return [
        f"{base}/v1/orchestrate/upload-to-s3/",
        f"{base}/v1/orchestrate/upload-to-s3",
        f"{base}/v1/upload-to-s3/",
        f"{base}/v1/upload-to-s3",
    ]


def load_mock_invoice_payloads() -> List[dict]:
    invoice_dir = Path(MOCK_INVOICE_DIR)
    if not invoice_dir.exists() or not invoice_dir.is_dir():
        return []

    supported_ext = {".pdf", ".png", ".jpg", ".jpeg"}
    files = [
        p for p in sorted(invoice_dir.iterdir())
        if p.is_file() and p.suffix.lower() in supported_ext
    ]
    if not files:
        return []

    tixi_candidate = next((p for p in files if any(k in p.name.lower() for k in ["tixi", "taxi", "transport"])), None)
    meal_candidate = next((p for p in files if "meal" in p.name.lower()), None)

    # Fallback: if naming is not explicit, use first two files.
    if not tixi_candidate and len(files) >= 1:
        tixi_candidate = files[0]
    if not meal_candidate and len(files) >= 2:
        meal_candidate = files[1]

    selected = []
    if tixi_candidate:
        selected.append({"path": tixi_candidate, "alias": f"TixiTaxi_Invoice{tixi_candidate.suffix.lower()}"})
    if meal_candidate and meal_candidate != tixi_candidate:
        selected.append({"path": meal_candidate, "alias": f"MealInvoice{meal_candidate.suffix.lower()}"})

    payloads = []
    for item in selected:
        payloads.append(
            {
                "filename": item["alias"],
                "source_filename": item["path"].name,
                "content": item["path"].read_bytes(),
            }
        )
    return payloads


def build_base64_attachments_block(file_payloads: List[dict]) -> str:
    payload = []
    for fp in file_payloads:
        filename = fp.get("filename", "uploaded_file")
        ext = Path(filename).suffix.lower()
        mime_type = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
        }.get(ext, "application/octet-stream")

        payload.append(
            {
                "filename": filename,
                "mime_type": mime_type,
                "content_base64": base64.b64encode(fp.get("content", b"")).decode("utf-8"),
            }
        )
    return json.dumps(payload)


async def resolve_access_token() -> str:
    """
    Resolve a bearer access token for watsonx calls.
    Accepts a direct bearer/JWT token in WXO_API_KEY, or exchanges an IBM IAM API key.
    """
    global _cached_access_token, _cached_access_token_expiry

    if not WXO_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Missing WXO_API_KEY in backend .env configuration.",
        )

    raw_secret = WXO_API_KEY.strip()

    # Accept explicit bearer token format.
    if raw_secret.lower().startswith("bearer "):
        return raw_secret.split(" ", 1)[1].strip()

    # Accept raw JWT token format.
    if raw_secret.count(".") == 2:
        return raw_secret

    # Otherwise assume API key and exchange for access token.
    now = time.time()
    if _cached_access_token and now < (_cached_access_token_expiry - 60):
        return _cached_access_token

    token_errors = []
    auth_mode = WXO_AUTH_TYPE.lower().strip()

    # MCSP environments use IBM's MCSP authenticators (same model used by orchestrate CLI).
    if auth_mode in {"mcsp", "mcsp_v1", "mcsp_v2", "auto"}:
        if auth_mode in {"mcsp", "mcsp_v1", "auto"}:
            try:
                token = MCSPAuthenticator(apikey=raw_secret, url=IBM_MCSP_IAM_URL).token_manager.get_token()
                _cached_access_token = token
                _cached_access_token_expiry = now + 3600
                return token
            except Exception as exc:  # pragma: no cover - depends on external auth service
                token_errors.append(f"MCSP v1 token error: {exc}")

        if auth_mode in {"mcsp", "mcsp_v2", "auto"}:
            try:
                token = MCSPV2Authenticator(
                    apikey=raw_secret,
                    url=IBM_MCSP_V2_IAM_URL,
                    scope_collection_type="services",
                    scope_id=WXO_INSTANCE_ID,
                ).token_manager.get_token()
                _cached_access_token = token
                _cached_access_token_expiry = now + 3600
                return token
            except Exception as exc:  # pragma: no cover - depends on external auth service
                token_errors.append(f"MCSP v2 token error: {exc}")

    # Fallback to IBM Cloud IAM for environments using classic IAM API keys.
    try:
        token = IAMAuthenticator(apikey=raw_secret, url=IBM_IAM_URL).token_manager.get_token()
        _cached_access_token = token
        _cached_access_token_expiry = now + 3600
        return token
    except Exception as exc:  # pragma: no cover - depends on external auth service
        token_errors.append(f"IAM token error: {exc}")

    raise HTTPException(
        status_code=500,
        detail="Failed to obtain access token. " + " | ".join(token_errors),
    )


async def get_auth_headers():
    token = await resolve_access_token()

    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }


def ensure_wxo_config():
    missing = []
    if not WXO_INSTANCE_ID:
        missing.append("WXO_INSTANCE_ID")
    if not WXO_AGENT_ID:
        missing.append("WXO_AGENT_ID")
    if not WXO_API_KEY:
        missing.append("WXO_API_KEY")

    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Missing watsonx configuration in backend .env: {', '.join(missing)}",
        )


def extract_user_prompt(agent_response: dict) -> Optional[dict]:
    """
    Extracts user-facing prompts from agent response.
    Filters out backend reasoning and returns only prompts requiring human interaction.
    """
    text_candidates = []

    # Legacy-style response shape support.
    output = agent_response.get("output", {}) if isinstance(agent_response, dict) else {}
    generic = output.get("generic", []) if isinstance(output, dict) else []
    for item in generic:
        text = item.get("text", "") if isinstance(item, dict) else ""
        if text:
            text_candidates.append(text)

    # Runs API response shape support.
    if isinstance(agent_response, dict):
        if isinstance(agent_response.get("message"), dict):
            content = agent_response["message"].get("content")
            if isinstance(content, str) and content.strip():
                text_candidates.append(content)

        content = agent_response.get("content")
        if isinstance(content, str) and content.strip():
            text_candidates.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    text = part.get("text") or part.get("content")
                    if isinstance(text, str) and text.strip():
                        text_candidates.append(text)

    if not text_candidates:
        return None

    user_facing_keywords = [
        "approve", "decline", "confirm", "submission",
        "would you like", "do you", "please", "ready",
        "matched", "success", "complete"
    ]

    for text in text_candidates:
        if any(keyword in text.lower() for keyword in user_facing_keywords):
            return {
                "message": text,
                "type": "user_approval",
                "requires_input": True,
            }

    # Fallback: return latest assistant text even if not an approval prompt.
    return {
        "message": text_candidates[-1],
        "type": "assistant_message",
        "requires_input": False,
    }


def extract_text_from_message(msg: dict) -> str:
    if not isinstance(msg, dict):
        return ""

    content = msg.get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                candidate = item.get("text") or item.get("content")
                if isinstance(candidate, str) and candidate.strip():
                    parts.append(candidate)
        text = "\n".join(parts)
    else:
        text = ""

    # Hide large base64 payloads from UI history.
    marker = "FILES_BASE64_JSON:"
    if marker in text:
        text = text.split(marker, 1)[0].strip() + "\n[Attached files payload omitted]"

    return text.strip()


def is_flow_start_message(text: str) -> bool:
    lowered = (text or "").lower()
    hints = [
        "a new flow has started",
        "chat session is currently dedicated to the flow",
        "will resume once the flow is complete",
        "flow has started",
    ]
    return any(hint in lowered for hint in hints)


def summarize_thread_messages(messages: List[dict]) -> List[dict]:
    summary = []
    for msg in messages:
        role = msg.get("role", "assistant") if isinstance(msg, dict) else "assistant"
        text = extract_text_from_message(msg)
        if not text:
            continue
        summary.append({"role": role, "text": text})
    return summary


def pick_latest_meaningful_prompt(messages: List[dict]) -> Optional[dict]:
    fallback_text = None
    for msg in reversed(messages):
        if not isinstance(msg, dict) or msg.get("role") != "assistant":
            continue
        text = extract_text_from_message(msg)
        if not text:
            continue
        if not is_flow_start_message(text):
            return {
                "message": text,
                "type": "user_approval" if "approve" in text.lower() else "assistant_message",
                "requires_input": "approve" in text.lower() or "upload" in text.lower(),
            }
        if fallback_text is None:
            fallback_text = text

    if fallback_text:
        return {
            "message": fallback_text,
            "type": "assistant_message",
            "requires_input": False,
        }
    return None


def determine_flow_status(user_prompt: Optional[dict], approved: Optional[bool] = None) -> str:
    if approved is False:
        return "cancelled"

    if not user_prompt:
        return "processing"

    if user_prompt.get("requires_input"):
        return "pending_approval"

    text = str(user_prompt.get("message", "")).lower()
    completion_keywords = ["submitted", "sent", "success", "completed", "all done"]
    if any(keyword in text for keyword in completion_keywords):
        return "submitted"

    return "processing"


async def upload_files_to_wxo(files_for_upload: List[dict], text: str = "") -> List[dict]:
    """Upload local files to Orchestrate storage and return file metadata URLs."""
    ensure_wxo_config()
    file_metadata = []
    multipart_files = []
    for file_item in files_for_upload:
        file_id = str(uuid.uuid4())
        filename = file_item["filename"]
        content = file_item["content"]

        file_metadata.append(
            {
                "fileName": filename,
                "invalid": False,
                "id": file_id,
                "statusCode": 200,
                "uploadStatus": "uploading",
                "url": "",
            }
        )
        multipart_files.append(("files", (filename, content, "application/octet-stream")))

    data = {
        "text": text,
        "fileMetaData": json.dumps(file_metadata),
    }

    headers = await get_auth_headers()
    headers.pop("Content-Type", None)

    last_error: Optional[str] = None
    async with httpx.AsyncClient() as client:
        for url in get_upload_endpoint_candidates():
            try:
                response = await client.post(url, data=data, files=multipart_files, headers=headers)
            except httpx.RequestError as exc:
                last_error = str(exc)
                continue

            if response.status_code in (200, 201):
                payload = response.json()
                if isinstance(payload, list):
                    return payload
                if isinstance(payload, dict):
                    return [payload]
                return []

            # Try next known path when endpoint does not exist.
            if response.status_code == 404:
                last_error = response.text
                continue

            last_error = response.text
            break

    raise HTTPException(
        status_code=500,
        detail=(
            "Failed to upload files to watsonx. "
            "No compatible upload endpoint was found for this environment. "
            f"Last error: {last_error}"
        ),
    )


async def create_run(
    message: str,
    thread_id: Optional[str] = None,
    file_urls: Optional[List[dict]] = None,
) -> dict:
    """Create an Orchestrate run and return run metadata."""
    ensure_wxo_config()
    url = get_runs_endpoint()
    payload = {
        "message": {
            "role": "user",
            "content": message,
        },
        "agent_id": WXO_AGENT_ID,
        "capture_logs": False,
    }

    if file_urls:
        context_data = []
        if message and message.strip():
            context_data.append(
                {
                    "id": str(uuid.uuid4()),
                    "response_type": "text",
                    "text": message,
                }
            )
        context_data.append(
            {
                "id": str(uuid.uuid4()),
                "files": file_urls,
                "response_type": "file_download",
            }
        )
        payload["context"] = {
            "data": context_data,
            "source": "TOOL",
        }
        payload["additional_properties"] = {}

    if thread_id:
        payload["thread_id"] = thread_id

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=payload, headers=await get_auth_headers())
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to reach watsonx service: {exc}",
            ) from exc
        if response.status_code not in (200, 201, 202):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create watsonx run: {response.text}"
            )
        return response.json()


async def get_run_status(run_id: str) -> dict:
    """Fetch Orchestrate run status by run ID."""
    ensure_wxo_config()
    url = f"{get_runs_endpoint()}/{run_id}"
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=await get_auth_headers())
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to reach watsonx service: {exc}",
            ) from exc
        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch run status: {response.text}"
            )
        return response.json()


async def wait_for_run_completion(run_id: str, timeout_seconds: int = 25) -> dict:
    """Poll run status until completion or timeout."""
    start = time.time()
    latest_status = {}
    while time.time() - start < timeout_seconds:
        latest_status = await get_run_status(run_id)
        status = str(latest_status.get("status", "")).lower()
        if status in {"completed", "failed", "cancelled"}:
            return latest_status
        await asyncio.sleep(1)
    return latest_status


async def get_latest_assistant_message(thread_id: str) -> Optional[dict]:
    """Fetch the latest assistant message from a thread."""
    ensure_wxo_config()
    url = get_threads_endpoint(thread_id)
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=await get_auth_headers())
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to reach watsonx service: {exc}",
            ) from exc
        if response.status_code != 200:
            return None

    payload = response.json()
    messages = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(messages, list):
        return None

    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "assistant":
            return msg
    return None


async def get_thread_messages(thread_id: str) -> List[dict]:
    ensure_wxo_config()
    url = get_threads_endpoint(thread_id)
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=await get_auth_headers())
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to reach watsonx service: {exc}",
            ) from exc

    if response.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Failed to fetch thread messages: {response.text}")

    payload = response.json()
    messages = payload.get("data") if isinstance(payload, dict) else payload
    return messages if isinstance(messages, list) else []


class UploadResponse(BaseModel):
    session_key: str
    tixi_filename: str
    meal_filename: str


class StartAgentRequest(BaseModel):
    session_key: Optional[str] = None


class ApprovalRequest(BaseModel):
    session_id: str
    approved: bool


class MessageRequest(BaseModel):
    session_id: str
    message: str


@router.post("/upload", response_model=UploadResponse)
async def upload_invoices(
    tixi_invoice: UploadFile = File(...),
    meal_invoice: UploadFile = File(...)
):
    """
    Upload and store invoice files for later processing.
    Returns a session_key to use when starting the agent.
    """
    session_key = str(uuid.uuid4())

    tixi_content = await tixi_invoice.read()
    meal_content = await meal_invoice.read()

    # Store file payloads in memory for Orchestrate upload-to-s3 at start.
    sessions_storage[session_key] = {
        "tixi_filename": tixi_invoice.filename,
        "meal_filename": meal_invoice.filename,
        "tixi_file_content": tixi_content,
        "meal_file_content": meal_content,
    }

    return {
        "session_key": session_key,
        "tixi_filename": tixi_invoice.filename,
        "meal_filename": meal_invoice.filename
    }


@router.post("/start")
async def start_invoice_agent(request: StartAgentRequest):
    """
    Start the watsonx agent with pre-uploaded files.
    Creates a watsonx session and initiates the matching workflow.
    """
    session_key = request.session_key or str(uuid.uuid4())

    if session_key not in sessions_storage:
        sessions_storage[session_key] = {}

    message = (
        "Let's begin the monthly invoice workflow from scratch. "
        "Please guide me step-by-step with human approvals before each major action. "
        "Ask me to upload required invoice files first, then perform matching, "
        "show me the draft email content for confirmation, and only send after I approve."
    )

    mock_file_payloads = load_mock_invoice_payloads()
    uploaded_file_urls = None
    used_mock_files = False
    mock_source_files = []
    mock_delivery_method = "none"

    if mock_file_payloads:
        used_mock_files = True
        mock_source_files = [f.get("source_filename") for f in mock_file_payloads if f.get("source_filename")]
        message = (
            "I have already scanned two invoices from the user's email inbox (mock source). "
            "Please process these provided files as: TixiTaxi_Invoice and MealInvoice, "
            "run matching, then show the draft email for my approval before sending."
        )

        try:
            uploaded_file_urls = await upload_files_to_wxo(mock_file_payloads, text="mock email invoice scan")
        except HTTPException:
            uploaded_file_urls = None

        if uploaded_file_urls:
            mock_delivery_method = "orchestrate_upload"
        else:
            mock_delivery_method = "base64_fallback"
            attachments_block = build_base64_attachments_block(mock_file_payloads)
            message = (
                f"{message}\n\n"
                "Attached files are included below as base64 payloads. "
                "Please decode and use them directly for processing. "
                "Do not ask the user to upload these files again unless decoding fails.\n"
                f"FILES_BASE64_JSON: {attachments_block}"
            )

    run_response = await create_run(message, file_urls=uploaded_file_urls)
    thread_id = run_response.get("thread_id")
    run_id = run_response.get("run_id")

    if not thread_id:
        raise HTTPException(status_code=500, detail=f"Run created without thread_id: {run_response}")

    # Wait briefly for first assistant output and then fetch thread messages.
    if run_id:
        await wait_for_run_completion(run_id)
    assistant_msg = await get_latest_assistant_message(thread_id)
    user_prompt = extract_user_prompt(assistant_msg or run_response)

    # Store thread ID with legacy key name to keep frontend contract unchanged.
    sessions_storage[session_key]["wxo_session_id"] = thread_id

    return {
        "session_key": session_key,
        "wxo_session_id": thread_id,
        "run_id": run_id,
        "user_prompt": user_prompt,
        "status": determine_flow_status(user_prompt),
        "mock_mode": used_mock_files,
        "mock_source_files": mock_source_files,
        "mock_delivery_method": mock_delivery_method,
    }


@router.post("/approve")
async def approve_submission(request: ApprovalRequest):
    """
    Send approval/rejection to the watsonx agent.
    Returns only user-facing prompts for next steps.
    """
    decision = "Approve" if request.approved else "Cancel"

    run_response = await create_run(decision, thread_id=request.session_id)
    run_id = run_response.get("run_id")
    if run_id:
        await wait_for_run_completion(run_id)
    assistant_msg = await get_latest_assistant_message(request.session_id)
    user_prompt = extract_user_prompt(assistant_msg or run_response)

    return {
        "session_id": request.session_id,
        "run_id": run_id,
        "approved": request.approved,
        "user_prompt": user_prompt,
        "status": determine_flow_status(user_prompt, approved=request.approved),
    }


@router.post("/message")
async def send_invoice_message(
    session_id: str = Form(...),
    message: str = Form(""),
    files: Optional[List[UploadFile]] = File(None),
):
    """
    Continue an existing invoice agent thread with a custom message and optional file uploads.
    """
    normalized_message = (message or "").strip()
    if not normalized_message and not files:
        raise HTTPException(status_code=400, detail="Please provide a message or at least one file.")

    uploaded_file_urls = None
    fallback_message_parts = []
    if files:
        file_payloads = []
        for f in files:
            file_bytes = await f.read()
            file_payloads.append(
                {
                    "filename": f.filename or "uploaded_file",
                    "content": file_bytes,
                }
            )
            fallback_message_parts.append({
                "filename": f.filename or "uploaded_file",
                "content": file_bytes,
            })

        try:
            uploaded_file_urls = await upload_files_to_wxo(file_payloads, text="invoice follow-up upload")
        except HTTPException:
            # Fallback for tenants where upload-to-s3 endpoint is unavailable.
            uploaded_file_urls = None

    if fallback_message_parts and not uploaded_file_urls:
        attachments_block = build_base64_attachments_block(fallback_message_parts)
        normalized_message = (
            f"{normalized_message}\n\n"
            "Attached files are included below as base64 payloads. "
            "Please decode and use them directly for processing.\n"
            f"FILES_BASE64_JSON: {attachments_block}"
        ).strip()

    run_response = await create_run(
        normalized_message,
        thread_id=session_id,
        file_urls=uploaded_file_urls,
    )
    run_id = run_response.get("run_id")
    if run_id:
        await wait_for_run_completion(run_id)

    assistant_msg = await get_latest_assistant_message(session_id)
    user_prompt = extract_user_prompt(assistant_msg or run_response)

    return {
        "session_id": session_id,
        "run_id": run_id,
        "user_prompt": user_prompt,
        "status": determine_flow_status(user_prompt),
    }


@router.get("/messages/{session_id}")
async def get_invoice_messages(session_id: str):
    """Get thread message history and best current prompt for UI polling."""
    messages = await get_thread_messages(session_id)
    user_prompt = pick_latest_meaningful_prompt(messages)
    return {
        "session_id": session_id,
        "messages": summarize_thread_messages(messages),
        "user_prompt": user_prompt,
        "status": determine_flow_status(user_prompt),
    }
