"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type BillHead, type BillingCycle } from "../lib/api";

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left", borderBottom: "1px solid #ddd" };
const td: React.CSSProperties = { padding: "0.5rem", borderBottom: "1px solid #eee" };

export default function BillingPage() {
  const router = useRouter();
  const [heads, setHeads] = useState<BillHead[]>([]);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

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

  async function generateBills(cycleId: string) {
    try {
      const r = await api.generateBills(cycleId);
      setMsg(`Generated ${r.billsGenerated} bills`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function publishCycle(cycleId: string) {
    try {
      const updated = await api.publishCycle(cycleId);
      setCycles((prev) => prev.map((c) => (c.id === cycleId ? updated : c)));
      setMsg("Cycle published");
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
                      <button onClick={() => generateBills(c.id)} style={{ fontSize: "0.8rem" }}>Generate</button>
                      <button onClick={() => publishCycle(c.id)} style={{ fontSize: "0.8rem" }}>Publish</button>
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
