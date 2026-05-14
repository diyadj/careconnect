import React, { useState, useEffect, useRef } from "react";
import api from "../api/client";

function cleanMessage(text) {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function HelpPage() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const streamRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/help/start");
      setSessionId(res.data.session_id);
      if (res.data.message) {
        setMessages([{ role: "assistant", text: res.data.message }]);
      }
      setStarted(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to connect to help agent.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !sessionId || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("session_id", sessionId);
      form.append("message", text);
      const res = await api.post("/help/message", form);
      if (res.data.message) {
        setMessages((prev) => [...prev, { role: "assistant", text: res.data.message }]);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to send message.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSessionId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setStarted(false);
    setLoading(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Help & Guidance</h1>
        <p className="page-subtitle">
          Ask about SVA transport reimbursement, Form 5050 requirements, TixiTaxi eligibility,
          or anything CareConnect can help you manage.
        </p>
      </div>

      <div className="chat-shell">
        <div className="chat-stream" ref={streamRef}>
          {!started && (
            <div className="bubble bubble-system">
              <strong>System</strong>
              <div>
                Click <strong>Start Chat</strong> to connect to the help agent. You can ask questions like:
                <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem", lineHeight: 1.8 }}>
                  <li>Which transport costs qualify for SVA reimbursement?</li>
                  <li>How do I submit Form 5050 to SVA St.Gallen?</li>
                  <li>Does physiotherapy count as an eligible appointment?</li>
                  <li>How does TixiTaxi registration work?</li>
                </ul>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`bubble ${msg.role === "user" ? "bubble-user" : "bubble-agent"}`}>
              <strong>{msg.role === "user" ? "You" : "CareConnect Help"}</strong>
              <div style={{ whiteSpace: "pre-wrap" }}>{cleanMessage(msg.text)}</div>
            </div>
          ))}

          {loading && (
            <div className="bubble bubble-agent">
              <strong>CareConnect Help</strong>
              <div style={{ color: "var(--muted)", fontStyle: "italic" }}>Thinking…</div>
            </div>
          )}
        </div>

        {error && (
          <div className="note-banner" style={{ borderColor: "#f28b82", color: "#7c2b2b", background: "#fff1f1", margin: "0.5rem 0" }}>
            {error}
          </div>
        )}

        <div className="chat-composer">
          {started && (
            <div className="section" style={{ marginBottom: "0.75rem" }}>
              <textarea
                className="form-input"
                rows={3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about SVA requirements, eligible costs, form submission…"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>
          )}

          <div className="button-row">
            {!started ? (
              <button className="btn btn-primary" onClick={handleStart} disabled={loading}>
                {loading ? "Connecting…" : "Start Chat"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={loading || !input.trim()}
              >
                {loading ? "Sending…" : "Send"}
              </button>
            )}
            {started && (
              <button className="btn btn-secondary" onClick={handleReset} disabled={loading}>
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
