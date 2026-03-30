import os
import httpx
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict

router = APIRouter()

# Pull config from environment
WXO_API_KEY = os.getenv("WXO_API_KEY")
WXO_INSTANCE_ID = os.getenv("WXO_INSTANCE_ID")
WXO_AGENT_ID = os.getenv("WXO_AGENT_ID")
WXO_REGION = os.getenv("WXO_REGION", "us-south")

BASE_URL = "https://api.dl.watson-orchestrate.ibm.com"

# In-memory session storage (file references)
sessions_storage: Dict[str, Dict] = {}


def get_auth_headers():
    return {
        "Content-Type": "application/json",
        "Authorization": WXO_API_KEY,
    }


def extract_user_prompt(agent_response: dict) -> Optional[dict]:
    """
    Extracts user-facing prompts from agent response.
    Filters out backend reasoning and returns only prompts requiring human interaction.
    """
    output = agent_response.get("output", {})
    generic = output.get("generic", [])

    if not generic:
        return None

    # Keywords indicating user-facing prompts (human-in-the-loop)
    user_facing_keywords = [
        "approve", "decline", "confirm", "submission",
        "would you like", "do you", "please", "ready",
        "matched", "success", "complete"
    ]

    for item in generic:
        text = item.get("text", "")
        text_lower = text.lower()

        # Check if this message requires user interaction
        if any(keyword in text_lower for keyword in user_facing_keywords):
            return {
                "message": text,
                "type": "user_approval",
                "requires_input": True
            }

    return None


async def create_session() -> str:
    """Start a new watsonx agent session and return the session ID."""
    url = f"{BASE_URL}/instances/{WXO_INSTANCE_ID}/v2/assistants/{WXO_AGENT_ID}/sessions"
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=get_auth_headers())
        if response.status_code != 201:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create watsonx session: {response.text}"
            )
        return response.json()["session_id"]


async def send_message(session_id: str, message: str) -> dict:
    """Send a message to the watsonx agent and return its response."""
    url = (
        f"{BASE_URL}/instances/{WXO_INSTANCE_ID}/v2/assistants/"
        f"{WXO_AGENT_ID}/sessions/{session_id}/message"
    )
    payload = {
        "input": {
            "message_type": "text",
            "text": message
        }
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=get_auth_headers())
        if response.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"watsonx agent error: {response.text}"
            )
        return response.json()


class UploadResponse(BaseModel):
    session_key: str
    tixi_filename: str
    meal_filename: str


class StartAgentRequest(BaseModel):
    session_key: str


class ApprovalRequest(BaseModel):
    session_id: str
    approved: bool


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

    # Store file references in memory
    sessions_storage[session_key] = {
        "tixi_filename": tixi_invoice.filename,
        "meal_filename": meal_invoice.filename,
        "tixi_file": tixi_invoice,
        "meal_file": meal_invoice
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
    session_key = request.session_key

    if session_key not in sessions_storage:
        raise HTTPException(status_code=404, detail="Session key not found. Please upload files first.")

    file_info = sessions_storage[session_key]
    tixi_name = file_info["tixi_filename"]
    meal_name = file_info["meal_filename"]

    # Create watsonx session
    wxo_session_id = await create_session()

    # Initiate agent with file references
    message = (
        f"I have uploaded two invoices for processing: "
        f"'{tixi_name}' (Tixi-Taxi transport) and '{meal_name}' (meal expenses). "
        f"Please match these invoices for March 2026 and prepare a submission to the IV."
    )

    agent_response = await send_message(wxo_session_id, message)
    user_prompt = extract_user_prompt(agent_response)

    # Store the wxo session with the session key for later use
    sessions_storage[session_key]["wxo_session_id"] = wxo_session_id

    return {
        "session_key": session_key,
        "wxo_session_id": wxo_session_id,
        "user_prompt": user_prompt,
        "status": "pending_approval" if user_prompt else "processing"
    }


@router.post("/approve")
async def approve_submission(request: ApprovalRequest):
    """
    Send approval/rejection to the watsonx agent.
    Returns only user-facing prompts for next steps.
    """
    decision = "Approve" if request.approved else "Cancel"

    agent_response = await send_message(request.session_id, decision)
    user_prompt = extract_user_prompt(agent_response)

    return {
        "session_id": request.session_id,
        "approved": request.approved,
        "user_prompt": user_prompt,
        "status": "submitted" if request.approved else "cancelled"
    }
