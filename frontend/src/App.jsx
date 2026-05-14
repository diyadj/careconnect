import React, { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import RidePlanningPage from "./pages/RidePlanningPage";
import HelpPage from "./pages/InvoicePage";
import InvoiceDatabasePage from "./pages/InvoiceDatabasePage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import careconnectLogo from "./components/careconnect_logo.png";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(
    () => localStorage.getItem("cc_logged_in") === "true"
  );
  const [authUser, setAuthUser] = useState(
    () => localStorage.getItem("cc_username") || ""
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
        <img src={careconnectLogo} alt="CareConnect" style={{ height: "60px", borderRadius: "4px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "0 auto" }}>
          <NavLink to="/rides" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Ride Planning
          </NavLink>
          <NavLink to="/invoice-records" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Invoice Records
          </NavLink>
          <NavLink to="/" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} end>
            Help &amp; Guidance
          </NavLink>
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "var(--primary)",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
            title={authUser}
          >
            {authUser.charAt(0).toUpperCase()}
          </button>
          {dropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "0.5rem",
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                minWidth: "180px",
                zIndex: 100,
              }}
            >
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", fontSize: "0.9rem", fontWeight: 500, color: "var(--ink)" }}>
                {authUser}
              </div>
              <NavLink
                to="/profile"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: "block",
                  padding: "0.75rem 1rem",
                  color: "inherit",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  borderBottom: "1px solid var(--border)",
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => (e.target.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.target.style.background = "transparent")}
              >
                Profile
              </NavLink>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  handleLogout();
                }}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  background: "none",
                  border: "none",
                  color: "inherit",
                  textAlign: "left",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  transition: "background 150ms ease",
                }}
                onMouseEnter={(e) => (e.target.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.target.style.background = "transparent")}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/rides" element={<RidePlanningPage />} />
          <Route path="/invoice-records" element={<InvoiceDatabasePage />} />
          <Route path="/profile" element={<ProfilePage onLogout={handleLogout} />} />
          <Route path="/" element={<HelpPage />} />
        </Routes>
      </main>
    </div>
  );
}
