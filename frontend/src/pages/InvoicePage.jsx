import React, { useState } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

export default function InvoicePage() {
  const [loading, setLoading] = useState(false);
  const [sessionKey, setSessionKey] = useState(null);
  const [wxoSessionId, setWxoSessionId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [stage, setStage] = useState("ready"); // "ready" | "review" | "complete"

  async function handleStartAgent() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post("/invoice/start", sessionKey ? { session_key: sessionKey } : {});
      setSessionKey(res.data.session_key || sessionKey);
      setWxoSessionId(res.data.wxo_session_id);
      setResult(res.data);
      if (res.data.status === "pending_approval") {
        setStage("review");
      } else if (res.data.status === "submitted") {
        setStage("complete");
      } else {
        setStage("review");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to start agent.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approved) {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post("/invoice/approve", {
        session_id: wxoSessionId,
        approved,
      });
      setResult(res.data);
      if (res.data.status === "pending_approval") {
        setStage("review");
      } else if (res.data.status === "submitted") {
        setStage("complete");
      } else if (res.data.status === "cancelled") {
        setStage("cancelled");
      } else {
        setStage("review");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Approval failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage(overrideMessage = null) {
    if (!wxoSessionId) {
      setError("No active agent session found. Start the agent first.");
      return;
    }

    const messageToSend = (overrideMessage ?? messageInput).trim();
    if (!messageToSend && selectedFiles.length === 0) {
      setError("Type a message or attach files before sending.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("session_id", wxoSessionId);
      form.append("message", messageToSend);
      selectedFiles.forEach((file) => {
        form.append("files", file);
      });

      const res = await api.post("/invoice/message", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResult(res.data);
      setMessageInput("");
      setSelectedFiles([]);

      if (res.data.status === "submitted") {
        setStage("complete");
      } else if (res.data.status === "cancelled") {
        setStage("cancelled");
      } else {
        setStage("review");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to send message.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSessionKey(null);
    setWxoSessionId(null);
    setResult(null);
    setError(null);
    setMessageInput("");
    setSelectedFiles([]);
    setStage("ready");
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Invoice Matching</h1>
        <p className="page-subtitle">
          Start the invoice workflow with the agent. It will guide you through
          each step and request confirmations before submission.
        </p>
      </div>

      {/* READY TO START AGENT */}
      {stage === "ready" && (
        <StatusCard status="success" message="Ready to start invoice workflow.">
          <p className="text-sm mb-4">
            Click Start Agent and follow the prompts from your configured agent workflow.
          </p>
          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={handleStartAgent}
              disabled={loading}
            >
              {loading ? "Starting Agent..." : "Start Agent"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </StatusCard>
      )}

      {/* REVIEW STAGE - User Approval */}
      {stage === "review" && result?.user_prompt && (
        <StatusCard status="pending_approval" message={result.user_prompt.message}>
          <div className="section">
            <label className="form-label">Your reply to agent</label>
            <textarea
              className="form-input"
              rows={4}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type instructions, approval text, or additional details..."
              disabled={loading}
            />
          </div>

          <div className="section">
            <label className="form-label">Attach files (optional)</label>
            <input
              type="file"
              className="form-input"
              multiple
              onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
              disabled={loading}
            />
            {selectedFiles.length > 0 && (
              <p className="text-sm text-gray-600">
                {selectedFiles.length} file(s) selected: {selectedFiles.map((f) => f.name).join(", ")}
              </p>
            )}
          </div>

          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={() => handleSendMessage()}
              disabled={loading}
            >
              {loading ? "Processing..." : "Send To Agent"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleSendMessage("Cancel")}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleSendMessage("Approve")}
              disabled={loading}
            >
              Quick Approve
            </button>
          </div>
        </StatusCard>
      )}

      {/* COMPLETE STAGE */}
      {stage === "complete" && (
        <StatusCard
          status="submitted"
          message="Invoices successfully submitted to the IV. You are all done for this month."
        >
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleReset}>
              Start New Submission
            </button>
          </div>
        </StatusCard>
      )}

      {/* CANCELLED STAGE */}
      {stage === "cancelled" && (
        <StatusCard
          status="cancelled"
          message="Submission cancelled. You can re-upload and try again."
        >
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleReset}>
              Start Over
            </button>
          </div>
        </StatusCard>
      )}

      {/* ERROR MESSAGE */}
      {error && <StatusCard status="error" message={error} />}
    </div>
  );
}
