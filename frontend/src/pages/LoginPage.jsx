import React, { useState } from "react";
import api from "../api/client";
import careconnectLogo from "../components/careconnect_logo.png";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/login", { username, password });
      onLogin(username);
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #eef6f8 0%, #f5f5ff 100%)",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "#fff",
          borderRadius: "20px",
          boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
          padding: "2.5rem 2rem",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <img src={careconnectLogo} alt="CareConnect" style={{ height: "80px", marginBottom: "1rem", borderRadius: "12px" }} />
          <div style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            Sign in to continue
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.65rem 0.9rem",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                color: "#ef4444",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: "100%", padding: "0.75rem" }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div
          style={{
            marginTop: "1.5rem",
            padding: "0.75rem 1rem",
            background: "#f8fafc",
            borderRadius: "10px",
            border: "1px solid var(--border)",
            fontSize: "0.8rem",
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#555" }}>Default credentials</strong>
          <br />
          Username: <code style={{ background: "#eee", padding: "0 4px", borderRadius: "3px" }}>admin</code>
          &nbsp; Password: <code style={{ background: "#eee", padding: "0 4px", borderRadius: "3px" }}>careconnect123</code>
        </div>
      </div>
    </div>
  );
}
