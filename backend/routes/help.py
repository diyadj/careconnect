import os
from fastapi import APIRouter, Form, HTTPException

from .invoice import (
    create_run,
    wait_for_run_completion,
    get_latest_assistant_message,
    get_thread_messages,
    extract_text_from_message,
)

# Repurpose WXO_AGENT_ID (old matching agent) as the help agent.
# Override by setting WXO_HELP_AGENT_ID in backend/.env.
WXO_HELP_AGENT_ID = (os.getenv("WXO_HELP_AGENT_ID") or os.getenv("WXO_AGENT_ID") or "").strip()

GREETING = (
    "Hello! I need help understanding SVA transport reimbursement claims "
    "and what CareConnect can help me with."
)

router = APIRouter()


@router.post("/start")
async def start_help_session():
    if not WXO_HELP_AGENT_ID:
        raise HTTPException(
            status_code=503,
            detail="No help agent configured. Set WXO_HELP_AGENT_ID (or WXO_AGENT_ID) in backend/.env.",
        )
    run = await create_run(GREETING, agent_id=WXO_HELP_AGENT_ID)
    thread_id = run.get("thread_id")
    if not thread_id:
        raise HTTPException(status_code=500, detail="Failed to start help session.")
    if run.get("run_id"):
        await wait_for_run_completion(run["run_id"])
    assistant_msg = await get_latest_assistant_message(thread_id)
    response_text = extract_text_from_message(assistant_msg) if assistant_msg else ""
    return {"session_id": thread_id, "message": response_text}


@router.post("/message")
async def send_help_message(session_id: str = Form(...), message: str = Form(...)):
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    run = await create_run(message.strip(), thread_id=session_id, agent_id=WXO_HELP_AGENT_ID)
    if run.get("run_id"):
        await wait_for_run_completion(run["run_id"])
    assistant_msg = await get_latest_assistant_message(session_id)
    response_text = extract_text_from_message(assistant_msg) if assistant_msg else ""
    return {"session_id": session_id, "message": response_text}


@router.get("/messages/{session_id}")
async def get_help_messages(session_id: str):
    raw = await get_thread_messages(session_id)
    messages = [
        {"role": m.get("role", "assistant"), "text": extract_text_from_message(m)}
        for m in raw
        if extract_text_from_message(m)
    ]
    return {"session_id": session_id, "messages": messages}
