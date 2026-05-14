import React, { useState, useEffect, useRef } from "react";
import api from "../api/client";
import StatusCard from "../components/StatusCard";

const TRANSPORT_TYPE_LABELS = {
  tixitaxi: "TixiTaxi",
  public_transport: "Public Transport (SBB)",
  private_car: "Private Car",
  other: "Other",
};

const TRANSPORT_TYPE_COLORS = {
  tixitaxi: "#0e7c86",
  public_transport: "#6366f1",
  private_car: "#f59e0b",
  other: "#5b6670",
};

function fmt(amount) {
  return `CHF ${Number(amount).toFixed(2)}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const EMPTY_META = {
  category: "transport",
  transport_type: "",
  date: "",
  vendor: "",
  amount: "",
  description: "",
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function newFileItem(file) {
  return {
    id: crypto.randomUUID(),
    file,
    appointment_reason: "",
    appointment_address: "",
    status: "idle",   // idle | extracting | saved | error
    result: null,
    error: null,
  };
}

export default function InvoiceDatabasePage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Transport receipt queue state
  const queueInputRef = useRef(null);
  const [isQueueDragOver, setIsQueueDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);

  // Meal receipt queue state
  const mealQueueInputRef = useRef(null);
  const [isMealDragOver, setIsMealDragOver] = useState(false);
  const [pendingMeals, setPendingMeals] = useState([]);

  // Manual upload fallback state
  const [showManual, setShowManual] = useState(false);
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [meta, setMeta] = useState(EMPTY_META);
  const [uploading, setUploading] = useState(false);

  // SVA form panel state
  const [svaOpen, setSvaOpen] = useState(false);
  const [svaName, setSvaName] = useState("");
  const [svaVorname, setSvaVorname] = useState("");
  const [svaAhv, setSvaAhv] = useState("756.");
  const [svaMonth, setSvaMonth] = useState("");

  useEffect(() => {
    api.get("/profile").then((res) => {
      const p = res.data;
      if (p.child_last_name) setSvaName(p.child_last_name);
      if (p.child_first_name) setSvaVorname(p.child_first_name);
      if (p.child_ahv_number) setSvaAhv(p.child_ahv_number);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadInvoices(); }, [year]);

  useEffect(() => {
    if (selectedMonth) setSvaMonth(`${year}-${String(selectedMonth).padStart(2, "0")}`);
  }, [selectedMonth, year]);

  async function loadInvoices() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/invoice-db", { params: { year } });
      setInvoices(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError("Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }

  // ── Queue helpers ──────────────────────────────────────────────────────────

  function updateFile(id, updates) {
    setPendingFiles((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
  }

  function addFilesToQueue(files) {
    const items = Array.from(files)
      .filter((f) => /\.(pdf|jpe?g|png)$/i.test(f.name))
      .map(newFileItem);
    if (items.length === 0) {
      setError("Only PDF, JPG, and PNG files are accepted.");
      return;
    }
    setPendingFiles((prev) => [...prev, ...items]);
  }

  function removeFromQueue(id) {
    setPendingFiles((prev) => prev.filter((item) => item.id !== id));
  }

  async function extractInvoice(id) {
    const item = pendingFiles.find((f) => f.id === id);
    if (!item) return;
    if (!item.appointment_reason.trim() || !item.appointment_address.trim()) {
      setError("Please fill in both appointment reason and appointment address before extracting.");
      return;
    }

    setError(null);
    updateFile(id, { status: "extracting", error: null });

    const fd = new FormData();
    fd.append("file", item.file);
    fd.append("appointment_reason", item.appointment_reason.trim());
    fd.append("appointment_address", item.appointment_address.trim());
    fd.append("year", String(year));

    try {
      const res = await api.post("/invoice-db/agent-extract", fd);
      updateFile(id, { status: "saved", result: res.data });
      await loadInvoices();
    } catch (err) {
      const detail = err.response?.data?.detail || "Extraction failed.";
      updateFile(id, { status: "error", error: detail });
    }
  }

  async function extractAll() {
    const ready = pendingFiles.filter(
      (f) => f.status === "idle" && f.appointment_reason.trim() && f.appointment_address.trim()
    );
    for (const item of ready) {
      await extractInvoice(item.id);
    }
  }

  // ── Meal queue helpers ─────────────────────────────────────────────────────

  function newMealItem(file) {
    return { id: crypto.randomUUID(), file, status: "idle", result: null, matchInfo: null, error: null };
  }

  function updateMeal(id, updates) {
    setPendingMeals((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
  }

  function addMealsToQueue(files) {
    const items = Array.from(files)
      .filter((f) => /\.(pdf|jpe?g|png)$/i.test(f.name))
      .map(newMealItem);
    if (items.length === 0) { setError("Only PDF, JPG, and PNG files are accepted."); return; }
    setPendingMeals((prev) => [...prev, ...items]);
  }

  function removeFromMealQueue(id) {
    setPendingMeals((prev) => prev.filter((m) => m.id !== id));
  }

  async function extractMeal(id) {
    const item = pendingMeals.find((m) => m.id === id);
    if (!item) return;
    setError(null);
    updateMeal(id, { status: "extracting", error: null });
    const fd = new FormData();
    fd.append("file", item.file);
    fd.append("year", String(year));
    try {
      const res = await api.post("/invoice-db/meal-extract", fd);
      updateMeal(id, { status: "saved", result: res.data.record, matchInfo: res.data.match_info });
      await loadInvoices();
    } catch (err) {
      updateMeal(id, { status: "error", error: err.response?.data?.detail || "Extraction failed." });
    }
  }

  async function extractAllMeals() {
    const ready = pendingMeals.filter((m) => m.status === "idle");
    for (const item of ready) await extractMeal(item.id);
  }

  // ── Manual upload helpers ──────────────────────────────────────────────────

  function setMetaField(key, value) {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  function clearUpload() {
    setSelectedFile(null);
    setMeta(EMPTY_META);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!selectedFile) return;
    if (!meta.date || !meta.vendor || meta.amount === "") {
      setError("Date, vendor/provider, and amount are required.");
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);

    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("category", meta.category);
    fd.append("transport_type", meta.transport_type);
    fd.append("date", meta.date);
    fd.append("vendor", meta.vendor);
    fd.append("amount", meta.amount);
    fd.append("description", meta.description);
    fd.append("year", String(year));

    try {
      await api.post("/invoice-db/upload", fd);
      setSuccess("Invoice uploaded and saved.");
      clearUpload();
      await loadInvoices();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id, source) {
    const msg = source === "ride"
      ? "Remove this ride from the records?"
      : "Delete this invoice record and its file?";
    if (!window.confirm(msg)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.delete(source === "ride" ? `/rides/${id}` : `/invoice-db/${id}`);
      setSuccess(source === "ride" ? "Ride removed." : "Invoice deleted.");
      await loadInvoices();
    } catch {
      setError("Failed to delete record.");
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const monthPrefix = `${year}-${String(selectedMonth).padStart(2, "0")}`;
  const monthInvoices = invoices.filter((i) => i.date.startsWith(monthPrefix));
  const visible = filterCategory === "all"
    ? monthInvoices
    : monthInvoices.filter((i) => i.category === filterCategory);

  const transportTotal = monthInvoices.filter((i) => i.category === "transport").reduce((s, i) => s + i.amount, 0);
  const mealTotal = monthInvoices.filter((i) => i.category === "meal").reduce((s, i) => s + i.amount, 0);
  const grandTotal = transportTotal + mealTotal;
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  const svaMonthOptions = Array.from(
    new Set(invoices.filter((i) => i.category === "transport").map((i) => i.date.slice(0, 7)))
  ).sort();

  // Meal match data: meals in current month, paired with their matched appointment
  const mealRecords = monthInvoices.filter((i) => i.category === "meal");
  const transportRecords = invoices.filter((i) => i.category === "transport");

  function findTransportMatch(mealDate, storedRef) {
    if (storedRef) return storedRef;
    const md = new Date(mealDate).getTime();
    const hit = transportRecords.find((t) => Math.abs(new Date(t.date).getTime() - md) <= 86400000);
    return hit ? { date: hit.date, description: hit.description, vendor: hit.vendor } : null;
  }

  const readyCount = pendingFiles.filter(
    (f) => f.status === "idle" && f.appointment_reason.trim() && f.appointment_address.trim()
  ).length;

  // ── SVA form generation ────────────────────────────────────────────────────

  function generateSVAForm() {
    if (!svaMonth) { alert("Please select a month."); return; }

    const monthInvs = invoices
      .filter((i) => i.category === "transport" && i.date.startsWith(svaMonth))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (monthInvs.length === 0) { alert("No transport invoices found for that month."); return; }

    const [mYear, mMonth] = svaMonth.split("-");
    const monthName = new Date(Number(mYear), Number(mMonth) - 1, 1)
      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    function chf(val) { return val > 0 ? `CHF ${Number(val).toFixed(2)}` : ""; }
    function swissDate(iso) { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; }

    let totalOV = 0, totalPrivat = 0, totalTaxi = 0, totalAll = 0;

    const rows = monthInvs.map((inv) => {
      let ov = 0, privat = 0, taxi = 0;
      if (inv.transport_type === "public_transport") ov = inv.amount;
      else if (inv.transport_type === "private_car") privat = inv.amount;
      else taxi = inv.amount;
      totalOV += ov; totalPrivat += privat; totalTaxi += taxi; totalAll += inv.amount;
      return `<tr>
        <td>${swissDate(inv.date)}</td>
        <td>${inv.description || ""}</td>
        <td>${inv.vendor || ""}</td>
        <td class="num">${chf(ov)}</td>
        <td class="num">${chf(privat)}</td>
        <td class="num">${chf(taxi)}</td>
        <td class="num total-col">${chf(inv.amount)}</td>
      </tr>`;
    });

    while (rows.length < 8) {
      rows.push(`<tr><td></td><td></td><td></td><td class="num">CHF</td><td class="num">CHF</td><td class="num">CHF</td><td class="num total-col">CHF</td></tr>`);
    }

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"/>
<title>SVA Form 5050 – ${monthName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;padding:1.5cm 2cm}
  .header-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.2rem;border-bottom:2px solid #000;padding-bottom:.8rem}
  .sva-logo{font-size:2rem;font-weight:900;letter-spacing:-2px}
  .sva-address{font-size:8.5pt;line-height:1.6;text-align:right}
  h1{font-size:11pt;font-weight:bold;margin:1rem 0}
  .fields{display:grid;grid-template-columns:1fr 1fr;gap:.4rem 1.5rem;margin-bottom:1rem}
  .ahv-row{display:grid;grid-template-columns:1fr 1fr;gap:.4rem 1.5rem;margin-bottom:1.2rem}
  .field-box{border-bottom:1px solid #000;padding-bottom:.2rem}
  .field-label{font-size:7.5pt;color:#555}
  .field-val{font-size:10pt;min-height:1rem}
  table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:.8rem}
  th{background:#e8e8e8;border:1px solid #999;padding:.3rem .4rem;text-align:left;font-size:8pt;vertical-align:bottom}
  td{border:1px solid #bbb;padding:.35rem .4rem;vertical-align:top;min-height:1.2rem}
  .num{text-align:left;white-space:nowrap;color:#555}
  .total-col{font-weight:bold;color:#000}
  .total-row td{font-weight:bold;background:#f0f0f0;border-top:2px solid #555}
  .stamp-box{border:1px solid #999;height:3rem;margin-bottom:1rem;padding:.3rem;font-size:8pt;color:#777}
  .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1rem}
  .sig-line{border-bottom:1px solid #000;min-height:1.8rem}
  .sig-label{font-size:8pt;color:#555;margin-top:.2rem}
  .note{font-size:8pt;color:#444;margin-top:1rem;font-style:italic}
  @media print{body{padding:1cm 1.5cm}}
</style></head>
<body>
  <div class="header-row">
    <div><div class="sva-logo">SVA</div><div style="font-size:8pt;line-height:1.5">Social Insurance Institution<br>of the Canton of St.Gallen</div></div>
    <div class="sva-address">Brauerstrasse 54 &nbsp; Tel. 071 282 69 37<br>P.O. Box &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Fax 071 282 69 10<br>9016 St.Gallen &nbsp;&nbsp;&nbsp; www.svasg.ch</div>
  </div>
  <h1>Monthly Transport Cost Statement for Supplementary Benefits</h1>
  <div class="fields">
    <div class="field-box"><div class="field-label">Last Name</div><div class="field-val">${svaName}</div></div>
    <div class="field-box"><div class="field-label">First Name</div><div class="field-val">${svaVorname}</div></div>
  </div>
  <div class="ahv-row">
    <div class="field-box"><div class="field-label">AHV Number</div><div class="field-val">${svaAhv}</div></div>
    <div class="field-box"><div class="field-label">For Month</div><div class="field-val">${monthName}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Travel Date</th><th>Appointment Reason</th><th>Appointment Address</th>
      <th>Public Transport Fare<br>2nd Class</th><th>Private Car</th>
      <th>Taxi and Other<br>Transport Services</th><th>Total</th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3">Total Transport Costs</td>
      <td class="num">${chf(totalOV)}</td><td class="num">${chf(totalPrivat)}</td>
      <td class="num">${chf(totalTaxi)}</td><td class="num total-col">CHF ${totalAll.toFixed(2)}</td>
    </tr></tfoot>
  </table>
  <div class="stamp-box">Appointment confirmation stamp from all service providers</div>
  <p style="font-size:9pt;margin-bottom:.6rem">The undersigned insured person confirms the above information</p>
  <div class="sig-row">
    <div><div class="sig-line"></div><div class="sig-label">Date</div></div>
    <div><div class="sig-line"></div><div class="sig-label">Signature</div></div>
  </div>
  <p class="note">▶ Please send to SVA St.Gallen (online via www.svasg.ch/kk-belege or by post).</p>
  <p style="font-size:7.5pt;color:#888;margin-top:1.2rem;text-align:right">AHV Number ${svaAhv} &nbsp;|&nbsp; Page 2/2 &nbsp;|&nbsp; Form 5050 01.25</p>
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.print();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Invoice Records</h1>
        <p className="page-subtitle">
          Upload transport receipts — the AI agent extracts the details automatically. Then generate your SVA Form 5050.
        </p>
      </div>

      {/* Year + Month selectors */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="form-label" style={{ margin: 0, minWidth: "46px" }}>Year</span>
          <div className="chip-row">
            {yearOptions.map((y) => (
              <button key={y} type="button" className={`chip${year === y ? " selected" : ""}`} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="form-label" style={{ margin: 0, minWidth: "46px" }}>Month</span>
          <div className="chip-row" style={{ flexWrap: "wrap" }}>
            {MONTH_LABELS.map((label, idx) => {
              const m = idx + 1;
              const prefix = `${year}-${String(m).padStart(2, "0")}`;
              const hasData = invoices.some((i) => i.date.startsWith(prefix));
              return (
                <button
                  key={m}
                  type="button"
                  className={`chip${selectedMonth === m ? " selected" : ""}`}
                  onClick={() => setSelectedMonth(m)}
                  style={{ position: "relative" }}
                >
                  {label}
                  {hasData && selectedMonth !== m && (
                    <span style={{ position: "absolute", top: "3px", right: "4px", width: "5px", height: "5px", borderRadius: "50%", background: "var(--primary)" }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Transport", value: transportTotal, color: "#0e7c86", bg: "#f0f9fa" },
          { label: "Total", value: grandTotal, color: "#111", bg: "#f4f6f8" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: bg, border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600, marginBottom: "0.15rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.3rem" }}>{MONTH_LABELS[selectedMonth - 1]} {year}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color, fontFamily: "Space Grotesk, sans-serif" }}>{fmt(value)}</div>
          </div>
        ))}
      </div>

      {/* ── Agent-powered multi-file upload ── */}
      <div className="section" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Upload Receipts</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem", marginTop: 0 }}>
          Drop one or more receipts. Fill in the two required fields per receipt, then click Extract &amp; Save — the AI agent reads the date, amount, and transport type automatically.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsQueueDragOver(true); }}
          onDragLeave={() => setIsQueueDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsQueueDragOver(false); addFilesToQueue(e.dataTransfer.files); }}
          onClick={() => queueInputRef.current?.click()}
          style={{
            border: `2px dashed ${isQueueDragOver ? "var(--primary)" : "var(--border)"}`,
            borderRadius: "12px",
            padding: "1.75rem 2rem",
            textAlign: "center",
            cursor: "pointer",
            background: isQueueDragOver ? "rgba(14,124,134,0.06)" : "#fafbfc",
            transition: "all 150ms ease",
            marginBottom: pendingFiles.length > 0 ? "1.25rem" : 0,
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>📂</div>
          <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>Drop receipts here</div>
          <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>or click to browse — PDF, JPG, PNG — multiple files supported</div>
          <input ref={queueInputRef} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => addFilesToQueue(e.target.files)} />
        </div>

        {/* File queue */}
        {pendingFiles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {pendingFiles.map((item) => (
              <FileCard
                key={item.id}
                item={item}
                onUpdate={(updates) => updateFile(item.id, updates)}
                onExtract={() => extractInvoice(item.id)}
                onRemove={() => removeFromQueue(item.id)}
              />
            ))}

            {readyCount > 1 && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
                onClick={extractAll}
              >
                Extract All ({readyCount} ready)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Meal receipt upload ── */}
      <div className="section" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Upload Meal Receipts</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem", marginTop: 0 }}>
          Upload receipts for meals purchased on appointment days. The agent extracts the date and amount,
          then automatically matches it to the nearest appointment in your records.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsMealDragOver(true); }}
          onDragLeave={() => setIsMealDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsMealDragOver(false); addMealsToQueue(e.dataTransfer.files); }}
          onClick={() => mealQueueInputRef.current?.click()}
          style={{
            border: `2px dashed ${isMealDragOver ? "var(--primary)" : "var(--border)"}`,
            borderRadius: "12px",
            padding: "1.75rem 2rem",
            textAlign: "center",
            cursor: "pointer",
            background: isMealDragOver ? "rgba(14,124,134,0.06)" : "#fafbfc",
            transition: "all 150ms ease",
            marginBottom: pendingMeals.length > 0 ? "1.25rem" : 0,
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>🍽️</div>
          <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>Drop meal receipts here</div>
          <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>or click to browse — PDF, JPG, PNG</div>
          <input ref={mealQueueInputRef} type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => addMealsToQueue(e.target.files)} />
        </div>

        {pendingMeals.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {pendingMeals.map((item) => (
              <MealFileCard
                key={item.id}
                item={item}
                onUpdate={(updates) => updateMeal(item.id, updates)}
                onExtract={() => extractMeal(item.id)}
                onRemove={() => removeFromMealQueue(item.id)}
              />
            ))}
            {pendingMeals.filter((m) => m.status === "idle").length > 1 && (
              <button type="button" className="btn btn-primary"
                style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
                onClick={extractAllMeals}>
                Extract All Meals ({pendingMeals.filter((m) => m.status === "idle").length} ready)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Manual upload fallback */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setShowManual((o) => !o)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.85rem", color: "var(--muted)", textDecoration: "underline", padding: 0 }}
        >
          {showManual ? "Hide manual upload" : "Enter details manually instead"}
        </button>

        {showManual && (
          <div className="section" style={{ marginTop: "0.75rem" }}>
            <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Manual Upload</h3>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f); }}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? "var(--primary)" : "var(--border)"}`,
                borderRadius: "12px",
                padding: "2rem",
                textAlign: "center",
                cursor: selectedFile ? "default" : "pointer",
                background: isDragOver ? "rgba(14,124,134,0.06)" : "#fafbfc",
              }}
            >
              {selectedFile ? (
                <div>
                  <div style={{ fontSize: "1.75rem", marginBottom: "0.4rem" }}>{selectedFile.name.endsWith(".pdf") ? "📄" : "🖼️"}</div>
                  <div style={{ fontWeight: 600 }}>{selectedFile.name}</div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📂</div>
                  <div style={{ fontWeight: 600 }}>Drop invoice here or click to browse</div>
                </>
              )}
              <input ref={fileInputRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }} />
            </div>

            {selectedFile && (
              <form onSubmit={handleUpload}>
                <div style={{ marginTop: "1rem", padding: "1.25rem", background: "#f0f9fa", borderRadius: "12px", border: "1px solid #c8e6e9" }}>
                  <div style={{ marginBottom: "1rem" }}>
                    <label className="form-label">Category</label>
                    <div className="chip-row" style={{ marginTop: "0.4rem" }}>
                      {[{ value: "transport", label: "Transport" }, { value: "meal", label: "Meal" }].map(({ value, label }) => (
                        <button key={value} type="button" className={`chip${meta.category === value ? " selected" : ""}`}
                          onClick={() => { setMetaField("category", value); if (value !== "transport") setMetaField("transport_type", ""); }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {meta.category === "transport" && (
                    <div style={{ marginBottom: "1rem" }}>
                      <label className="form-label">Transport Type</label>
                      <div className="chip-row" style={{ marginTop: "0.4rem" }}>
                        {[
                          { value: "tixitaxi", label: "TixiTaxi" },
                          { value: "public_transport", label: "Public Transport (SBB)" },
                          { value: "private_car", label: "Private Car" },
                          { value: "other", label: "Other" },
                        ].map(({ value, label }) => (
                          <button key={value} type="button" className={`chip${meta.transport_type === value ? " selected" : ""}`}
                            onClick={() => setMetaField("transport_type", value)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                    <div>
                      <label className="form-label">Date *</label>
                      <input type="date" className="form-input" value={meta.date} onChange={(e) => setMetaField("date", e.target.value)} required />
                    </div>
                    <div>
                      <label className="form-label">Vendor / Provider *</label>
                      <input type="text" className="form-input" placeholder="e.g., TixiTaxi AG, SBB" value={meta.vendor} onChange={(e) => setMetaField("vendor", e.target.value)} required />
                    </div>
                    <div>
                      <label className="form-label">Amount (CHF) *</label>
                      <input type="number" className="form-input" placeholder="0.00" min="0" step="0.01" value={meta.amount} onChange={(e) => setMetaField("amount", e.target.value)} required />
                    </div>
                  </div>

                  <div style={{ marginBottom: "1.25rem" }}>
                    <label className="form-label">Appointment Reason</label>
                    <input type="text" className="form-input" placeholder="e.g., physiotherapy, doctor visit" value={meta.description} onChange={(e) => setMetaField("description", e.target.value)} />
                  </div>

                  <div className="button-row">
                    <button type="submit" className="btn btn-primary" disabled={uploading}>{uploading ? "Uploading…" : "Save Invoice"}</button>
                    <button type="button" className="btn btn-secondary" onClick={clearUpload}>Cancel</button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {error && <StatusCard status="error" message={error} />}
      {success && <StatusCard status="logged" message={success} />}

      {/* Invoice table */}
      <div className="section" style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Records</h2>
          <div className="chip-row">
            {[{ value: "all", label: "All" }, { value: "transport", label: "Transport" }, { value: "meal", label: "Meals" }].map(({ value, label }) => (
              <button key={value} type="button" className={`chip${filterCategory === value ? " selected" : ""}`} onClick={() => setFilterCategory(value)}>{label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : visible.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No {filterCategory === "all" ? "" : filterCategory + " "}invoices recorded for {MONTH_LABELS[selectedMonth - 1]} {year}.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Date", "Transport Type", "Appointment Address", "Appointment Reason", "File", "Amount", ""].map((h) => (
                    <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: h === "Amount" ? "right" : "left", fontWeight: 600, fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((inv, idx) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                    <td style={{ padding: "0.65rem 0.75rem", whiteSpace: "nowrap" }}>{formatDate(inv.date)}</td>
                    <td style={{ padding: "0.65rem 0.75rem" }}><CategoryBadge inv={inv} /></td>
                    <td style={{ padding: "0.65rem 0.75rem", fontWeight: 500 }}>{inv.vendor}</td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "var(--muted)", maxWidth: "200px" }}>{inv.description || "—"}</td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      {inv.source === "ride" ? (
                        <span style={{ display: "inline-block", fontSize: "0.75rem", color: "#0e7c86", background: "#e0f2f4", borderRadius: "999px", padding: "0.1rem 0.55rem", fontWeight: 600 }}>Ride Plan</span>
                      ) : inv.filename ? (
                        <a href={`/api/invoice-db/file/${inv.id}`} target="_blank" rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem", color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}
                          title={inv.filename}>
                          {inv.filename.endsWith(".pdf") ? "📄" : "🖼️"}{inv.filename.length > 20 ? inv.filename.slice(0, 18) + "…" : inv.filename}
                        </a>
                      ) : <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>—</span>}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", textAlign: "right", fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", whiteSpace: "nowrap" }}>{fmt(inv.amount)}</td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <button onClick={() => handleDelete(inv.id, inv.source)} className="btn btn-secondary" style={{ padding: "0.3rem 0.65rem", fontSize: "0.8rem", color: "#ef4444" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={5} style={{ padding: "0.65rem 0.75rem", fontWeight: 600, fontSize: "0.875rem" }}>
                    {filterCategory === "all" ? "Total" : filterCategory === "transport" ? "Transport Total" : "Meals Total"} — {MONTH_LABELS[selectedMonth - 1]} {year}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", textAlign: "right", fontWeight: 700, fontFamily: "Space Grotesk, sans-serif" }}>{fmt(visible.reduce((s, i) => s + i.amount, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Meal receipt match split-screen */}
      {mealRecords.length > 0 && (
        <div className="section" style={{ marginTop: "2rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <h2 style={{ margin: "0 0 0.2rem" }}>Meal Receipt Matches</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
              Each meal receipt is paired with the appointment it was associated with — confirming meals were consumed on appointment days.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {mealRecords.map((meal) => {
              const match = findTransportMatch(meal.date, meal.match_ref);
              return (
                <div key={meal.id} style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", alignItems: "stretch" }}>
                  {/* Meal card */}
                  <div style={{ background: "#fffbf0", border: "1px solid #ffe0a0", borderRadius: "12px 0 0 12px", padding: "1rem 1.25rem" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
                      Meal Receipt
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.2rem" }}>{meal.vendor || "—"}</div>
                    <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.35rem" }}>{formatDate(meal.date)}</div>
                    <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "#b45309" }}>
                      {fmt(meal.amount)}
                    </div>
                    {meal.filename && (
                      <a href={`/api/invoice-db/file/${meal.id}`} target="_blank" rel="noreferrer"
                        style={{ display: "inline-block", marginTop: "0.4rem", fontSize: "0.78rem", color: "var(--primary)", textDecoration: "none" }}>
                        {meal.filename.endsWith(".pdf") ? "📄" : "🖼️"} View receipt
                      </a>
                    )}
                  </div>

                  {/* Arrow connector — stretches to card height */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: match ? "#f0fdf4" : "#fff8f0", borderTop: `1px solid ${match ? "#bbf7d0" : "#fed7aa"}`, borderBottom: `1px solid ${match ? "#bbf7d0" : "#fed7aa"}`, fontSize: "1rem", color: match ? "#16a34a" : "#d97706" }}>
                    {match ? "→" : "⚠"}
                  </div>

                  {/* Appointment card */}
                  {match ? (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0 12px 12px 0", padding: "1rem 1.25rem" }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
                        Matched Appointment
                      </div>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.2rem" }}>{match.description || "Appointment"}</div>
                      <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.35rem" }}>{match.vendor}</div>
                      <div style={{ fontSize: "0.82rem", color: "#15803d", fontWeight: 500 }}>✓ {formatDate(match.date)}</div>
                    </div>
                  ) : (
                    <div style={{ background: "#fff8f0", border: "1px solid #fed7aa", borderRadius: "0 12px 12px 0", padding: "1rem 1.25rem" }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>
                        No Match Found
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#c2410c" }}>
                        No appointment found within ±1 day of {formatDate(meal.date)}.
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.3rem" }}>
                        This meal will not be counted as appointment-linked.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SVA Form Generator */}
      <div style={{ marginTop: "2rem", border: "1px solid #c8d8e4", borderRadius: "12px", overflow: "hidden" }}>
        <button
          onClick={() => setSvaOpen((o) => !o)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.5rem", background: "#eef6f8", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Generate SVA Transport Form (Form 5050)</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.15rem" }}>Auto-fills the monthly transport cost form for SVA St.Gallen from your saved invoice records</div>
          </div>
          <span style={{ fontSize: "1.2rem", color: "var(--muted)", marginLeft: "1rem" }}>{svaOpen ? "▲" : "▼"}</span>
        </button>

        {svaOpen && (
          <div style={{ padding: "1.5rem", background: "#f9fbfc" }}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label className="form-label">Month</label>
              {svaMonthOptions.length === 0 ? (
                <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.4rem" }}>No transport invoices recorded yet for {year}.</p>
              ) : (
                <div className="chip-row" style={{ marginTop: "0.5rem" }}>
                  {svaMonthOptions.map((m) => {
                    const label = new Date(m + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
                    return (
                      <button key={m} type="button" className={`chip${svaMonth === m ? " selected" : ""}`} onClick={() => setSvaMonth(m)}>{label}</button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label className="form-label">Last Name</label>
                <input type="text" className="form-input" placeholder="e.g., Mueller" value={svaName} onChange={(e) => setSvaName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">First Name</label>
                <input type="text" className="form-input" placeholder="e.g., Hans" value={svaVorname} onChange={(e) => setSvaVorname(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem", maxWidth: "300px" }}>
              <label className="form-label">AHV Number</label>
              <input type="text" className="form-input" placeholder="756.XXXX.XXXX.XX" value={svaAhv} onChange={(e) => setSvaAhv(e.target.value)} />
            </div>

            <div style={{ fontSize: "0.82rem", color: "var(--muted)", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: "8px", padding: "0.65rem 0.9rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
              <strong>Note:</strong> TixiTaxi and other transport services go in "Taxi and Other Transport Services". Public transport → "Public Transport Fare 2nd Class". Private car → "Private Car" (max CHF 0.70/km). The <em>Appointment Reason</em> and <em>Appointment Address</em> columns are filled from the values you entered during extraction.
            </div>

            <button className="btn btn-primary" onClick={generateSVAForm} disabled={!svaMonth || svaMonthOptions.length === 0}>
              Generate &amp; Print Form
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── File card component ────────────────────────────────────────────────────────

function FileCard({ item, onUpdate, onExtract, onRemove }) {
  const statusColors = { idle: "#f4f6f8", extracting: "#f0f9fa", saved: "#f0fdf4", error: "#fff5f5" };
  const statusBorders = { idle: "var(--border)", extracting: "#c8e6e9", saved: "#bbf7d0", error: "#fecaca" };

  return (
    <div style={{
      border: `1px solid ${statusBorders[item.status]}`,
      borderRadius: "12px",
      padding: "1rem 1.25rem",
      background: statusColors[item.status],
      transition: "all 200ms ease",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: item.status === "idle" ? "1rem" : "0.5rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span>{item.file.name.toLowerCase().endsWith(".pdf") ? "📄" : "🖼️"}</span>
          <span style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.file.name}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 400 }}>({(item.file.size / 1024).toFixed(0)} KB)</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {item.status === "extracting" && (
            <span style={{ fontSize: "0.8rem", color: "#0e7c86", fontWeight: 500 }}>Extracting…</span>
          )}
          {item.status === "saved" && (
            <span style={{ fontSize: "0.82rem", color: "#16a34a", fontWeight: 600 }}>✓ Saved</span>
          )}
          {item.status === "error" && (
            <span style={{ fontSize: "0.82rem", color: "#dc2626", fontWeight: 600 }}>✗ Failed</span>
          )}
          {(item.status === "idle" || item.status === "error") && (
            <button
              type="button"
              onClick={onRemove}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: "var(--muted)", lineHeight: 1, padding: "0 0.2rem" }}
              title="Remove"
            >✕</button>
          )}
        </div>
      </div>

      {/* Idle: show form fields */}
      {item.status === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="form-label" style={{ marginBottom: "0.3rem", display: "block" }}>
                Appointment Reason <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., physiotherapy, doctor visit"
                value={item.appointment_reason}
                onChange={(e) => onUpdate({ appointment_reason: e.target.value })}
              />
            </div>
            <div>
              <label className="form-label" style={{ marginBottom: "0.3rem", display: "block" }}>
                Appointment Address <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., St. Gallen Cantonal Hospital"
                value={item.appointment_address}
                onChange={(e) => onUpdate({ appointment_address: e.target.value })}
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: "0.875rem", padding: "0.45rem 1rem" }}
              onClick={onExtract}
              disabled={!item.appointment_reason.trim() || !item.appointment_address.trim()}
            >
              Extract &amp; Save
            </button>
          </div>
        </div>
      )}

      {/* Extracting: spinner text */}
      {item.status === "extracting" && (
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
          Sending to WatsonX invoice agent… this takes about 15–30 seconds.
        </p>
      )}

      {/* Saved: show summary */}
      {item.status === "saved" && item.result && (
        <div style={{ fontSize: "0.85rem", color: "#374151" }}>
          <span style={{ fontWeight: 500 }}>{formatDate(item.result.date)}</span>
          {" · "}
          <span>{TRANSPORT_TYPE_LABELS[item.result.transport_type] || item.result.transport_type}</span>
          {" · "}
          <span style={{ fontWeight: 600, fontFamily: "Space Grotesk, sans-serif" }}>{fmt(item.result.amount)}</span>
          <br />
          <span style={{ color: "var(--muted)" }}>{item.result.description}</span>
          {item.result.description && item.result.vendor ? " · " : ""}
          <span style={{ color: "var(--muted)" }}>{item.result.vendor}</span>
        </div>
      )}

      {/* Error: show message + retry */}
      {item.status === "error" && (
        <div>
          <p style={{ fontSize: "0.82rem", color: "#dc2626", margin: "0 0 0.5rem" }}>{item.error}</p>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "0.82rem", padding: "0.3rem 0.75rem" }}
            onClick={() => onUpdate({ status: "idle", error: null })}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function MealFileCard({ item, onUpdate, onExtract, onRemove }) {
  const statusColors = { idle: "#f4f6f8", extracting: "#fffbf0", saved: "#f0fdf4", error: "#fff5f5" };
  const statusBorders = { idle: "var(--border)", extracting: "#ffe0a0", saved: "#bbf7d0", error: "#fecaca" };

  return (
    <div style={{ border: `1px solid ${statusBorders[item.status]}`, borderRadius: "12px", padding: "1rem 1.25rem", background: statusColors[item.status], transition: "all 200ms ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: item.status === "idle" ? "0.75rem" : "0.4rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span>{item.file.name.toLowerCase().endsWith(".pdf") ? "📄" : "🖼️"}</span>
          <span style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.file.name}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 400 }}>({(item.file.size / 1024).toFixed(0)} KB)</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {item.status === "extracting" && <span style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 500 }}>Extracting…</span>}
          {item.status === "saved" && <span style={{ fontSize: "0.82rem", color: "#16a34a", fontWeight: 600 }}>✓ Saved</span>}
          {item.status === "error" && <span style={{ fontSize: "0.82rem", color: "#dc2626", fontWeight: 600 }}>✗ Failed</span>}
          {(item.status === "idle" || item.status === "error") && (
            <button type="button" onClick={onRemove}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1rem", color: "var(--muted)", lineHeight: 1, padding: "0 0.2rem" }}>✕</button>
          )}
        </div>
      </div>

      {item.status === "idle" && (
        <button type="button" className="btn btn-primary"
          style={{ fontSize: "0.875rem", padding: "0.45rem 1rem" }}
          onClick={onExtract}>
          Extract &amp; Match
        </button>
      )}

      {item.status === "extracting" && (
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
          Sending to meal agent… extracting date, vendor, and amount.
        </p>
      )}

      {item.status === "saved" && item.result && (
        <div style={{ fontSize: "0.85rem", color: "#374151" }}>
          <span style={{ fontWeight: 500 }}>{formatDate(item.result.date)}</span>
          {" · "}
          <span>{item.result.vendor || "—"}</span>
          {" · "}
          <span style={{ fontWeight: 600, fontFamily: "Space Grotesk, sans-serif" }}>{fmt(item.result.amount)}</span>
          {item.matchInfo ? (
            <div style={{ marginTop: "0.35rem", fontSize: "0.8rem", color: "#16a34a", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span>✓ Matched →</span>
              <span style={{ fontWeight: 500 }}>{item.matchInfo.description}</span>
              {item.matchInfo.vendor && <span style={{ color: "var(--muted)" }}>· {item.matchInfo.vendor}</span>}
              <span style={{ color: "var(--muted)" }}>· {formatDate(item.matchInfo.date)}</span>
            </div>
          ) : (
            <div style={{ marginTop: "0.35rem", fontSize: "0.8rem", color: "#b45309" }}>
              ⚠ No appointment found within ±1 day — saved as unmatched meal
            </div>
          )}
        </div>
      )}

      {item.status === "error" && (
        <div>
          <p style={{ fontSize: "0.82rem", color: "#dc2626", margin: "0 0 0.5rem" }}>{item.error}</p>
          <button type="button" className="btn btn-secondary"
            style={{ fontSize: "0.82rem", padding: "0.3rem 0.75rem" }}
            onClick={() => onUpdate({ status: "idle", error: null })}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryBadge({ inv }) {
  if (inv.category === "meal") {
    return (
      <span style={{ display: "inline-block", background: "#fff0cc", color: "#92570a", borderRadius: "999px", padding: "0.2rem 0.65rem", fontSize: "0.78rem", fontWeight: 600 }}>
        Meal
      </span>
    );
  }
  const color = TRANSPORT_TYPE_COLORS[inv.transport_type] || "#5b6670";
  const label = TRANSPORT_TYPE_LABELS[inv.transport_type] || "Transport";
  return (
    <span style={{ display: "inline-block", background: color + "18", color, borderRadius: "999px", padding: "0.2rem 0.65rem", fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}
