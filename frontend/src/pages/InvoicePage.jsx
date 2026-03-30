import React, { useState } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

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
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Invoice Matching</h1>
        <p className="page-subtitle">
          Upload your Tixi-Taxi and day center meal invoices. The agent will
          match them and prepare the submission for your approval.
        </p>
      </div>

      <div className="section">
        <label className="form-label">Tixi-Taxi Invoice (PDF)</label>
        <input
          type="file"
          accept=".pdf"
          className="form-input"
          onChange={(e) => setTixiFile(e.target.files[0])}
        />
      </div>

      <div className="section">
        <label className="form-label">Meal Invoice (PDF)</label>
        <input
          type="file"
          accept=".pdf"
          className="form-input"
          onChange={(e) => setMealFile(e.target.files[0])}
        />
      </div>

      <div className="button-row">
        <button
          className="btn btn-primary"
          onClick={handleRunAgent}
          disabled={loading}
        >
          {loading ? "Running Agent..." : "Run Invoice Agent"}
        </button>
      </div>

      {error && <StatusCard status="error" message={error} />}

      {result && result.status === "pending_approval" && (
        <StatusCard
          status="pending_approval"
          message="The agent has matched both invoices. Review and approve to submit."
        >
          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={() => handleApproval(true)}
              disabled={loading}
            >
              Approve and Submit
            </button>
            <button
              className="btn btn-secondary"
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
