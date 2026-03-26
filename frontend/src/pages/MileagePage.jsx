import React, { useState } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

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
});

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "0.65rem",
  borderRadius: "8px",
  border: "1.5px solid #CEDBE6",
  marginTop: "0.4rem",
  marginBottom: "1rem",
  fontSize: "0.95rem",
  background: "#fff",
};

const tagStyle = {
  display: "inline-block",
  background: "#CEDBE6",
  color: "#373545",
  borderRadius: "6px",
  padding: "0.25rem 0.6rem",
  fontSize: "0.82rem",
  marginRight: "0.4rem",
  marginTop: "0.3rem",
};

export default function MileagePage() {
  const today = new Date().toISOString().split("T")[0];
  const [weekDate, setWeekDate] = useState(today);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleCheckin() {
    if (!message.trim()) {
      setError("Please describe how this week went before submitting.");
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await api.post("/mileage/checkin", {
        week_date: weekDate,
        father_message: message,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong logging your week.");
    } finally {
      setLoading(false);
    }
  }

  const parsed = result?.parsed_data;

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>
        Weekly Mileage Check-in
      </h1>
      <p style={{ color: "#7A8C8E", marginBottom: "1.8rem", fontSize: "0.95rem" }}>
        Tell the agent how this week went. It will automatically update your
        mileage log in Google Sheets.
      </p>

      <label style={{ fontWeight: "600", fontSize: "0.95rem" }}>
        Week Date
      </label>
      <input
        type="date"
        value={weekDate}
        onChange={(e) => setWeekDate(e.target.value)}
        style={inputStyle}
      />

      <label style={{ fontWeight: "600", fontSize: "0.95rem" }}>
        How did the week go?
      </label>
      <textarea
        rows={4}
        placeholder='e.g. "All good, normal week" or "Philipp was sick on Tuesday and Thursday, and I drove an extra 30km to his grandma on Saturday."'
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />

      <div style={{ color: "#7A8C8E", fontSize: "0.85rem", marginBottom: "0.8rem" }}>
        Tip: just write naturally, the agent will figure out the details.
      </div>

      <button
        style={btnStyle("#3494BA", loading)}
        onClick={handleCheckin}
        disabled={loading}
      >
        {loading ? "Logging..." : "Log This Week"}
      </button>

      {error && <StatusCard status="error" message={error} />}

      {result && parsed && (
        <StatusCard
          status="logged"
          message={`Week of ${result.week_date} has been saved to your mileage log.`}
        >
          <div style={{ marginTop: "0.8rem", fontSize: "0.9rem" }}>
            <div style={{ marginBottom: "0.4rem" }}>
              <strong>Normal schedule: </strong>
              {parsed.normal_schedule_completed ? "Yes" : "No"}
            </div>

            {parsed.sick_days?.length > 0 && (
              <div style={{ marginBottom: "0.4rem" }}>
                <strong>Sick days: </strong>
                {parsed.sick_days.map((d) => (
                  <span key={d} style={tagStyle}>{d}</span>
                ))}
              </div>
            )}

            {parsed.extra_trips?.length > 0 && (
              <div style={{ marginBottom: "0.4rem" }}>
                <strong>Extra trips: </strong>
                {parsed.extra_trips.map((t, i) => (
                  <span key={i} style={tagStyle}>
                    {t.reason} ({t.km} km)
                  </span>
                ))}
              </div>
            )}

            {parsed.notes && (
              <div style={{ marginTop: "0.4rem", color: "#7A8C8E" }}>
                {parsed.notes}
              </div>
            )}
          </div>
        </StatusCard>
      )}
    </div>
  );
}
