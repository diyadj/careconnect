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

  // Upload state
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

  // Load profile to pre-fill SVA fields
  useEffect(() => {
    api.get("/profile").then((res) => {
      const p = res.data;
      if (p.child_last_name) setSvaName(p.child_last_name);
      if (p.child_first_name) setSvaVorname(p.child_first_name);
      if (p.child_ahv_number) setSvaAhv(p.child_ahv_number);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [year]);

  // Keep SVA month in sync with selected month/year
  useEffect(() => {
    if (selectedMonth) {
      setSvaMonth(`${year}-${String(selectedMonth).padStart(2, "0")}`);
    }
  }, [selectedMonth, year]);

  async function loadInvoices() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/invoice-db", { params: { year } });
      setInvoices(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError("Failed to load invoices.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function setMetaField(key, value) {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  function clearUpload() {
    setSelectedFile(null);
    setMeta(EMPTY_META);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
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
      console.error(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this invoice record and its file?")) return;
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/invoice-db/${id}`);
      setSuccess("Invoice deleted.");
      await loadInvoices();
    } catch {
      setError("Failed to delete invoice.");
    }
  }

  // Derived data
  const monthPrefix = `${year}-${String(selectedMonth).padStart(2, "0")}`;
  const monthInvoices = invoices.filter((i) => i.date.startsWith(monthPrefix));

  const visible =
    filterCategory === "all"
      ? monthInvoices
      : monthInvoices.filter((i) => i.category === filterCategory);

  const transportTotal = monthInvoices
    .filter((i) => i.category === "transport")
    .reduce((s, i) => s + i.amount, 0);

  const mealTotal = monthInvoices
    .filter((i) => i.category === "meal")
    .reduce((s, i) => s + i.amount, 0);

  const grandTotal = transportTotal + mealTotal;

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  // SVA helpers — month options from all year invoices so user can still pick any month
  const svaMonthOptions = Array.from(
    new Set(
      invoices
        .filter((i) => i.category === "transport")
        .map((i) => i.date.slice(0, 7))
    )
  ).sort();

  function generateSVAForm() {
    if (!svaMonth) { alert("Please select a month."); return; }

    const monthInvoices = invoices
      .filter((i) => i.category === "transport" && i.date.startsWith(svaMonth))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (monthInvoices.length === 0) {
      alert("No transport invoices found for that month.");
      return;
    }

    const [mYear, mMonth] = svaMonth.split("-");
    const monthName = new Date(Number(mYear), Number(mMonth) - 1, 1)
      .toLocaleDateString("de-CH", { month: "long", year: "numeric" });

    function chf(val) { return val > 0 ? `CHF ${Number(val).toFixed(2)}` : ""; }
    function swissDate(iso) { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; }

    let totalOV = 0, totalPrivat = 0, totalTaxi = 0, totalAll = 0;

    const rows = monthInvoices.map((inv) => {
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
    <div><div class="sva-logo">SVA</div><div style="font-size:8pt;line-height:1.5">Sozialversicherungsanstalt<br>des Kantons St.Gallen</div></div>
    <div class="sva-address">Brauerstrasse 54 &nbsp; Tel. 071 282 69 37<br>Postfach &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Fax 071 282 69 10<br>9016 St.Gallen &nbsp;&nbsp;&nbsp; www.svasg.ch</div>
  </div>
  <h1>Monatliche Abrechnung Transportkosten zu den Ergänzungsleistungen</h1>
  <div class="fields">
    <div class="field-box"><div class="field-label">Name</div><div class="field-val">${svaName}</div></div>
    <div class="field-box"><div class="field-label">Vorname</div><div class="field-val">${svaVorname}</div></div>
  </div>
  <div class="ahv-row">
    <div class="field-box"><div class="field-label">AHV-Nummer</div><div class="field-val">${svaAhv}</div></div>
    <div class="field-box"><div class="field-label">für den Monat</div><div class="field-val">${monthName}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Reisedatum</th><th>Behandlungsgrund</th><th>Behandlungsort</th>
      <th>Billetpreis ÖV<br>2. Klasse</th><th>Privatauto</th>
      <th>Taxi und andere<br>Fahrdienste</th><th>Total</th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3">Total Transportkosten</td>
      <td class="num">${chf(totalOV)}</td><td class="num">${chf(totalPrivat)}</td>
      <td class="num">${chf(totalTaxi)}</td><td class="num total-col">CHF ${totalAll.toFixed(2)}</td>
    </tr></tfoot>
  </table>
  <div class="stamp-box">Terminbestätigung von allen Durchführungsstellen (Stempel)</div>
  <p style="font-size:9pt;margin-bottom:.6rem">Der/Die unterzeichnende Versicherte bestätigt die obigen Angaben</p>
  <div class="sig-row">
    <div><div class="sig-line"></div><div class="sig-label">Datum</div></div>
    <div><div class="sig-line"></div><div class="sig-label">Unterschrift</div></div>
  </div>
  <p class="note">▶ Bitte an die SVA St.Gallen (online über www.svasg.ch/kk-belege oder per Post) senden.</p>
  <p style="font-size:7.5pt;color:#888;margin-top:1.2rem;text-align:right">AHV-Nummer ${svaAhv} &nbsp;|&nbsp; Seite 2|2 &nbsp;|&nbsp; Form. 5050 01.25</p>
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.print();
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Invoice Records</h1>
        <p className="page-subtitle">
          Upload and store transport and meal invoices. Use as your reference when filing reimbursements.
        </p>
      </div>

      {/* Year + Month selectors */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="form-label" style={{ margin: 0, minWidth: "46px" }}>Year</span>
          <div className="chip-row">
            {yearOptions.map((y) => (
              <button
                key={y}
                type="button"
                className={`chip${year === y ? " selected" : ""}`}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
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
                    <span
                      style={{
                        position: "absolute",
                        top: "3px",
                        right: "4px",
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        background: "var(--primary)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[
          { label: "Transport", value: transportTotal, color: "#0e7c86", bg: "#f0f9fa" },
          { label: "Meals", value: mealTotal, color: "#6366f1", bg: "#f5f5ff" },
          { label: "Total", value: grandTotal, color: "#111", bg: "#f4f6f8" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ background: bg, border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600, marginBottom: "0.15rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {label}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.3rem" }}>
              {MONTH_LABELS[selectedMonth - 1]} {year}
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color, fontFamily: "Space Grotesk, sans-serif" }}>
              {fmt(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Upload zone */}
      <div className="section" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "1rem" }}>Upload Invoice</h3>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragOver ? "var(--primary)" : "var(--border)"}`,
            borderRadius: "12px",
            padding: "2.5rem 2rem",
            textAlign: "center",
            cursor: selectedFile ? "default" : "pointer",
            background: isDragOver ? "rgba(14,124,134,0.06)" : "#fafbfc",
            transition: "all 150ms ease",
          }}
        >
          {selectedFile ? (
            <div style={{ fontSize: "0.95rem" }}>
              <div style={{ fontSize: "1.75rem", marginBottom: "0.4rem" }}>
                {selectedFile.name.endsWith(".pdf") ? "📄" : "🖼️"}
              </div>
              <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>{selectedFile.name}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: "2.25rem", marginBottom: "0.5rem" }}>📂</div>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Drop invoice here</div>
              <div style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                or click to browse — PDF, JPG, PNG
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
          />
        </div>

        {/* Metadata panel — only shown when a file is selected */}
        {selectedFile && (
          <form onSubmit={handleUpload}>
            <div
              style={{
                marginTop: "1rem",
                padding: "1.25rem",
                background: "#f0f9fa",
                borderRadius: "12px",
                border: "1px solid #c8e6e9",
              }}
            >
              {/* Category */}
              <div style={{ marginBottom: "1rem" }}>
                <label className="form-label">Category</label>
                <div className="chip-row" style={{ marginTop: "0.4rem" }}>
                  {[
                    { value: "transport", label: "Transport" },
                    { value: "meal", label: "Meal" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip${meta.category === value ? " selected" : ""}`}
                      onClick={() => {
                        setMetaField("category", value);
                        if (value !== "transport") setMetaField("transport_type", "");
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transport type */}
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
                      <button
                        key={value}
                        type="button"
                        className={`chip${meta.transport_type === value ? " selected" : ""}`}
                        onClick={() => setMetaField("transport_type", value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date, Vendor, Amount */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label className="form-label">Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={meta.date}
                    onChange={(e) => setMetaField("date", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Vendor / Provider *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., TixiTaxi AG, SBB"
                    value={meta.vendor}
                    onChange={(e) => setMetaField("vendor", e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Amount (CHF) *</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={meta.amount}
                    onChange={(e) => setMetaField("amount", e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Therapy trip – St. Gallen to Zurich"
                  value={meta.description}
                  onChange={(e) => setMetaField("description", e.target.value)}
                />
              </div>

              <div className="button-row">
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? "Uploading…" : "Save Invoice"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={clearUpload}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {error && <StatusCard status="error" message={error} />}
      {success && <StatusCard status="logged" message={success} />}

      {/* Invoice table */}
      <div className="section" style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>
            Records{" "}
            <span style={{ fontSize: "1rem", fontWeight: 400, color: "var(--muted)" }}>
              ({visible.length})
            </span>
          </h2>
          <div className="chip-row">
            {[
              { value: "all", label: "All" },
              { value: "transport", label: "Transport" },
              { value: "meal", label: "Meals" },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`chip${filterCategory === value ? " selected" : ""}`}
                onClick={() => setFilterCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : visible.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No {filterCategory === "all" ? "" : filterCategory + " "}invoices recorded for {MONTH_LABELS[selectedMonth - 1]} {year}.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  {["Date", "Category", "Vendor", "Description", "File", "Amount", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.6rem 0.75rem",
                        textAlign: h === "Amount" ? "right" : "left",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        color: "var(--muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((inv, idx) => (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: idx % 2 === 0 ? "#ffffff" : "#fafbfc",
                    }}
                  >
                    <td style={{ padding: "0.65rem 0.75rem", whiteSpace: "nowrap" }}>
                      {formatDate(inv.date)}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      <CategoryBadge inv={inv} />
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", fontWeight: 500 }}>
                      {inv.vendor}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", color: "var(--muted)", maxWidth: "200px" }}>
                      {inv.description || "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem" }}>
                      {inv.filename ? (
                        <a
                          href={`/api/invoice-db/file/${inv.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            fontSize: "0.82rem",
                            color: "var(--primary)",
                            textDecoration: "none",
                            fontWeight: 500,
                          }}
                          title={inv.filename}
                        >
                          {inv.filename.endsWith(".pdf") ? "📄" : "🖼️"}
                          {inv.filename.length > 20
                            ? inv.filename.slice(0, 18) + "…"
                            : inv.filename}
                        </a>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", textAlign: "right", fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", whiteSpace: "nowrap" }}>
                      {fmt(inv.amount)}
                    </td>
                    <td style={{ padding: "0.65rem 0.75rem", whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => handleDelete(inv.id)}
                        className="btn btn-secondary"
                        style={{ padding: "0.3rem 0.65rem", fontSize: "0.8rem", color: "#ef4444" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={5} style={{ padding: "0.65rem 0.75rem", fontWeight: 600, fontSize: "0.875rem" }}>
                    {filterCategory === "all" ? "Total" : filterCategory === "transport" ? "Transport Total" : "Meals Total"} — {MONTH_LABELS[selectedMonth - 1]} {year}
                  </td>
                  <td style={{ padding: "0.65rem 0.75rem", textAlign: "right", fontWeight: 700, fontFamily: "Space Grotesk, sans-serif" }}>
                    {fmt(visible.reduce((s, i) => s + i.amount, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* SVA Form Generator */}
      <div style={{ marginTop: "2rem", border: "1px solid #c8d8e4", borderRadius: "12px", overflow: "hidden" }}>
        <button
          onClick={() => setSvaOpen((o) => !o)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem",
            background: "#eef6f8",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Generate SVA Transport Form (Form 5050)
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.15rem" }}>
              Auto-fills the monthly transport cost form for SVA St.Gallen from your invoice records
            </div>
          </div>
          <span style={{ fontSize: "1.2rem", color: "var(--muted)", marginLeft: "1rem" }}>
            {svaOpen ? "▲" : "▼"}
          </span>
        </button>

        {svaOpen && (
          <div style={{ padding: "1.5rem", background: "#f9fbfc" }}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label className="form-label">Month</label>
              {svaMonthOptions.length === 0 ? (
                <p style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.4rem" }}>
                  No transport invoices recorded yet for {year}.
                </p>
              ) : (
                <div className="chip-row" style={{ marginTop: "0.5rem" }}>
                  {svaMonthOptions.map((m) => {
                    const label = new Date(m + "-01").toLocaleDateString("de-CH", { month: "long", year: "numeric" });
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`chip${svaMonth === m ? " selected" : ""}`}
                        onClick={() => setSvaMonth(m)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label className="form-label">Name (Familienname)</label>
                <input type="text" className="form-input" placeholder="e.g., Müller" value={svaName} onChange={(e) => setSvaName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Vorname</label>
                <input type="text" className="form-input" placeholder="e.g., Hans" value={svaVorname} onChange={(e) => setSvaVorname(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem", maxWidth: "300px" }}>
              <label className="form-label">AHV-Nummer</label>
              <input type="text" className="form-input" placeholder="756.XXXX.XXXX.XX" value={svaAhv} onChange={(e) => setSvaAhv(e.target.value)} />
            </div>

            <div style={{ fontSize: "0.82rem", color: "var(--muted)", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: "8px", padding: "0.65rem 0.9rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
              <strong>Note:</strong> TixiTaxi and other Fahrdienste go in "Taxi und andere Fahrdienste". Public transport → "ÖV 2. Klasse". Private car → "Privatauto" (max CHF 0.70/km).
            </div>

            <button
              className="btn btn-primary"
              onClick={generateSVAForm}
              disabled={!svaMonth || svaMonthOptions.length === 0}
            >
              Generate &amp; Print Form
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryBadge({ inv }) {
  if (inv.category === "meal") {
    return (
      <span style={{ display: "inline-block", background: "#ede9fe", color: "#5b21b6", borderRadius: "999px", padding: "0.2rem 0.65rem", fontSize: "0.78rem", fontWeight: 600 }}>
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
