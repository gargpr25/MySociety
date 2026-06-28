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

type RecoveredPayment = { id: string; providerOrderId: string; providerPaymentId: string; amountRupees: number };

const POLL_INTERVAL_MS = 30_000;

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconResult, setReconResult] = useState<{ reconciled: number; checked: number; recoveredPayments: RecoveredPayment[] } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);

  async function loadPayments() {
    if (!getToken()) { router.replace("/login"); return; }
    try {
      const data = await api.listPayments();
      setPayments(data);
      setLastUpdated(new Date());
      setSecondsSince(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  useEffect(() => {
    loadPayments();
    const poll = setInterval(loadPayments, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const onFocus = () => loadPayments();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const ticker = setInterval(() => setSecondsSince((s) => s + 1), 1000);
    return () => clearInterval(ticker);
  }, []);

  async function reconcile() {
    setReconciling(true);
    setReconResult(null);
    try {
      const result = await api.reconcilePayments();
      setReconResult(result);
      await loadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReconciling(false);
    }
  }

  const filtered = searchQuery.trim()
    ? payments.filter(
        (p) =>
          p.providerOrderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.providerPaymentId ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.status.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : payments;

  const th: React.CSSProperties = { padding: "0.4rem 0.6rem", textAlign: "left", borderBottom: "1px solid #ddd", fontSize: "0.8rem", color: "#555" };
  const td: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid #eee", fontSize: "0.85rem" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.3rem", margin: 0 }}>Payments</h1>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              Updated {secondsSince < 5 ? "just now" : `${secondsSince}s ago`} · auto-refreshes every 30s
            </span>
          )}
        </div>
        <button
          onClick={reconcile}
          disabled={reconciling}
          style={{ padding: "0.4rem 0.9rem", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}
        >
          {reconciling ? "Reconciling…" : "Reconcile Now"}
        </button>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by order ID, payment ID, status…"
          style={{ marginLeft: "auto", padding: "0.3rem 0.6rem", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem", width: 260 }}
        />
      </div>

      {reconResult && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 600, color: reconResult.reconciled > 0 ? "#15803d" : "#6b7280", fontSize: "0.9rem" }}>
            Reconciliation complete — recovered {reconResult.reconciled} of {reconResult.checked} pending payments.
          </p>
          {reconResult.recoveredPayments.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  {["Payment ID", "Order ID", "Amount (₹)"].map((h) => (
                    <th key={h} style={{ ...th, fontSize: "0.75rem" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reconResult.recoveredPayments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "0.75rem" }}>{p.providerPaymentId.slice(0, 20)}…</td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: "0.75rem" }}>{p.providerOrderId.slice(0, 20)}…</td>
                    <td style={td}>₹{p.amountRupees.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ ...td, color: "#888" }}>{searchQuery ? "No matches." : "No payments yet."}</td></tr>
          )}
          {filtered.map((p) => (
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
