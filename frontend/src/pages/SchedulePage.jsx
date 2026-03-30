import React, { useState, useEffect } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function SchedulePage() {
  const currentYear = new Date().getFullYear();
  const [selectedDays, setSelectedDays] = useState([]);
  const [closureWeek, setClosureWeek] = useState("");
  const [closureWeeks, setClosureWeeks] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
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
      setExisting(res.data.schedule || res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save the schedule.");
    } finally {
      setLoading(false);
    }
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
          disabled={loading}
        >
          {loading ? "Saving..." : existing ? "Update Schedule" : "Save Schedule"}
        </button>
      </div>

      {error && <StatusCard status="error" message={error} />}

      {result && (
        <StatusCard
          status="submitted"
          message={`Schedule for ${currentYear} saved. Regular days: ${selectedDays.join(", ")}`}
        />
      )}
    </div>
  );
}
