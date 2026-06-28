"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Bill, type CollectionSummary } from "../../../lib/api";

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left", borderBottom: "1px solid #ddd" };
const td: React.CSSProperties = { padding: "0.5rem", borderBottom: "1px solid #eee" };

const STATUS_COLORS: Record<string, string> = {
  paid: "#0a7",
  partial: "#c80",
  overdue: "#c00",
  unpaid: "#666",
};

export default function CyclePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getCycleSummary(id), api.listCycleBills(id)])
      .then(([s, b]) => { setSummary(s); setBills(b); })
      .catch(() => router.push("/login"));
  }, [id]);

  if (!summary) return <p>Loading…</p>;

  const collectionRate = summary.totalDue > 0
    ? ((summary.totalCollected / summary.totalDue) * 100).toFixed(1)
    : "0.0";

  return (
    <div>
      <a href="/billing" style={{ fontSize: "0.9rem", color: "#555" }}>← Billing</a>
      <h1 style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
        Cycle: {summary.period} — <span style={{ fontSize: "0.8em", color: "#666" }}>{summary.status.toUpperCase()}</span>
      </h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={{ display: "flex", gap: "1.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        {[
          { label: "Total Bills", value: summary.totalBills },
          { label: "Paid", value: summary.paid, color: "#0a7" },
          { label: "Partial", value: summary.partial, color: "#c80" },
          { label: "Overdue", value: summary.overdue, color: "#c00" },
          { label: "Unpaid", value: summary.unpaid, color: "#666" },
          { label: "Total Due", value: `₹${summary.totalDue.toFixed(2)}` },
          { label: "Collected", value: `₹${summary.totalCollected.toFixed(2)}` },
          { label: "Collection %", value: `${collectionRate}%` },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: 6, minWidth: 100 }}>
            <div style={{ fontSize: "0.75rem", color: "#888" }}>{label}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: color ?? "#000" }}>{value}</div>
          </div>
        ))}
      </section>

      <h2>Bills</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Unit ID</th>
            <th style={th}>Status</th>
            <th style={th}>Subtotal</th>
            <th style={th}>Tax</th>
            <th style={th}>Arrears</th>
            <th style={th}>Total Due</th>
            <th style={th}>Paid</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => (
            <tr key={b.id}>
              <td style={td}>{b.unitId.slice(0, 8)}…</td>
              <td style={td}>
                <span style={{ color: STATUS_COLORS[b.status] ?? "#000", fontWeight: 600 }}>
                  {b.status.toUpperCase()}
                </span>
              </td>
              <td style={td}>₹{b.subtotal.toFixed(2)}</td>
              <td style={td}>₹{b.taxTotal.toFixed(2)}</td>
              <td style={td}>₹{b.arrearsCarryForward.toFixed(2)}</td>
              <td style={td}>₹{b.totalDue.toFixed(2)}</td>
              <td style={td}>₹{b.paidAmount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
