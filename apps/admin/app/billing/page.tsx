"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type BillHead, type BillingCycle, type CycleEstimate, type CyclePreview } from "../lib/api";

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left", borderBottom: "1px solid #ddd" };
const td: React.CSSProperties = { padding: "0.5rem", borderBottom: "1px solid #eee" };

export default function BillingPage() {
  const router = useRouter();
  const [heads, setHeads] = useState<BillHead[]>([]);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<CyclePreview | null>(null);
  const [previewCycleId, setPreviewCycleId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [estimate, setEstimate] = useState<CycleEstimate | null>(null);
  const [estimateCycleId, setEstimateCycleId] = useState<string | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [skipped, setSkipped] = useState<Array<{ unitId: string; reason: string }> | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);

  // New bill head form
  const [newHead, setNewHead] = useState({ name: "", computeRule: "fixed", rate: 0 });

  // New cycle form
  const [newCycle, setNewCycle] = useState({ period: "", dueDate: "" });

  useEffect(() => {
    Promise.all([api.listBillHeads(), api.listBillingCycles()])
      .then(([h, c]) => { setHeads(h); setCycles(c); })
      .catch(() => router.push("/login"));
  }, []);

  async function createHead() {
    try {
      const h = await api.createBillHead({ ...newHead, taxRule: { type: "none" } });
      setHeads((prev) => [...prev, h]);
      setNewHead({ name: "", computeRule: "fixed", rate: 0 });
      setMsg("Bill head created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function toggleHead(h: BillHead) {
    try {
      const updated = await api.updateBillHead(h.id, { isActive: !h.isActive });
      setHeads((prev) => prev.map((x) => (x.id === h.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function createCycle() {
    try {
      const c = await api.createBillingCycle(newCycle);
      setCycles((prev) => [c, ...prev]);
      setNewCycle({ period: "", dueDate: "" });
      setMsg("Billing cycle created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function openEstimate(cycleId: string) {
    setEstimateLoading(true);
    setEstimateCycleId(cycleId);
    setEstimate(null);
    setSkipped(null);
    setError("");
    try {
      const data = await api.estimateCycle(cycleId);
      setEstimate(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading estimate");
    } finally {
      setEstimateLoading(false);
    }
  }

  async function generateBills(cycleId: string) {
    setGenerateLoading(true);
    try {
      const r = await api.generateBills(cycleId);
      setMsg(`Generated ${r.billsGenerated} bills${r.skipped.length > 0 ? ` (${r.skipped.length} units skipped)` : ""}`);
      setSkipped(r.skipped.length > 0 ? r.skipped : null);
      setEstimate(null);
      setEstimateCycleId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setGenerateLoading(false);
    }
  }

  async function openPublishPreview(cycleId: string) {
    setPreviewLoading(true);
    setPreviewCycleId(cycleId);
    setPreview(null);
    setError("");
    try {
      const data = await api.previewCycle(cycleId);
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmPublish() {
    if (!previewCycleId) return;
    try {
      const updated = await api.publishCycle(previewCycleId);
      setCycles((prev) => prev.map((c) => (c.id === previewCycleId ? updated : c)));
      setMsg("Cycle published");
      setPreview(null);
      setPreviewCycleId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  const statusBadge = (s: string) => {
    const color = s === "closed" ? "#666" : s === "published" ? "#0a7" : "#c80";
    return <span style={{ color, fontWeight: 600 }}>{s.toUpperCase()}</span>;
  };

  return (
    <div>
      <h1 style={{ marginBottom: "1.5rem" }}>Billing</h1>
      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}
      {msg && <p style={{ color: "green", marginBottom: "1rem" }}>{msg}</p>}

      <section style={{ marginBottom: "2rem" }}>
        <h2>Bill Heads</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Compute Rule</th>
              <th style={th}>Rate (₹)</th>
              <th style={th}>Active</th>
            </tr>
          </thead>
          <tbody>
            {heads.map((h) => (
              <tr key={h.id}>
                <td style={td}>{h.name}</td>
                <td style={td}>{h.computeRule}</td>
                <td style={td}>{h.rate.toFixed(2)}</td>
                <td style={td}>
                  <button onClick={() => toggleHead(h)} style={{ fontSize: "0.8rem" }}>
                    {h.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <fieldset style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <legend>New Bill Head</legend>
          <input
            placeholder="Name"
            value={newHead.name}
            onChange={(e) => setNewHead((p) => ({ ...p, name: e.target.value }))}
            style={{ padding: "0.3rem", width: 150 }}
          />
          <select
            value={newHead.computeRule}
            onChange={(e) => setNewHead((p) => ({ ...p, computeRule: e.target.value }))}
            style={{ padding: "0.3rem" }}
          >
            <option value="fixed">Fixed</option>
            <option value="flat_per_unit">Flat per unit</option>
            <option value="per_sqft">Per sqft</option>
            <option value="metered">Metered</option>
          </select>
          <input
            type="number"
            placeholder="Rate"
            value={newHead.rate}
            onChange={(e) => setNewHead((p) => ({ ...p, rate: Number(e.target.value) }))}
            style={{ padding: "0.3rem", width: 80 }}
          />
          <button onClick={createHead} style={{ padding: "0.3rem 0.8rem" }}>Add</button>
        </fieldset>
      </section>

      {/* Skipped units report */}
      {skipped && skipped.length > 0 && (
        <div style={{ border: "1px solid #fcd34d", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem", background: "#fffbeb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <p style={{ fontWeight: 600, margin: 0, color: "#92400e" }}>⚠ {skipped.length} units skipped during generation</p>
            <button onClick={() => setSkipped(null)} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>✕</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#fef3c7" }}>
              <th style={{ padding: "0.3rem 0.5rem", textAlign: "left" }}>Unit ID</th>
              <th style={{ padding: "0.3rem 0.5rem", textAlign: "left" }}>Reason</th>
            </tr></thead>
            <tbody>
              {skipped.map((s) => (
                <tr key={s.unitId} style={{ borderTop: "1px solid #fde68a" }}>
                  <td style={{ padding: "0.3rem 0.5rem", fontFamily: "monospace", fontSize: 11 }}>{s.unitId}</td>
                  <td style={{ padding: "0.3rem 0.5rem", color: "#92400e" }}>{s.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate estimate panel */}
      {estimateCycleId && (
        <div style={{ border: "1px solid #bfdbfe", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem", background: "#eff6ff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>Pre-Generate Estimate — {estimate?.period ?? "…"}</h3>
            <button onClick={() => { setEstimate(null); setEstimateCycleId(null); }} style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>✕ Cancel</button>
          </div>
          {estimateLoading ? (
            <p style={{ color: "#6b7280" }}>Loading estimate…</p>
          ) : estimate ? (
            <>
              <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "0.5rem 0.75rem", minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Eligible units</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{estimate.eligibleUnits}</div>
                </div>
                <div style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "0.5rem 0.75rem", minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Active bill heads</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{estimate.activeHeads}</div>
                </div>
                {estimate.hasMeteredHeads && (
                  <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "0.5rem 0.75rem", minWidth: 200 }}>
                    <div style={{ fontSize: 11, color: "#92400e" }}>Has metered heads</div>
                    <div style={{ fontSize: 12, color: "#92400e", marginTop: 2 }}>Units without meter readings will be skipped</div>
                  </div>
                )}
              </div>
              {estimate.activeHeads === 0 ? (
                <p style={{ color: "#dc2626", fontSize: 13 }}>No active bill heads — add at least one bill head before generating.</p>
              ) : (
                <button
                  onClick={() => generateBills(estimateCycleId!)}
                  disabled={generateLoading}
                  style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "0.4rem 1rem", cursor: generateLoading ? "wait" : "pointer", fontWeight: 600 }}
                >
                  {generateLoading ? "Generating…" : `Generate Bills for ${estimate.eligibleUnits} Units`}
                </button>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Publish preview panel */}
      {previewCycleId && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "1.25rem", marginBottom: "1.5rem", background: "#fafafa" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>Pre-Publish Review — {preview?.period ?? "…"}</h3>
            <button onClick={() => { setPreview(null); setPreviewCycleId(null); }} style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>✕ Cancel</button>
          </div>

          {previewLoading ? (
            <p style={{ color: "#6b7280" }}>Loading preview…</p>
          ) : preview ? (
            <>
              {preview.totalBills === 0 ? (
                <p style={{ color: "#dc2626" }}>No bills generated yet. Run Generate before publishing.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
                  <StatCard label="Total bills" value={String(preview.totalBills)} />
                  <StatCard label="Total amount" value={`₹${preview.totalAmount.toLocaleString()}`} />
                  <StatCard label="Average bill" value={`₹${preview.avgAmount.toLocaleString()}`} />
                  <StatCard label="Highest bill" value={`₹${preview.maxBill.toLocaleString()}`} />
                  <StatCard label="Zero-amount bills" value={String(preview.zeroBillCount)} warn={preview.zeroBillCount > 0} />
                  {preview.changePercent !== null && (
                    <StatCard
                      label="vs last cycle avg"
                      value={`${preview.changePercent > 0 ? "+" : ""}${preview.changePercent}%`}
                      warn={Math.abs(preview.changePercent) > 20}
                    />
                  )}
                </div>
              )}

              {preview.changePercent !== null && Math.abs(preview.changePercent) > 20 && (
                <p style={{ color: "#d97706", fontSize: 13, marginBottom: "0.75rem" }}>
                  ⚠ Average bill is {Math.abs(preview.changePercent)}% {preview.changePercent > 0 ? "higher" : "lower"} than last month. Verify bill heads before publishing.
                </p>
              )}

              {preview.totalBills > 0 && (
                <button
                  onClick={confirmPublish}
                  style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, padding: "0.4rem 1rem", cursor: "pointer", fontWeight: 600 }}
                >
                  Confirm & Publish {preview.totalBills} Bills
                </button>
              )}
            </>
          ) : null}
        </div>
      )}

      <section>
        <h2>Billing Cycles</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr>
              <th style={th}>Period</th>
              <th style={th}>Due Date</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => (
              <tr key={c.id}>
                <td style={td}>{c.period}</td>
                <td style={td}>{c.dueDate}</td>
                <td style={td}>{statusBadge(c.status)}</td>
                <td style={{ ...td, display: "flex", gap: "0.4rem" }}>
                  {c.status === "draft" && (
                    <>
                      <button
                        onClick={() => openEstimate(c.id)}
                        style={{ fontSize: "0.8rem", background: estimateCycleId === c.id ? "#dbeafe" : undefined }}
                      >
                        Generate…
                      </button>
                      <button
                        onClick={() => openPublishPreview(c.id)}
                        style={{ fontSize: "0.8rem", background: previewCycleId === c.id ? "#f3f4f6" : undefined }}
                      >
                        Review & Publish
                      </button>
                    </>
                  )}
                  <a href={`/billing/cycles/${c.id}`} style={{ fontSize: "0.8rem" }}>View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <fieldset style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <legend>New Cycle</legend>
          <input
            placeholder="Period (YYYY-MM)"
            value={newCycle.period}
            onChange={(e) => setNewCycle((p) => ({ ...p, period: e.target.value }))}
            style={{ padding: "0.3rem", width: 140 }}
          />
          <input
            placeholder="Due Date (YYYY-MM-DD)"
            value={newCycle.dueDate}
            onChange={(e) => setNewCycle((p) => ({ ...p, dueDate: e.target.value }))}
            style={{ padding: "0.3rem", width: 160 }}
          />
          <button onClick={createCycle} style={{ padding: "0.3rem 0.8rem" }}>Create Cycle</button>
        </fieldset>
      </section>
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{
      background: warn ? "#fff7ed" : "#fff",
      border: `1px solid ${warn ? "#fed7aa" : "#e5e7eb"}`,
      borderRadius: 6,
      padding: "0.6rem 0.75rem",
    }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: warn ? "#d97706" : "#111" }}>{value}</div>
    </div>
  );
}
