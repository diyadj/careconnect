import React from "react";

const statusClassMap = {
  pending_approval: "status-pending",
  submitted: "status-success",
  cancelled: "status-error",
  logged: "status-success",
  error: "status-error",
};

export default function StatusCard({ status, message, children }) {
  const statusClass = statusClassMap[status] || "status-info";

  return (
    <div className={`status-card ${statusClass}`}>
      <h4>{status.replace(/_/g, " ")}</h4>
      {message && <p>{message}</p>}
      {children}
    </div>
  );
}
