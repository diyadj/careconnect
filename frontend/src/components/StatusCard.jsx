import React from "react";

const colors = {
  pending_approval: { bg: "#FFF8E1", border: "#F59E0B", text: "#92400E" },
  submitted:        { bg: "#E8F5E9", border: "#75BDA7", text: "#1B5E20" },
  cancelled:        { bg: "#FEECEC", border: "#EF4444", text: "#7F1D1D" },
  logged:           { bg: "#E8F5E9", border: "#75BDA7", text: "#1B5E20" },
  error:            { bg: "#FEECEC", border: "#EF4444", text: "#7F1D1D" },
};

export default function StatusCard({ status, message, children }) {
  const style = colors[status] || { bg: "#F0F5F8", border: "#7A8C8E", text: "#373545" };

  return (
    <div
      style={{
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        borderRadius: "10px",
        padding: "1.2rem 1.4rem",
        marginTop: "1.2rem",
        color: style.text,
      }}
    >
      <strong style={{ textTransform: "capitalize", fontSize: "0.9rem" }}>
        {status.replace(/_/g, " ")}
      </strong>
      {message && <p style={{ marginTop: "0.4rem", fontSize: "0.9rem" }}>{message}</p>}
      {children}
    </div>
  );
}
