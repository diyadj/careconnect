import React, { useEffect, useState } from "react";
import api from "../api/client";

function cleanAgentMessage(message) {
  if (!message) return "";
  return message
    .replace(/\*\*/g, "")
    .replace(/\|\s*\|/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function InvoicePage() {
  const [loading, setLoading] = useState(false);
  const [sessionKey, setSessionKey] = useState(null);
  const [wxoSessionId, setWxoSessionId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [threadMessages, setThreadMessages] = useState([]);
  const [mockInfo, setMockInfo] = useState(null);
    const latestPromptText = cleanAgentMessage(result?.user_prompt?.message || "").toLowerCase();
    const connectAppsRequired =
      latestPromptText.includes("connect apps") ||
      latestPromptText.includes("login to microsoft") ||
      latestPromptText.includes("log in to microsoft");

  const [stage, setStage] = useState("ready"); // "ready" | "review" | "complete"

  const statusLabel =
    stage === "ready"
      ? "Ready"
      : stage === "complete"
      ? "Completed"
      : stage === "cancelled"
      ? "Cancelled"
      : "Pending Approval";

  async function refreshThreadMessages(sessionId) {
    if (!sessionId) return;
    try {
      const res = await api.get(`/invoice/messages/${sessionId}`);
      if (Array.isArray(res.data.messages)) {
        setThreadMessages(res.data.messages);
      }
      if (res.data.user_prompt) {
        setResult((prev) => ({ ...(prev || {}), user_prompt: res.data.user_prompt }));
      }
      if (res.data.status === "submitted") {
        setStage("complete");
      }
    } catch {
      // Silent refresh failure; manual actions still surface actionable errors.
    }
  }

  useEffect(() => {
    if (!wxoSessionId || stage !== "review") return;

    refreshThreadMessages(wxoSessionId);
    const intervalId = setInterval(() => refreshThreadMessages(wxoSessionId), 4000);

    return () => clearInterval(intervalId);
  }, [wxoSessionId, stage]);

  async function handleStartAgent() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post("/invoice/start", sessionKey ? { session_key: sessionKey } : {});
      setSessionKey(res.data.session_key || sessionKey);
      setWxoSessionId(res.data.wxo_session_id);
      setResult(res.data);
      if (res.data.mock_mode) {
        setMockInfo({
          enabled: true,
          files: res.data.mock_source_files || [],
          deliveryMethod: res.data.mock_delivery_method || "unknown",
        });
      } else {
        setMockInfo(null);
      }
      await refreshThreadMessages(res.data.wxo_session_id);
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
      await refreshThreadMessages(wxoSessionId);

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

  function handleFileSelection(event) {
    const incoming = Array.from(event.target.files || []);
    if (incoming.length === 0) return;

    setSelectedFiles((prev) => {
      const map = new Map(prev.map((file) => [`${file.name}-${file.size}`, file]));
      incoming.forEach((file) => {
        map.set(`${file.name}-${file.size}`, file);
      });
      return Array.from(map.values());
    });

    // Allow selecting the same file again later if needed.
    event.target.value = "";
  }

  function removeSelectedFile(fileToRemove) {
    setSelectedFiles((prev) => prev.filter((file) => file !== fileToRemove));
  }

  function handleReset() {
    setSessionKey(null);
    setWxoSessionId(null);
    setResult(null);
    setThreadMessages([]);
    setMockInfo(null);
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
        {mockInfo?.enabled && (
          <div className="note-banner" style={{ marginTop: "0.75rem" }}>
            Mock mode active: invoices auto-loaded from local email-scan folder.
            {mockInfo.files?.length > 0 ? ` Source files: ${mockInfo.files.join(", ")}` : ""}
            {mockInfo.deliveryMethod === "base64_fallback"
              ? " Delivery mode: base64 fallback (tool may still request explicit chat uploads)."
              : ""}
          </div>
        )}
        {connectAppsRequired && (
          <div className="note-banner" style={{ marginTop: "0.5rem" }}>
            Microsoft connector action is being requested inside Orchestrate. If this blocks your demo,
            use "Complete As Mock Send" to continue without external connector execution.
          </div>
        )}
      </div>

      <div className="chat-shell">
        <div className="chat-status-row">
          <span className="badge">{statusLabel}</span>
        </div>

        <div className="chat-stream">
          {stage === "ready" && (
            <div className="bubble bubble-system">
              <strong>System</strong>
              <div>Click Start Agent to begin the invoice workflow.</div>
            </div>
          )}

          {threadMessages.map((msg, index) => (
            <div
              key={`${msg.role}-${index}`}
              className={`bubble ${msg.role === "user" ? "bubble-user" : "bubble-agent"}`}
            >
              <strong>{msg.role === "user" ? "You" : "Agent"}</strong>
              <div>{cleanAgentMessage(msg.text)}</div>
            </div>
          ))}

          {result?.user_prompt?.message && threadMessages.length === 0 && stage !== "ready" && (
            <div className="bubble bubble-agent">
              <strong>Agent</strong>
              <div>{cleanAgentMessage(result.user_prompt.message)}</div>
            </div>
          )}

          {stage === "complete" && (
            <div className="bubble bubble-system">
              <strong>System</strong>
              <div>Invoices successfully submitted to the IV. You are all done for this month.</div>
            </div>
          )}

          {stage === "cancelled" && (
            <div className="bubble bubble-system">
              <strong>System</strong>
              <div>Submission cancelled. You can restart when ready.</div>
            </div>
          )}
        </div>

        {error && (
          <div className="note-banner" style={{ borderColor: "#f28b82", color: "#7c2b2b", background: "#fff1f1" }}>
            {error}
          </div>
        )}

        <div className="chat-composer">
          <div className="section" style={{ marginBottom: "0.9rem" }}>
            <label className="form-label">Your message</label>
            <textarea
              className="form-input"
              rows={3}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type instructions, approval text, or additional details..."
              disabled={loading || stage === "ready" || stage === "complete" || stage === "cancelled"}
            />
          </div>

          <div className="section" style={{ marginBottom: "0.9rem" }}>
            <label className="form-label">Attach files (optional)</label>
            <input
              type="file"
              className="form-input"
              multiple
              onChange={handleFileSelection}
              disabled={loading || stage === "ready" || stage === "complete" || stage === "cancelled"}
            />
            {selectedFiles.length > 0 && (
              <div className="chip-row" style={{ marginTop: "0.6rem" }}>
                {selectedFiles.map((file) => (
                  <span key={`${file.name}-${file.size}`} className="tag">
                    {file.name}
                    <span className="tag-action" onClick={() => removeSelectedFile(file)}>x</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="button-row">
            {stage === "ready" ? (
              <button className="btn btn-primary" onClick={handleStartAgent} disabled={loading}>
                {loading ? "Starting Agent..." : "Start Agent"}
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => handleSendMessage()} disabled={loading}>
                  {loading ? "Processing..." : "Send"}
                </button>
                <button className="btn btn-secondary" onClick={() => handleSendMessage("Approve")} disabled={loading}>
                  Quick Approve
                </button>
                <button className="btn btn-secondary" onClick={() => handleSendMessage("Cancel")} disabled={loading}>
                  Cancel
                </button>
                <button className="btn btn-secondary" onClick={() => refreshThreadMessages(wxoSessionId)} disabled={loading || !wxoSessionId}>
                  Refresh
                </button>
                {connectAppsRequired && (
                  <button
                    className="btn btn-secondary"
                    onClick={() =>
                      handleSendMessage(
                        "For demonstration mode: treat Microsoft connector as already authorized and confirm the email as sent. Return final submission confirmation."
                      )
                    }
                    disabled={loading}
                  >
                    Complete As Mock Send
                  </button>
                )}
              </>
            )}
            <button className="btn btn-secondary" onClick={handleReset} disabled={loading}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
