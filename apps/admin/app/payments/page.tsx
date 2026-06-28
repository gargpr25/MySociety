"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, type Payment } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  captured: "#0a7",
  pending: "#c80",
  failed: "#c00",
  refunded: "#888",
};

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconResult, setReconResult] = useState<{ reconciled: number; checked: number } | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.listPayments().then(setPayments).catch((e: Error) => setError(e.message));
  }, [router]);

  async function reconcile() {
    setReconciling(true);
    setReconResult(null);
    try {
      const result = await api.reconcilePayments();
      setReconResult(result);
      const updated = await api.listPayments();
      setPayments(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconciling(false);
    }
  }

  const th: React.CSSProperties = { padding: "0.4rem 0.6rem", textAlign: "left", borderBottom: "1px solid #ddd", fontSize: "0.8rem", color: "#555" };
  const td: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid #eee", fontSize: "0.85rem" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.3rem" }}>Payments</h1>
        <button
          onClick={reconcile}
          disabled={reconciling}
          style={{ padding: "0.4rem 0.9rem", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}
        >
          {reconciling ? "Reconciling…" : "Reconcile Now"}
        </button>
      </div>

      {reconResult && (
        <p style={{ color: reconResult.reconciled > 0 ? "#0a7" : "#888", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          Reconciliation complete: recovered {reconResult.reconciled} of {reconResult.checked} pending payments.
        </p>
      )}

      {error && <p style={{ color: "red", marginBottom: "0.75rem" }}>{error}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Date", "Provider Order ID", "Payment ID", "Amount (₹)", "Status"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 && (
            <tr><td colSpan={5} style={{ ...td, color: "#888" }}>No payments yet.</td></tr>
          )}
          {payments.map((p) => (
            <tr key={p.id}>
              <td style={td}>{new Date(p.createdAt).toLocaleString()}</td>
              <td style={{ ...td, fontFamily: "monospace", fontSize: "0.75rem" }}>{p.providerOrderId.slice(0, 20)}…</td>
              <td style={{ ...td, fontFamily: "monospace", fontSize: "0.75rem" }}>{p.providerPaymentId ?? "—"}</td>
              <td style={td}>₹{p.amountRupees.toFixed(2)}</td>
              <td style={td}>
                <span style={{ color: STATUS_COLORS[p.status] ?? "#000", fontWeight: 600, fontSize: "0.8rem" }}>
                  {p.status.toUpperCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
