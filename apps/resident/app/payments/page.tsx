"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Payment } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  captured: "#0a7",
  pending: "#c80",
  failed: "#c00",
  refunded: "#888",
};

export default function ResidentPaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api.listPayments().then(setPayments).catch((e: Error) => setError(e.message));
  }, [router]);

  if (error) return <p style={{ padding: "1rem", color: "red" }}>{error}</p>;

  return (
    <div>
      <Link href="/" style={{ fontSize: "0.9rem", color: "#555" }}>← Home</Link>
      <h1 style={{ fontSize: "1.2rem", marginTop: "0.5rem", marginBottom: "1rem" }}>My Payments</h1>

      {payments.length === 0 && <p style={{ color: "#888" }}>No payments yet.</p>}

      {payments.map((p) => (
        <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>₹{p.amountRupees.toFixed(2)}</span>
            <span style={{ color: STATUS_COLORS[p.status] ?? "#000", fontSize: "0.8rem", fontWeight: 600 }}>
              {p.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.25rem" }}>
            {new Date(p.createdAt).toLocaleString()}
          </div>
          {p.providerPaymentId && (
            <div style={{ fontSize: "0.75rem", color: "#aaa", marginTop: "0.15rem", fontFamily: "monospace" }}>
              Txn: {p.providerPaymentId}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
