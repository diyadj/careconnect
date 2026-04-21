import React, { useState, useEffect } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

const APPOINTMENT_TYPES = [
  "Therapy",
  "Care Institution",
  "Medical Appointment",
  "Other",
];

const RIDE_STATUS_LABELS = {
  requested: "Requested",
  confirmed: "Confirmed",
  adjusted: "Adjusted",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS = {
  requested: "#ff9f1c",
  confirmed: "#0e7c86",
  adjusted: "#f59e0b",
  completed: "#10b981",
  cancelled: "#ef4444",
};

export default function RidePlanningPage() {
  const currentYear = new Date().getFullYear();

  // Form state
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [appointmentType, setAppointmentType] = useState("Therapy");
  const [notes, setNotes] = useState("");

  // Ride list state
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Edit mode state
  const [editingId, setEditingId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  // Load rides on mount and when status filter changes
  useEffect(() => {
    loadRides();
  }, []);

  async function loadRides() {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get("/rides", {
        params: { year: currentYear },
      });
      setRides(Array.isArray(res.data) ? res.data : res.data.rides || []);
    } catch (err) {
      setError("Failed to load rides. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
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
        notes,
        year: currentYear,
      };

      let res;
      if (editingId) {
        // Update existing ride
        res = await api.patch(`/rides/${editingId}`, rideData);
        setSuccess("Ride updated successfully.");
      } else {
        // Create new ride
        res = await api.post("/rides", rideData);
        setSuccess("Ride added to your plan.");
      }

      // Reset form
      setDate("");
      setTime("");
      setOrigin("");
      setDestination("");
      setAppointmentType("Therapy");
      setNotes("");
      setEditingId(null);

      // Reload rides list
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
    setAppointmentType(ride.appointment_type || "Therapy");
    setNotes(ride.notes || "");
    setEditingId(ride.id);
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setDate("");
    setTime("");
    setOrigin("");
    setDestination("");
    setAppointmentType("Therapy");
    setNotes("");
    setEditingId(null);
  }

  async function handleDeleteRide(rideId) {
    if (!window.confirm("Are you sure you want to delete this ride?")) {
      return;
    }

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

  async function handleCancelRide(rideId) {
    if (!window.confirm("Mark this ride as cancelled?")) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await api.patch(`/rides/${rideId}`, { status: "cancelled" });
      setSuccess("Ride marked as cancelled.");
      await loadRides();
    } catch (err) {
      setError("Failed to cancel ride.");
      console.error(err);
    }
  }

  const filteredRides =
    filterStatus === "all"
      ? rides
      : rides.filter((ride) => ride.status === filterStatus);

  const upcomingRides = filteredRides.filter(
    (ride) => ride.status !== "cancelled" && ride.status !== "completed"
  );
  const completedRides = filteredRides.filter(
    (ride) => ride.status === "completed" || ride.status === "cancelled"
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ride Planning</h1>
        <p className="page-subtitle">
          Enter all planned transport appointments for {currentYear}. The system
          will store these rides and prepare them for booking with TixiTaxi.
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
            <select
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value)}
              className="form-select"
            >
              {APPOINTMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

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
                onClick={handleCancelEdit}
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

      {/* Rides List */}
      <div className="section" style={{ marginTop: "2rem" }}>
        <h2 style={{ marginTop: 0 }}>Your Rides ({filteredRides.length})</h2>

        {/* Filter */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label className="form-label" style={{ marginBottom: "0.5rem" }}>
            Filter by status
          </label>
          <div className="chip-row">
            {["all", "requested", "confirmed", "adjusted", "completed", "cancelled"].map(
              (status) => (
                <button
                  key={status}
                  className={`chip${filterStatus === status ? " selected" : ""}`}
                  onClick={() => setFilterStatus(status)}
                >
                  {status === "all" ? "All" : RIDE_STATUS_LABELS[status]}
                </button>
              )
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading rides...</p>
        ) : filteredRides.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            {filterStatus === "all"
              ? "No rides planned yet. Add one above!"
              : `No ${filterStatus} rides.`}
          </p>
        ) : (
          <>
            {/* Upcoming Rides */}
            {upcomingRides.length > 0 && (
              <div style={{ marginBottom: "2rem" }}>
                <h4 style={{ color: "var(--muted)", marginBottom: "1rem" }}>
                  Upcoming Rides ({upcomingRides.length})
                </h4>
                <div style={{ display: "grid", gap: "1rem" }}>
                  {upcomingRides.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      onEdit={handleEditRide}
                      onDelete={handleDeleteRide}
                      onCancel={handleCancelRide}
                      isEditing={editingId === ride.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Completed/Cancelled Rides */}
            {completedRides.length > 0 && (
              <div>
                <h4 style={{ color: "var(--muted)", marginBottom: "1rem" }}>
                  History ({completedRides.length})
                </h4>
                <div style={{ display: "grid", gap: "1rem", opacity: 0.7 }}>
                  {completedRides.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      onEdit={handleEditRide}
                      onDelete={handleDeleteRide}
                      onCancel={handleCancelRide}
                      isEditing={editingId === ride.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RideCard({ ride, onEdit, onDelete, onCancel, isEditing }) {
  const statusColor = STATUS_COLORS[ride.status] || "#5b6670";
  const dateObj = new Date(ride.date);
  const formattedDate = dateObj.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

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
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "1.1rem", fontWeight: "600" }}>
              {formattedDate} at {ride.time}
            </span>
            <span
              style={{
                display: "inline-block",
                backgroundColor: statusColor,
                color: "#ffffff",
                padding: "0.25rem 0.65rem",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: "600",
              }}
            >
              {RIDE_STATUS_LABELS[ride.status] || ride.status}
            </span>
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "0.4rem" }}>
            {ride.appointment_type}
          </div>
        </div>
        <div className="button-row" style={{ gap: "0.4rem" }}>
          {ride.status !== "cancelled" && ride.status !== "completed" && (
            <>
              <button
                onClick={() => onEdit(ride)}
                className="btn btn-secondary"
                style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
              >
                Edit
              </button>
              <button
                onClick={() => onCancel(ride.id)}
                className="btn btn-secondary"
                style={{ padding: "0.45rem 0.75rem", fontSize: "0.85rem" }}
              >
                Cancel
              </button>
            </>
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "0.8rem" }}>
        <div>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
            From
          </div>
          <div style={{ fontWeight: "500" }}>{ride.origin}</div>
        </div>
        <div>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
            To
          </div>
          <div style={{ fontWeight: "500" }}>{ride.destination}</div>
        </div>
      </div>

      {ride.notes && (
        <div style={{ fontSize: "0.9rem", color: "var(--muted)", fontStyle: "italic" }}>
          Notes: {ride.notes}
        </div>
      )}

      {ride.confirmed_time && ride.confirmed_time !== ride.time && (
        <div style={{ marginTop: "0.8rem", padding: "0.75rem", background: "#fef3c7", borderRadius: "8px", fontSize: "0.85rem" }}>
          ⚠️ <strong>Time adjusted:</strong> TixiTaxi confirmed {ride.confirmed_time}
        </div>
      )}
    </div>
  );
}
