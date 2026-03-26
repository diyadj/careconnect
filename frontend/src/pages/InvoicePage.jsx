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
  marginRight: "0.7rem",
  marginTop: "0.5rem",
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

export default function InvoicePage() {
  const [tixiFile, setTixiFile] = useState(null);
  const [mealFile, setMealFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleRunAgent() {
    if (!tixiFile || !mealFile) {
      setError("Please upload both invoice files before running the agent.");
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);

    const form = new FormData();
    form.append("tixi_invoice", tixiFile);
    form.append("meal_invoice", mealFile);

    try {
      const res = await api.post("/invoice/run", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong calling the agent.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approved) {
    setLoading(true);
    try {
      const res = await api.post("/invoice/approve", {
        session_id: result.session_id,
        approved,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Approval failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.3rem" }}>
        Invoice Matching
      </h1>
      <p style={{ color: "#7A8C8E", marginBottom: "1.8rem", fontSize: "0.95rem" }}>
        Upload your Tixi-Taxi and day center meal invoices. The agent will match
        them and prepare the submission for your approval.
      </p>

      <label style={{ fontWeight: "600", fontSize: "0.95rem" }}>
        Tixi-Taxi Invoice (PDF)
      </label>
      <input
        type="file"
        accept=".pdf"
        style={inputStyle}
        onChange={(e) => setTixiFile(e.target.files[0])}
      />

      <label style={{ fontWeight: "600", fontSize: "0.95rem" }}>
        Meal Invoice (PDF)
      </label>
      <input
        type="file"
        accept=".pdf"
        style={inputStyle}
        onChange={(e) => setMealFile(e.target.files[0])}
      />

      <button
        style={btnStyle("#3494BA", loading)}
        onClick={handleRunAgent}
        disabled={loading}
      >
        {loading ? "Running Agent..." : "Run Invoice Agent"}
      </button>

      {error && (
        <StatusCard status="error" message={error} />
      )}

      {result && result.status === "pending_approval" && (
        <StatusCard
          status="pending_approval"
          message="The agent has matched both invoices. Review and approve to submit."
        >
          <div style={{ marginTop: "0.8rem" }}>
            <button
              style={btnStyle("#75BDA7", loading)}
              onClick={() => handleApproval(true)}
              disabled={loading}
            >
              Approve and Submit
            </button>
            <button
              style={btnStyle("#7A8C8E", loading)}
              onClick={() => handleApproval(false)}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </StatusCard>
      )}

      {result && result.status === "submitted" && (
        <StatusCard
          status="submitted"
          message="Invoices successfully submitted to the IV. You are all done for this month."
        />
      )}

      {result && result.status === "cancelled" && (
        <StatusCard
          status="cancelled"
          message="Submission cancelled. You can re-upload and try again."
        />
      )}
    </div>
  );
}
