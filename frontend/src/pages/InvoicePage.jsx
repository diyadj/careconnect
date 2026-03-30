import React, { useState } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

export default function InvoicePage() {
  const [tixiFile, setTixiFile] = useState(null);
  const [mealFile, setMealFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionKey, setSessionKey] = useState(null);
  const [wxoSessionId, setWxoSessionId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState("upload"); // "upload" | "review" | "complete"

  async function handleUploadFiles() {
    if (!tixiFile || !mealFile) {
      setError("Please upload both invoice files.");
      return;
    }

    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append("tixi_invoice", tixiFile);
    form.append("meal_invoice", mealFile);

    try {
      const res = await api.post("/invoice/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSessionKey(res.data.session_key);
      setStage("ready");
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartAgent() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post("/invoice/start", {
        session_key: sessionKey,
      });
      setWxoSessionId(res.data.wxo_session_id);
      setResult(res.data);
      setStage("review");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to start agent.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approved) {
    setLoading(true);
    setError(null);

    try {
      const res = await api.post("/invoice/approve", {
        session_id: wxoSessionId,
        approved,
      });
      setResult(res.data);
      setStage(approved ? "complete" : "cancelled");
    } catch (err) {
      setError(err.response?.data?.detail || "Approval failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setTixiFile(null);
    setMealFile(null);
    setSessionKey(null);
    setWxoSessionId(null);
    setResult(null);
    setError(null);
    setStage("upload");
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

      {/* UPLOAD STAGE */}
      {stage === "upload" && (
        <>
          <div className="section">
            <label className="form-label">Tixi-Taxi Invoice (PDF)</label>
            <input
              type="file"
              accept=".pdf"
              className="form-input"
              onChange={(e) => setTixiFile(e.target.files?.[0] || null)}
              disabled={loading}
            />
            {tixiFile && <p className="text-sm text-gray-600">{tixiFile.name}</p>}
          </div>

          <div className="section">
            <label className="form-label">Meal Invoice (PDF)</label>
            <input
              type="file"
              accept=".pdf"
              className="form-input"
              onChange={(e) => setMealFile(e.target.files?.[0] || null)}
              disabled={loading}
            />
            {mealFile && <p className="text-sm text-gray-600">{mealFile.name}</p>}
          </div>

          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={handleUploadFiles}
              disabled={loading || !tixiFile || !mealFile}
            >
              {loading ? "Uploading..." : "Upload Files"}
            </button>
          </div>
        </>
      )}

      {/* READY TO START AGENT */}
      {stage === "ready" && (
        <StatusCard status="success" message="Files uploaded successfully!">
          <p className="text-sm mb-4">
            Ready to start the invoice matching agent. Click below to proceed.
          </p>
          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={handleStartAgent}
              disabled={loading}
            >
              {loading ? "Starting Agent..." : "Start Agent"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={loading}
            >
              Cancel & Re-upload
            </button>
          </div>
        </StatusCard>
      )}

      {/* REVIEW STAGE - User Approval */}
      {stage === "review" && result?.user_prompt && (
        <StatusCard status="pending_approval" message={result.user_prompt.message}>
          <div className="button-row">
            <button
              className="btn btn-primary"
              onClick={() => handleApproval(true)}
              disabled={loading}
            >
              {loading ? "Processing..." : "Approve & Submit"}
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

      {/* COMPLETE STAGE */}
      {stage === "complete" && (
        <StatusCard
          status="submitted"
          message="Invoices successfully submitted to the IV. You are all done for this month."
        >
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleReset}>
              Start New Submission
            </button>
          </div>
        </StatusCard>
      )}

      {/* CANCELLED STAGE */}
      {stage === "cancelled" && (
        <StatusCard
          status="cancelled"
          message="Submission cancelled. You can re-upload and try again."
        >
          <div className="button-row">
            <button className="btn btn-primary" onClick={handleReset}>
              Start Over
            </button>
          </div>
        </StatusCard>
      )}

      {/* ERROR MESSAGE */}
      {error && <StatusCard status="error" message={error} />}
    </div>
  );
}
