"use client";

import { useEffect, useState } from "react";
import { api, type ParkingAllocation } from "../lib/api";

export default function ParkingPage() {
  const [allocations, setAllocations] = useState<ParkingAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [spotId, setSpotId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [period, setPeriod] = useState("");
  const [rentAmount, setRentAmount] = useState("0");
  const [cycleId, setCycleId] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.listParkingAllocations();
      setAllocations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await api.createParkingAllocation({
        spotId: spotId.trim(),
        unitId: unitId.trim(),
        period: period.trim(),
        rentAmount: parseFloat(rentAmount),
        startsAt: new Date().toISOString(),
        cycleId: cycleId.trim() || undefined,
      });
      setMsg(`Allocation created${result.billId ? ` — bill ${result.billId.slice(0, 8)}… generated` : ""}`);
      setShowForm(false);
      setSpotId(""); setUnitId(""); setPeriod(""); setRentAmount("0"); setCycleId("");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleEnd(id: string) {
    try {
      await api.endParkingAllocation(id);
      setMsg("Allocation ended");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Parking Allocations</h1>
        <button onClick={() => setShowForm(!showForm)}>+ Allocate Spot</button>
      </div>
      {msg && <p style={{ color: "#7c3aed" }}>{msg}</p>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: "#f9f9f9", padding: "1rem", borderRadius: 8, marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 440 }}>
          <label style={{ fontWeight: 600 }}>Spot ID (UUID)</label>
          <input value={spotId} onChange={(e) => setSpotId(e.target.value)} required placeholder="parking spot UUID" style={{ padding: "0.4rem", fontFamily: "monospace" }} />
          <label style={{ fontWeight: 600 }}>Unit ID (UUID)</label>
          <input value={unitId} onChange={(e) => setUnitId(e.target.value)} required placeholder="unit UUID" style={{ padding: "0.4rem", fontFamily: "monospace" }} />
          <label style={{ fontWeight: 600 }}>Period (e.g. 2024-01)</label>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} required placeholder="2024-01" style={{ padding: "0.4rem" }} />
          <label style={{ fontWeight: 600 }}>Monthly Rent (₹, 0 for owned spots)</label>
          <input type="number" min="0" step="0.01" value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} style={{ padding: "0.4rem" }} />
          {parseFloat(rentAmount) > 0 && (
            <>
              <label style={{ fontWeight: 600 }}>Billing Cycle ID (required for rental billing)</label>
              <input value={cycleId} onChange={(e) => setCycleId(e.target.value)} placeholder="billing cycle UUID" style={{ padding: "0.4rem", fontFamily: "monospace" }} />
            </>
          )}
          <button type="submit" style={{ marginTop: "0.5rem" }}>Create Allocation</button>
        </form>
      )}

      {loading ? <p>Loading…</p> : allocations.length === 0 ? (
        <p>No active parking allocations.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ background: "#f5f5f5" }}>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Spot ID</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Unit ID</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Period</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Rent (₹)</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Bill</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Since</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Actions</th>
          </tr></thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: 12 }}>{a.spotId.slice(0, 8)}…</td>
                <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: 12 }}>{a.unitId.slice(0, 8)}…</td>
                <td style={{ padding: "0.5rem" }}>{a.period}</td>
                <td style={{ padding: "0.5rem" }}>{a.rentAmount > 0 ? `₹${a.rentAmount}` : "Owned"}</td>
                <td style={{ padding: "0.5rem" }}>
                  {a.billId ? <span style={{ color: "#2563eb" }}>{a.billId.slice(0, 8)}…</span> : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>{new Date(a.startsAt).toLocaleDateString()}</td>
                <td style={{ padding: "0.5rem" }}>
                  <button onClick={() => handleEnd(a.id)} style={{ fontSize: 12, padding: "2px 8px", color: "#dc2626" }}>End</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
