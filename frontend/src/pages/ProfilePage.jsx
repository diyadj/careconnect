import React, { useState, useEffect } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

const EMPTY = {
  parent_first_name: "",
  parent_last_name: "",
  parent_email: "",
  parent_phone: "",
  invoice_address: "",
  child_first_name: "",
  child_last_name: "",
  child_ahv_number: "756.",
  date_of_birth: "",
  notes: "",
  account_username: "admin",
  account_password: "••••••••",
};

const EMPTY_ACCOUNT = { account_username: "", account_password: "", confirm_password: "" };

export default function ProfilePage({ onLogout }) {
  const [profile, setProfile] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Account credentials edit state
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountDraft, setAccountDraft] = useState(EMPTY_ACCOUNT);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState(null);

  useEffect(() => {
    api.get("/profile")
      .then((res) => {
        setProfile(res.data);
        setDraft(res.data);
      })
      .catch(() => setError("Failed to load profile."));
  }, []);

  function startEdit() {
    setDraft({ ...profile });
    setEditing(true);
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setDraft({ ...profile });
    setEditing(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.put("/profile", draft);
      setProfile(res.data);
      setEditing(false);
      setSuccess("Profile saved successfully.");
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  function setField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function startEditAccount() {
    setAccountDraft({ account_username: profile.account_username || "", account_password: "", confirm_password: "" });
    setEditingAccount(true);
    setAccountError(null);
  }

  async function handleAccountSave(e) {
    e.preventDefault();
    if (accountDraft.account_password && accountDraft.account_password !== accountDraft.confirm_password) {
      setAccountError("Passwords do not match.");
      return;
    }
    setAccountSaving(true);
    setAccountError(null);
    try {
      const payload = { account_username: accountDraft.account_username };
      if (accountDraft.account_password) payload.account_password = accountDraft.account_password;
      const res = await api.put("/profile", payload);
      setProfile(res.data);
      setEditingAccount(false);
      setSuccess("Account credentials updated.");
    } catch {
      setAccountError("Failed to save credentials.");
    } finally {
      setAccountSaving(false);
    }
  }

  const hasParentData = profile.parent_first_name || profile.parent_last_name;
  const hasChildData = profile.child_first_name || profile.child_last_name;
  const parentDisplayName = [profile.parent_first_name, profile.parent_last_name].filter(Boolean).join(" ");
  const childDisplayName = [profile.child_first_name, profile.child_last_name].filter(Boolean).join(" ");

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">
          Parent details for the person managing Luca Muller’s profile, plus Luca’s child details used across CareConnect.
        </p>
      </div>

      {error && <StatusCard status="error" message={error} />}
      {success && <StatusCard status="logged" message={success} />}

      <div className="section" style={{ maxWidth: "640px" }}>
        {/* Managed profile banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.25rem",
            marginBottom: "2rem",
            padding: "1.5rem",
            background: "linear-gradient(135deg, #eef6f8 0%, #f5f5ff 100%)",
            borderRadius: "16px",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.75rem",
              color: "#fff",
              flexShrink: 0,
            }}
          >
              {hasChildData
              ? (profile.child_first_name?.[0] || "") + (profile.child_last_name?.[0] || "")
              : "?"}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.2rem", lineHeight: 1.2 }}>
              {childDisplayName || "No child name set"}
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Managed by {parentDisplayName || "no parent details yet"}
            </div>
            {profile.child_ahv_number && profile.child_ahv_number !== "756." && (
              <div style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                AHV number {profile.child_ahv_number}
              </div>
            )}
            {profile.date_of_birth && (
              <div style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                Born {new Date(profile.date_of_birth).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
              </div>
            )}
          </div>
        </div>

        {editing ? (
          <form onSubmit={handleSave}>
            <div style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ marginTop: 0, marginBottom: "0.85rem", fontSize: "1rem" }}>Parent / Guardian Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Anna"
                    value={draft.parent_first_name}
                    onChange={(e) => setField("parent_first_name", e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Mueller"
                    value={draft.parent_last_name}
                    onChange={(e) => setField("parent_last_name", e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g., parent@example.com"
                    value={draft.parent_email}
                    onChange={(e) => setField("parent_email", e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="e.g., +41 79 123 45 67"
                    value={draft.parent_phone}
                    onChange={(e) => setField("parent_phone", e.target.value)}
                  />
                </div>
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label className="form-label">Invoice Address</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Street, postal code, city, country"
                  value={draft.invoice_address}
                  onChange={(e) => setField("invoice_address", e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ marginTop: 0, marginBottom: "0.85rem", fontSize: "1rem" }}>Child Details</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Luca"
                    value={draft.child_first_name}
                    onChange={(e) => setField("child_first_name", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Last Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Mueller"
                    value={draft.child_last_name}
                    onChange={(e) => setField("child_last_name", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label className="form-label">AHV Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="756.XXXX.XXXX.XX"
                  value={draft.child_ahv_number}
                  onChange={(e) => setField("child_ahv_number", e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Date of Birth</label>
                <input
                  type="date"
                  className="form-input"
                  value={draft.date_of_birth}
                  onChange={(e) => setField("date_of_birth", e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label className="form-label">Notes</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Any additional notes about the child's care situation…"
                value={draft.notes}
                onChange={(e) => setField("notes", e.target.value)}
                style={{ resize: "vertical" }}
              />
            </div>

            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save Profile"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "12px", background: "#fafbfc" }}>
                <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 700, marginBottom: "0.5rem" }}>
                  Parent / Guardian
                </div>
                <div style={{ fontWeight: 600 }}>{parentDisplayName || "No parent name set"}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>{profile.parent_email || "No email set"}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.15rem" }}>{profile.parent_phone || "No phone set"}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.15rem" }}>{profile.invoice_address || "No invoice address set"}</div>
              </div>
              <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "12px", background: "#fafbfc" }}>
                <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 700, marginBottom: "0.5rem" }}>
                  Child
                </div>
                <div style={{ fontWeight: 600 }}>{childDisplayName || "No child name set"}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>{profile.child_ahv_number || "No AHV number set"}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "0.15rem" }}>
                  {profile.date_of_birth
                    ? new Date(profile.date_of_birth).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
                    : "No date of birth set"}
                </div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              <tbody>
                {[
                  { label: "Parent First Name", value: profile.parent_first_name },
                  { label: "Parent Last Name", value: profile.parent_last_name },
                  { label: "Parent Email", value: profile.parent_email },
                  { label: "Parent Phone", value: profile.parent_phone },
                  { label: "Invoice Address", value: profile.invoice_address },
                  { label: "Child First Name", value: profile.child_first_name },
                  { label: "Child Last Name", value: profile.child_last_name },
                  { label: "AHV Number", value: profile.child_ahv_number },
                  {
                    label: "Date of Birth",
                    value: profile.date_of_birth
                      ? new Date(profile.date_of_birth).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
                      : "",
                  },
                  { label: "Notes", value: profile.notes },
                ].map(({ label, value }) => (
                  <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td
                      style={{
                        padding: "0.7rem 0.75rem 0.7rem 0",
                        fontWeight: 600,
                        color: "var(--muted)",
                        fontSize: "0.82rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        width: "180px",
                        verticalAlign: "top",
                      }}
                    >
                      {label}
                    </td>
                    <td style={{ padding: "0.7rem 0.75rem", color: value ? "#111" : "var(--muted)" }}>
                      {value || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="btn btn-primary" onClick={startEdit}>
              Edit Profile
            </button>

            {!hasChildData && !hasParentData && (
              <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "1rem" }}>
                Add the parent and child details here — they will be used across CareConnect automatically.
              </p>
            )}
          </>
        )}
      </div>

      {/* Account credentials section */}
      <div className="section" style={{ maxWidth: "640px", marginTop: "2rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "1.25rem", fontSize: "1rem" }}>Account</h3>

        {accountError && (
          <div style={{ marginBottom: "1rem", padding: "0.65rem 0.9rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#ef4444", fontSize: "0.875rem" }}>
            {accountError}
          </div>
        )}

        {editingAccount ? (
          <form onSubmit={handleAccountSave}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={accountDraft.account_username}
                  onChange={(e) => setAccountDraft((d) => ({ ...d, account_username: e.target.value }))}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Leave blank to keep current"
                  value={accountDraft.account_password}
                  onChange={(e) => setAccountDraft((d) => ({ ...d, account_password: e.target.value }))}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Repeat new password"
                  value={accountDraft.confirm_password}
                  onChange={(e) => setAccountDraft((d) => ({ ...d, confirm_password: e.target.value }))}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={accountSaving}>
                {accountSaving ? "Saving…" : "Save Credentials"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingAccount(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div style={{ fontSize: "0.9rem" }}>
              <span style={{ color: "var(--muted)", fontSize: "0.82rem", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Username</span>
              <div style={{ fontWeight: 600, marginTop: "0.2rem" }}>{profile.account_username || "admin"}</div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button className="btn btn-secondary" onClick={startEditAccount}>
                Change Credentials
              </button>
              {onLogout && (
                <button className="btn btn-secondary" style={{ color: "#ef4444" }} onClick={onLogout}>
                  Log Out
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
