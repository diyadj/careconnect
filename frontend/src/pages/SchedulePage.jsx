import React, { useState, useEffect } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function SchedulePage() {
  const currentYear = new Date().getFullYear();
  const generatedOn = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const [selectedDays, setSelectedDays] = useState([]);
  const [closureWeek, setClosureWeek] = useState("");
  const [closureWeeks, setClosureWeeks] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState(null);
  const [sendResult, setSendResult] = useState(null);
  const [error, setError] = useState(null);
  const [existing, setExisting] = useState(null);

  // load existing schedule on mount
  useEffect(() => {
    api.get(`/schedule/current?year=${currentYear}`)
      .then(res => {
        setExisting(res.data);
        setSelectedDays(res.data.regular_days || []);
        setClosureWeeks(res.data.closure_weeks || []);
        setNotes(res.data.notes || "");
      })
      .catch(() => {
        // no schedule yet, that's fine
      });
  }, []);

  function toggleDay(day) {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function addClosureWeek() {
    if (closureWeek && !closureWeeks.includes(closureWeek)) {
      setClosureWeeks(prev => [...prev, closureWeek]);
      setClosureWeek("");
    }
  }

  function removeClosureWeek(week) {
    setClosureWeeks(prev => prev.filter(w => w !== week));
  }

  async function handleSave() {
    if (selectedDays.length === 0) {
      setError("Please select at least one regular travel day.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setSendResult(null);

    try {
      const endpoint = existing ? "/schedule/update" : "/schedule/setup";
      const method = existing ? "patch" : "post";
      const res = await api[method](endpoint, {
        year: currentYear,
        regular_days: selectedDays,
        closure_weeks: closureWeeks,
        notes,
      });
      setResult(res.data);
      const savedSchedule = res.data.schedule || {
        year: currentYear,
        regular_days: selectedDays,
        closure_weeks: closureWeeks,
        notes,
      };
      setExisting(savedSchedule);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save the schedule.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSchedule() {
    if (!existing) {
      setError("Please save a schedule before sending it.");
      return;
    }

    setSending(true);
    setError(null);
    setSendResult(null);

    try {
      const res = await api.post("/schedule/send", { year: existing.year || currentYear });
      setSendResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to send schedule email.");
    } finally {
      setSending(false);
    }
  }

  async function handleResetSchedule() {
    const shouldReset = window.confirm(
      `Reset ${currentYear} schedule and clear this form for demo?`
    );
    if (!shouldReset) return;

    setResetting(true);
    setError(null);
    setResult(null);
    setSendResult(null);

    try {
      await api.post("/schedule/reset", { year: currentYear });
    } catch (err) {
      const statusCode = err.response?.status;
      if (statusCode !== 404) {
        setError(err.response?.data?.detail || "Failed to reset schedule.");
        return;
      }
    } finally {
      setResetting(false);
    }

    setExisting(null);
    setSelectedDays([]);
    setClosureWeek("");
    setClosureWeeks([]);
    setNotes("");
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Annual Schedule Setup</h1>
        <p className="page-subtitle">
          Set Philipp's regular transport days for {currentYear}. This schedule
          is used to cross-reference monthly invoices and calculate mileage.
        </p>
      </div>

      {existing && (
        <div className="note-banner" style={{ marginBottom: "1.5rem" }}>
          Schedule already saved for {currentYear}. You can update it below.
        </div>
      )}

      <div className="section">
        <label className="form-label">Regular travel days</label>
        <div className="chip-row">
          {DAYS.map((day) => (
            <button
              type="button"
              key={day}
              className={`chip${selectedDays.includes(day) ? " selected" : ""}`}
              onClick={() => toggleDay(day)}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <label className="form-label">
          Closure weeks (weeks where Philipp does not travel)
        </label>
        <div className="button-row" style={{ alignItems: "center" }}>
          <input
            type="date"
            value={closureWeek}
            onChange={(e) => setClosureWeek(e.target.value)}
            className="form-input"
            style={{ maxWidth: "240px" }}
          />
          <button className="btn btn-secondary" onClick={addClosureWeek}>
            Add Week
          </button>
        </div>
      </div>

      {closureWeeks.length > 0 && (
        <div className="section" style={{ marginTop: "0.5rem" }}>
          <div className="chip-row">
            {closureWeeks.map((w) => (
              <span key={w} className="tag">
                {w}
                <span
                  className="tag-action"
                  onClick={() => removeClosureWeek(w)}
                  role="button"
                  aria-label={`Remove ${w}`}
                >
                  x
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <label className="form-label">Notes (optional)</label>
        <textarea
          rows={2}
          placeholder="e.g. Summer break is weeks 31-33"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="form-textarea"
        />
      </div>

      <div className="button-row">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={loading || resetting}
        >
          {loading ? "Saving..." : existing ? "Update Schedule" : "Save Schedule"}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleResetSchedule}
          disabled={loading || sending || resetting}
        >
          {resetting ? "Resetting..." : "Reset for Demo"}
        </button>
      </div>

      {error && <StatusCard status="error" message={error} />}

      {result && (
        <StatusCard
          status="submitted"
          message={`Schedule for ${currentYear} saved. Regular days: ${selectedDays.join(", ")}`}
        />
      )}

      {existing && (
        <div className="schedule-preview">
          <div className="schedule-pdf-card">
            <div className="schedule-pdf-header">
              <div>
                <div className="schedule-pdf-kicker">PDF PREVIEW</div>
                <h3 className="schedule-preview-title">Annual Transport Schedule</h3>
              </div>
              <div className="schedule-pdf-year">{existing.year || currentYear}</div>
            </div>

            <div className="schedule-pdf-meta-grid">
              <div className="schedule-pdf-meta-item">
                <span className="schedule-preview-label">Child</span>
                <span className="schedule-preview-value">Philipp</span>
              </div>
              <div className="schedule-pdf-meta-item">
                <span className="schedule-preview-label">Prepared On</span>
                <span className="schedule-preview-value">{generatedOn}</span>
              </div>
              <div className="schedule-pdf-meta-item">
                <span className="schedule-preview-label">School Year</span>
                <span className="schedule-preview-value">{existing.year || currentYear}</span>
              </div>
            </div>

            <div className="schedule-preview-block">
              <div className="schedule-preview-label">Regular Travel Days</div>
              <div className="schedule-preview-value">
                {(existing.regular_days || []).length > 0
                  ? existing.regular_days.join(", ")
                  : "No regular days selected."}
              </div>
            </div>

            <div className="schedule-preview-block">
              <div className="schedule-preview-label">Closure Weeks</div>
              {(existing.closure_weeks || []).length > 0 ? (
                <div className="chip-row">
                  {(existing.closure_weeks || []).map((week) => (
                    <span key={week} className="tag">{week}</span>
                  ))}
                </div>
              ) : (
                <div className="schedule-preview-value">No closure weeks added.</div>
              )}
            </div>

            <div className="schedule-preview-block">
              <div className="schedule-preview-label">Notes</div>
              <div className="schedule-preview-value">{existing.notes || "No notes added."}</div>
            </div>

            <div className="schedule-pdf-footer">Prepared for transport coordination with Tixi Taxi Company.</div>
          </div>

          <div className="button-row" style={{ marginTop: "1.25rem" }}>
            <button
              className="btn btn-primary"
              onClick={handleSendSchedule}
              disabled={sending || resetting}
            >
              {sending ? "Sending..." : "Send Schedule PDF"}
            </button>
          </div>
        </div>
      )}

      {sendResult && (
        <StatusCard
          status="logged"
          message={sendResult.message || "Email has been sent."}
        />
      )}
    </div>
  );
}
