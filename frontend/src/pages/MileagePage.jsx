import React, { useState } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

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
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Weekly Mileage Check-in</h1>
        <p className="page-subtitle">
          Tell the agent how this week went. It will automatically update your
          mileage log in Google Sheets.
        </p>
      </div>

      <div className="section">
        <label className="form-label">Week Date</label>
        <input
          type="date"
          value={weekDate}
          onChange={(e) => setWeekDate(e.target.value)}
          className="form-input"
        />
      </div>

      <div className="section">
        <label className="form-label">How did the week go?</label>
        <textarea
          rows={4}
          placeholder='e.g. "All good, normal week" or "Philipp was sick on Tuesday and Thursday, and I drove an extra 30km to his grandma on Saturday."'
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="form-textarea"
        />
        <div className="form-helper">
          Tip: just write naturally, the agent will figure out the details.
        </div>
      </div>

      <div className="button-row">
        <button
          className="btn btn-muted"
          disabled
        >
          Log This Week
        </button>
        <span className="coming-soon-label">Coming soon (Milestone 2 feature).</span>
      </div>

      {error && <StatusCard status="error" message={error} />}

      {result && parsed && (
        <StatusCard
          status="logged"
          message={`Week of ${result.week_date} has been saved to your mileage log.`}
        >
          <div className="section">
            <div style={{ marginBottom: "0.4rem" }}>
              <strong>Normal schedule: </strong>
              {parsed.normal_schedule_completed ? "Yes" : "No"}
            </div>

            {parsed.sick_days?.length > 0 && (
              <div style={{ marginBottom: "0.4rem" }}>
                <strong>Sick days: </strong>
                {parsed.sick_days.map((d) => (
                  <span key={d} className="tag">{d}</span>
                ))}
              </div>
            )}

            {parsed.extra_trips?.length > 0 && (
              <div style={{ marginBottom: "0.4rem" }}>
                <strong>Extra trips: </strong>
                {parsed.extra_trips.map((t, i) => (
                  <span key={i} className="tag">
                    {t.reason} ({t.km} km)
                  </span>
                ))}
              </div>
            )}

            {parsed.notes && (
              <div className="form-helper">{parsed.notes}</div>
            )}
          </div>
        </StatusCard>
      )}
    </div>
  );
}
