import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import InvoicePage from "./pages/InvoicePage";
import MileagePage from "./pages/MileagePage";

const navStyle = {
  display: "flex",
  gap: "1rem",
  padding: "1rem 2rem",
  background: "#3494BA",
  alignItems: "center",
};

const logoStyle = {
  color: "#fff",
  fontWeight: "700",
  fontSize: "1.2rem",
  marginRight: "auto",
  letterSpacing: "0.5px",
};

const linkStyle = ({ isActive }) => ({
  color: isActive ? "#fff" : "#CEDBE6",
  textDecoration: "none",
  fontWeight: isActive ? "600" : "400",
  fontSize: "0.95rem",
  padding: "0.4rem 0.8rem",
  borderRadius: "6px",
  background: isActive ? "rgba(255,255,255,0.15)" : "transparent",
});

export default function App() {
  return (
    <div>
      <nav style={navStyle}>
        <span style={logoStyle}>CareConnect</span>
        <NavLink to="/" style={linkStyle} end>
          Invoice Matching
        </NavLink>
        <NavLink to="/mileage" style={linkStyle}>
          Mileage Tracking
        </NavLink>
      </nav>

      <main style={{ padding: "2rem", maxWidth: "860px", margin: "0 auto" }}>
        <Routes>
          <Route path="/" element={<InvoicePage />} />
          <Route path="/mileage" element={<MileagePage />} />
        </Routes>
      </main>
    </div>
  );
}
