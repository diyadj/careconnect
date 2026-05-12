import React, { useState, useEffect } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

const RIDE_TYPE_LABELS = {
  tixitaxi: "Taxi",
  private_car: "Private",
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function exportPDF(title, rides, isTixiTaxi) {
  const filtered = rides.filter((r) =>
    isTixiTaxi ? r.ride_type === "tixitaxi" : r.ride_type !== "tixitaxi"
  );

  if (filtered.length === 0) {
    alert(`No rides found for "${title}".`);
    return;
  }

  const rows = filtered
    .map(
      (r) => `
      <tr>
        <td>${r.date}</td>
        <td>${r.time}</td>
        <td>${r.origin}</td>
        <td>${r.destination}</td>
        <td>${r.appointment_type || "—"}</td>
        ${
          !isTixiTaxi
            ? `<td>${RIDE_TYPE_LABELS[r.ride_type] || r.ride_type || "—"}</td>
               <td>${r.ride_type === "private_car" && r.kilometers_driven != null ? r.kilometers_driven + " km" : "—"}</td>
               <td>${r.ride_type === "private_car" && r.cost_chf != null ? "CHF " + r.cost_chf.toFixed(2) : "—"}</td>`
            : ""
        }
        <td>${r.notes || "—"}</td>
      </tr>`
    )
    .join("");

  const extraHeaders = !isTixiTaxi
    ? "<th>Transport Type</th><th>km Driven</th><th>Cost (CHF)</th>"
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 2rem; color: #111; }
    h1 { font-size: 1.3rem; margin-bottom: 0.25rem; }
    p.meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { background: #0e7c86; color: #fff; padding: 0.55rem 0.75rem; text-align: left; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · ${filtered.length} ride${filtered.length !== 1 ? "s" : ""}</p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Time</th>
        <th>From</th>
        <th>To</th>
        <th>Appointment</th>
        ${extraHeaders}
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.print();
}

export default function RidePlanningPage() {
  const currentYear = new Date().getFullYear();

  // Form state
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [rideType, setRideType] = useState("");
  const [kilometersDriven, setKilometersDriven] = useState("");
  const [notes, setNotes] = useState("");

  // Ride list state
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [cancelRide, setCancelRide] = useState(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelToast, setCancelToast] = useState(null);

  // Edit mode state
  const [editingId, setEditingId] = useState(null);

  // Email send state
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null);

  useEffect(() => {
    if (!cancelToast) return;
    const timer = setTimeout(() => setCancelToast(null), 4500);
    return () => clearTimeout(timer);
  }, [cancelToast]);

  useEffect(() => {
    loadRides();
  }, []);

  async function loadRides() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/rides", { params: { year: currentYear } });
      setRides(Array.isArray(res.data) ? res.data : res.data.rides || []);
    } catch (err) {
      setError("Failed to load rides. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setDate("");
    setTime("");
    setOrigin("");
    setDestination("");
    setAppointmentType("");
    setRideType("");
    setKilometersDriven("");
    setNotes("");
    setEditingId(null);
  }

  async function handleAddRide(e) {
    e.preventDefault();

    if (!date || !time || !origin || !destination) {
      setError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const rideData = {
        date,
        time,
        origin,
        destination,
        appointment_type: appointmentType,
        ride_type: rideType,
        kilometers_driven: rideType === "private_car" ? Number(kilometersDriven) || null : null,
        notes,
        year: currentYear,
      };

      if (editingId) {
        await api.patch(`/rides/${editingId}`, rideData);
        setSuccess("Ride updated successfully.");
      } else {
        await api.post("/rides", rideData);
        setSuccess("Ride added to your plan.");
      }

      resetForm();
      await loadRides();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save ride.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditRide(ride) {
    setDate(ride.date);
    setTime(ride.time);
    setOrigin(ride.origin);
    setDestination(ride.destination);
    setAppointmentType(ride.appointment_type || "");
    setRideType(ride.ride_type || "");
    setKilometersDriven(ride.kilometers_driven != null ? String(ride.kilometers_driven) : "");
    setNotes(ride.notes || "");
    setEditingId(ride.id);
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSendTixiEmail() {
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await api.post("/rides/send-tixi-email", null, {
        params: { year: currentYear },
      });
      setEmailResult({ ok: true, message: `Sent ${res.data.count} ride${res.data.count !== 1 ? "s" : ""} to ${res.data.to}.` });
    } catch (err) {
      setEmailResult({ ok: false, message: err.response?.data?.detail || "Failed to send email." });
    } finally {
      setEmailSending(false);
    }
  }

  async function handleDeleteRide(rideId) {
    if (!window.confirm("Are you sure you want to delete this ride?")) return;
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/rides/${rideId}`);
      setSuccess("Ride deleted.");
      await loadRides();
    } catch (err) {
      setError("Failed to delete ride.");
      console.error(err);
    }
  }

  function isTaxiRide(ride) {
    const kind = String(ride?.ride_type || "").toLowerCase();
    return kind === "taxi" || kind === "tixi_taxi" || kind === "tixitaxi";
  }

  function handleOpenCancelModal(ride) {
    setError(null);
    setSuccess(null);
    setCancelRide(ride);
  }

  function handleCloseCancelModal() {
    if (cancelSubmitting) return;
    setCancelRide(null);
  }

  async function handleConfirmCancelRide() {
    if (!cancelRide) return;

    setCancelSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        date: cancelRide.date,
        from: cancelRide.origin,
        to: cancelRide.destination,
        purpose: cancelRide.appointment_type || "",
      };

      const res = await api.post("/rides/cancel-ride", payload);
      const callSid =
        res?.data?.call_sid ||
        res?.data?.callSid ||
        res?.data?.sid ||
        res?.data?.CallSid ||
        null;

      setCancelToast({
        ok: true,
        message: callSid
          ? `Call initiated to TixiTaxi (SID: ${callSid})`
          : "Call initiated to TixiTaxi",
      });
      setCancelRide(null);
    } catch (err) {
      setCancelToast({
        ok: false,
        message: err.response?.data?.detail || "Failed to initiate cancellation call.",
      });
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ride Planning</h1>
        <p className="page-subtitle">
          Enter all planned transport appointments for {currentYear}.
        </p>
      </div>

      {/* Entry Form */}
      <div className="section" style={{ background: "#f9fbfc", padding: "1.5rem", borderRadius: "12px" }}>
        <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>
          {editingId ? "Edit Ride" : "Add New Ride"}
        </h3>
        <form onSubmit={handleAddRide}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="form-label">Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-input"
                required
              />
            </div>
            <div>
              <label className="form-label">Time *</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label className="form-label">Starting Location *</label>
              <input
                type="text"
                placeholder="e.g., Home or address"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="form-input"
                required
              />
            </div>
            <div>
              <label className="form-label">Destination *</label>
              <input
                type="text"
                placeholder="e.g., Therapy Center"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="form-input"
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="form-label">Appointment Type</label>
            <input
              type="text"
              placeholder="e.g., Therapy, Medical Appointment"
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value)}
              className="form-input"
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="form-label">Type of Ride</label>
            <div className="chip-row" style={{ marginTop: "0.5rem" }}>
              {[
                { value: "tixitaxi", label: "Taxi" },
                { value: "private_car", label: "Private" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`chip${rideType === value ? " selected" : ""}`}
                  onClick={() => {
                    setRideType(value);
                    if (value !== "private_car") setKilometersDriven("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rideType === "private_car" && (
            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label">Kilometers Driven</label>
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="e.g., 12.5"
                value={kilometersDriven}
                onChange={(e) => setKilometersDriven(e.target.value)}
                className="form-input"
                style={{ maxWidth: "200px" }}
              />
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <label className="form-label">Notes (optional)</label>
            <textarea
              placeholder="Any special instructions or notes about this ride"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="form-textarea"
              rows="2"
            />
          </div>

          <div className="button-row">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Update Ride" : "Add Ride"}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetForm}
                disabled={submitting}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Status Messages */}
      {error && <StatusCard status="error" message={error} />}
      {success && <StatusCard status="logged" message={success} />}
      {cancelToast && (
        <div
          style={{
            position: "fixed",
            top: "1.25rem",
            right: "1.25rem",
            zIndex: 40,
            background: cancelToast.ok ? "#ecfeff" : "#fff1f2",
            border: `1px solid ${cancelToast.ok ? "#a5f3fc" : "#fecdd3"}`,
            color: cancelToast.ok ? "#0f766e" : "#be123c",
            borderRadius: "10px",
            padding: "0.65rem 0.85rem",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
            fontSize: "0.86rem",
            fontWeight: 500,
            maxWidth: "340px",
          }}
        >
          {cancelToast.message}
        </div>
      )}

      {/* Rides List */}
      <div className="section" style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Your Rides ({rides.length})</h2>
          <div className="button-row" style={{ gap: "0.6rem" }}>
            <button
              className="btn btn-secondary"
              onClick={() => exportPDF("TixiTaxi Rides", rides, true)}
              disabled={rides.length === 0}
            >
              Export TixiTaxi PDF
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => exportPDF("Other Rides", rides, false)}
              disabled={rides.length === 0}
            >
              Export Other Rides PDF
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading rides...</p>
        ) : rides.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No rides planned yet. Add one above!</p>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {rides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                onEdit={handleEditRide}
                onDelete={handleDeleteRide}
                onCancel={handleOpenCancelModal}
                canCancel={isTaxiRide(ride)}
                isEditing={editingId === ride.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Send to Taxi */}
      <div
        className="section"
        style={{
          marginTop: "2rem",
          padding: "1.25rem 1.5rem",
          background: "#f0f9fa",
          borderRadius: "12px",
          border: "1px solid #c8e6e9",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ fontWeight: "600", marginBottom: "0.2rem" }}>Book TixiTaxi Rides</div>
          <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
            Emails the full TixiTaxi ride list for {currentYear} to the taxi company.
          </div>
          {emailResult && (
            <div
              style={{
                marginTop: "0.6rem",
                fontSize: "0.875rem",
                color: emailResult.ok ? "#0e7c86" : "#ef4444",
                fontWeight: "500",
              }}
            >
              {emailResult.message}
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSendTixiEmail}
          disabled={emailSending || rides.filter((r) => r.ride_type === "tixitaxi").length === 0}
        >
          {emailSending ? "Sending…" : "Book TixiTaxi Rides"}
        </button>
      </div>

      {cancelRide && (
        <CancelRideModal
          ride={cancelRide}
          loading={cancelSubmitting}
          onClose={handleCloseCancelModal}
          onConfirm={handleConfirmCancelRide}
        />
      )}
    </div>
  );
}

function RideCard({ ride, onEdit, onDelete, onCancel, canCancel, isEditing }) {
  return (
    <div
      className="ride-card"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "1.2rem",
        background: isEditing ? "rgba(14, 124, 134, 0.06)" : "#ffffff",
        transition: "all 150ms ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.8rem" }}>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "0.3rem" }}>
            {formatDate(ride.date)} at {ride.time}
          </div>
          {ride.appointment_type && (
            <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "0.2rem" }}>
              {ride.appointment_type}
            </div>
          )}
          {ride.ride_type && (
            <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              {RIDE_TYPE_LABELS[ride.ride_type] || ride.ride_type}
              {ride.ride_type === "private_car" && ride.kilometers_driven != null && (
                <span style={{ marginLeft: "0.5rem" }}>· {ride.kilometers_driven} km</span>
              )}
              {ride.ride_type === "private_car" && ride.cost_chf != null && (
                <span style={{ marginLeft: "0.5rem", fontWeight: "600", color: "#0e7c86" }}>· CHF {ride.cost_chf.toFixed(2)}</span>
              )}
            </div>
          )}
        </div>
        <div className="button-row" style={{ gap: "0.4rem" }}>
          <button
            onClick={() => onEdit(ride)}
            className="btn btn-secondary"
            style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
          >
            Edit
          </button>
          {canCancel && (
            <button
              onClick={() => onCancel(ride)}
              className="btn"
              style={{
                padding: "0.45rem 0.75rem",
                fontSize: "0.85rem",
                background: "#f59e0b",
                color: "#ffffff",
                border: "1px solid #f59e0b",
                borderRadius: "8px",
              }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => onDelete(ride.id)}
            className="btn btn-secondary"
            style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem", color: "#ef4444" }}
          >
            Delete
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: ride.notes ? "0.8rem" : 0 }}>
        <div>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.2rem" }}>From</div>
          <div style={{ fontWeight: "500" }}>{ride.origin}</div>
        </div>
        <div>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.2rem" }}>To</div>
          <div style={{ fontWeight: "500" }}>{ride.destination}</div>
        </div>
      </div>

      {ride.notes && (
        <div style={{ fontSize: "0.9rem", color: "var(--muted)", fontStyle: "italic" }}>
          Notes: {ride.notes}
        </div>
      )}
    </div>
  );
}

function CancelRideModal({ ride, loading, onClose, onConfirm }) {
  const friendlyDateTime = `${formatDate(ride.date)} at ${ride.time}`;
  const preview = `Calling TixiTaxi to cancel your ride on ${ride.date} from ${ride.origin} to ${ride.destination}.`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="section"
        style={{
          width: "min(520px, 100%)",
          borderRadius: "12px",
          border: "1px solid #c8e6e9",
          background: "#f8fcfd",
          boxShadow: "0 18px 36px rgba(15, 23, 42, 0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: "0.8rem", color: "#0e7c86" }}>Cancel Taxi Ride</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", marginBottom: "0.9rem" }}>
          <div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.15rem" }}>Date & Time</div>
            <div style={{ fontWeight: 600 }}>{friendlyDateTime}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.15rem" }}>Purpose</div>
            <div style={{ fontWeight: 600 }}>{ride.appointment_type || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.15rem" }}>From</div>
            <div style={{ fontWeight: 600 }}>{ride.origin}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.15rem" }}>To</div>
            <div style={{ fontWeight: 600 }}>{ride.destination}</div>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #bae6fd",
            borderRadius: "10px",
            background: "#eff6ff",
            color: "#1e3a8a",
            fontSize: "0.9rem",
            padding: "0.7rem 0.8rem",
            marginBottom: "1rem",
            lineHeight: 1.45,
          }}
        >
          {preview}
        </div>

        <div className="button-row" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Go Back
          </button>
          <button
            className="btn"
            onClick={onConfirm}
            disabled={loading}
            style={{
              background: "#f59e0b",
              color: "#ffffff",
              border: "1px solid #f59e0b",
            }}
          >
            {loading ? "Calling..." : "Confirm & Call"}
          </button>
        </div>
      </div>
    </div>
  );
}
