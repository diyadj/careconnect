import React, { useState, useEffect, useRef } from "react";
import api from "../api/client";

function cleanMessage(text) {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SUGGESTIONS = [
  "Which transport costs qualify for SVA reimbursement?",
  "How do I submit Form 5050 to SVA St.Gallen?",
  "Does physiotherapy count as an eligible appointment?",
  "How does TixiTaxi booking work?",
];

export default function HelpPage() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bonusOpen, setBonusOpen] = useState(false);
  const streamRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend(overrideText) {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    setError(null);
    try {
      let sid = sessionId;
      if (!sid) {
        const startRes = await api.post("/help/start");
        sid = startRes.data.session_id;
        setSessionId(sid);
      }
      const form = new FormData();
      form.append("session_id", sid);
      form.append("message", text);
      const res = await api.post("/help/message", form);
      if (res.data.message) {
        setMessages((prev) => [...prev, { role: "assistant", text: res.data.message }]);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to reach the help agent.");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleReset() {
    setSessionId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setLoading(false);
    textareaRef.current?.focus();
  }

  return (
    <div className="page" style={{ position: "relative" }}>
      {/* Diya's Bonus Task side pop-up */}
      <div
        style={{
          position: "fixed",
          left: "2rem",
          top: "94px",
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
        }}
      >
        <button
          onClick={() => setBonusOpen((o) => !o)}
          style={{
            background: "var(--primary)",
            color: "white",
            border: "none",
            borderRadius: bonusOpen ? "0 0 0 0" : "0 0 12px 12px",
            padding: "0.5rem 1.1rem",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "0.85rem",
            letterSpacing: "0.05em",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            whiteSpace: "nowrap",
          }}
          title={bonusOpen ? "Close" : "Diya's Bonus Task"}
        >
          Diya's Bonus Task
        </button>
        {bonusOpen && (
          <div
            style={{
              background: "white",
              border: "1px solid var(--border)",
              borderTop: "none",
              borderRadius: "0 0 12px 12px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              padding: "1.25rem 1.5rem",
              width: "260px",
              fontSize: "0.9rem",
              color: "var(--ink)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.75rem", color: "var(--primary)" }}>
              Diya's Bonus Task
            </div>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              This Help &amp; Guidance page is powered by a multi-turn AI help agent
              backed by a knowledge base of SVA transport rules and CareConnect policies.
              It supports contextual follow-up questions across the session.
            </p>
          </div>
        )}
      </div>

      <div className="page-header">
        <h1 className="page-title">Help & Guidance</h1>
        <p className="page-subtitle">
          Ask about SVA transport reimbursement, Form 5050 requirements, TixiTaxi eligibility,
          or anything CareConnect can help you manage.
        </p>
      </div>

      <div className="chat-shell">
        <div className="chat-stream" ref={streamRef}>
          {messages.length === 0 && !loading && (
            <div className="bubble bubble-system">
              <strong>Suggestions</strong>
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="btn btn-secondary"
                    style={{ textAlign: "left", fontWeight: 400, fontSize: "0.875rem" }}
                    onClick={() => handleSend(s)}
                    disabled={loading}
                  >
                    {s}
                  </button>
                ))}
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
          <div className="section" style={{ marginBottom: "0.75rem" }}>
            <textarea
              ref={textareaRef}
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

          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
            >
              {loading ? "Sending…" : "Send"}
            </button>
            {messages.length > 0 && (
              <button className="btn btn-secondary" onClick={handleReset} disabled={loading}>
                New conversation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
