import React, { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import RidePlanningPage from "./pages/RidePlanningPage";
import InvoicePage from "./pages/InvoicePage";
import InvoiceDatabasePage from "./pages/InvoiceDatabasePage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(
    () => localStorage.getItem("cc_logged_in") === "true"
  );
  const [authUser, setAuthUser] = useState(
    () => localStorage.getItem("cc_username") || ""
  );

  function handleLogin(username) {
    localStorage.setItem("cc_logged_in", "true");
    localStorage.setItem("cc_username", username);
    setLoggedIn(true);
    setAuthUser(username);
  }

  function handleLogout() {
    localStorage.removeItem("cc_logged_in");
    localStorage.removeItem("cc_username");
    setLoggedIn(false);
    setAuthUser("");
  }

  if (!loggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-logo">CareConnect</span>
        <NavLink to="/rides" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Ride Planning
        </NavLink>
        <NavLink to="/invoice-records" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Invoice Records
        </NavLink>
        <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} end>
          Invoice Matching
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Profile
        </NavLink>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{authUser}</span>
          <button
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ padding: "0.3rem 0.75rem", fontSize: "0.82rem" }}
          >
            Log out
          </button>
        </div>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/rides" element={<RidePlanningPage />} />
          <Route path="/invoice-records" element={<InvoiceDatabasePage />} />
          <Route path="/profile" element={<ProfilePage onLogout={handleLogout} />} />
          <Route path="/" element={<InvoicePage />} />
        </Routes>
      </main>
    </div>
  );
}
