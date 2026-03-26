import os
import httpx
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Pull config from environment
WXO_API_KEY = os.getenv("WXO_API_KEY")
WXO_INSTANCE_ID = os.getenv("WXO_INSTANCE_ID")
WXO_AGENT_ID = os.getenv("WXO_AGENT_ID")
WXO_REGION = os.getenv("WXO_REGION", "us-south")

BASE_URL = f"https://api.{WXO_REGION}.assistant.watson.cloud.ibm.com"


def get_auth_headers():
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {WXO_API_KEY}",
    }


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


class ApprovalRequest(BaseModel):
    session_id: str
    approved: bool


@router.post("/run")
async def run_invoice_agent(
    tixi_invoice: UploadFile = File(...),
    meal_invoice: UploadFile = File(...)
):
    """
    Accepts two invoice PDFs, creates a watsonx session, and triggers the
    invoice matching workflow. Returns the agent response and session ID so
    the frontend can later send an approval.
    """
    # Read file names to pass context to the agent
    tixi_name = tixi_invoice.filename
    meal_name = meal_invoice.filename

    # TODO: In a real setup you would upload the PDFs to watsonx via the
    # IDP pipeline or store them temporarily and pass a reference.
    # For now we send the file names as context so you can test the flow.
    session_id = await create_session()

    message = (
        f"I have two invoices to process: "
        f"Tixi-Taxi invoice '{tixi_name}' and meal invoice '{meal_name}'. "
        f"Please match them and prepare a submission package."
    )

    agent_response = await send_message(session_id, message)

    return {
        "session_id": session_id,
        "agent_response": agent_response,
        "status": "pending_approval"
    }


@router.post("/approve")
async def approve_submission(request: ApprovalRequest):
    """
    Sends the father's approval (or rejection) back to the watsonx agent
    so it can proceed with or cancel the submission.
    """
    decision = "Approved. Please proceed with the submission." if request.approved \
        else "Rejected. Please cancel the submission."

    agent_response = await send_message(request.session_id, decision)

    return {
        "session_id": request.session_id,
        "approved": request.approved,
        "agent_response": agent_response,
        "status": "submitted" if request.approved else "cancelled"
    }
