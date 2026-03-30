import React, { useState, useEffect } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const btnStyle = (color = "#3494BA", disabled = false) => ({
  background: disabled ? "#CEDBE6" : color,
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  padding: "0.7rem 1.4rem",
  fontWeight: "600",
  fontSize: "0.95rem",
  cursor: disabled ? "not-allowed" : "pointer",
  marginTop: "0.5rem",
  marginRight: "0.5rem",
});

const checkboxRow = {
  display: "flex",
  gap: "0.8rem",
  flexWrap: "wrap",
  marginTop: "0.5rem",
  marginBottom: "1rem",
};

const dayChip = (selected) => ({
  padding: "0.4rem 0.9rem",
  borderRadius: "20px",
  border: `1.5px solid ${selected ? "#3494BA" : "#CEDBE6"}`,
  background: selected ? "#3494BA" : "#fff",
  color: selected ? "#fff" : "#373545",
  cursor: "pointer",
  fontSize: "0.9rem",
  fontWeight: selected ? "600" : "400",
  userSelect: "none",
});

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "0.6rem",
  borderRadius: "8px",
  border: "1.5px solid #CEDBE6",
  marginTop: "0.4rem",
  marginBottom: "1rem",
  fontSize: "0.95rem",
  background: "#fff",
};

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
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>
        Annual Schedule Setup
      </h1>
      <p style={{ color: "#7A8C8E", marginBottom: "1.8rem", fontSize: "0.95rem" }}>
        Set Philipp's regular transport days for {currentYear}. This schedule
        is used to cross-reference monthly invoices and calculate mileage.
      </p>

      {existing && (
        <div style={{
          background: "#E8F5E9", border: "1.5px solid #75BDA7",
          borderRadius: "8px", padding: "0.8rem 1rem", marginBottom: "1.5rem",
          fontSize: "0.9rem", color: "#1B5E20"
        }}>
          Schedule already saved for {currentYear}. You can update it below.
        </div>
      )}

      <label style={{ fontWeight: "600", fontSize: "0.95rem" }}>
        Regular travel days
      </label>
      <div style={checkboxRow}>
        {DAYS.map(day => (
          <span
            key={day}
            style={dayChip(selectedDays.includes(day))}
            onClick={() => toggleDay(day)}
          >
            {day}
          </span>
        ))}
      </div>

      <label style={{ fontWeight: "600", fontSize: "0.95rem" }}>
        Closure weeks (weeks where Philipp does not travel)
      </label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="date"
          value={closureWeek}
          onChange={e => setClosureWeek(e.target.value)}
          style={{ ...inputStyle, width: "auto", marginBottom: 0 }}
        />
        <button style={btnStyle("#58B6C0")} onClick={addClosureWeek}>
          Add Week
        </button>
      </div>

      {closureWeeks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", margin: "0.8rem 0" }}>
          {closureWeeks.map(w => (
            <span key={w} style={{
              background: "#CEDBE6", borderRadius: "6px",
              padding: "0.25rem 0.6rem", fontSize: "0.85rem",
              display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              {w}
              <span
                onClick={() => removeClosureWeek(w)}
                style={{ cursor: "pointer", fontWeight: "700", color: "#7A8C8E" }}
              >
                x
              </span>
            </span>
          ))}
        </div>
      )}

      <label style={{ fontWeight: "600", fontSize: "0.95rem", marginTop: "0.5rem", display: "block" }}>
        Notes (optional)
      </label>
      <textarea
        rows={2}
        placeholder="e.g. Summer break is weeks 31-33"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />

      <button
        style={btnStyle("#3494BA", loading)}
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? "Saving..." : existing ? "Update Schedule" : "Save Schedule"}
      </button>

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
