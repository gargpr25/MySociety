"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Bill } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  paid: "#0a7",
  partial: "#c80",
  overdue: "#c00",
  unpaid: "#555",
};

export default function BillsPage() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .listBills()
      .then(setBills)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p style={{ color: "#888", padding: "1rem 0" }}>Loading bills…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>My Bills</h1>
        <Link href="/notices" style={{ fontSize: "0.85rem", color: "#1a73e8" }}>Notices</Link>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {bills.length === 0 ? (
        <p style={{ color: "#888" }}>No bills yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {bills.map((b) => {
            const balance = b.totalDue - b.paidAmount;
            return (
              <Link
                key={b.id}
                href={`/bills/${b.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                    <span style={{ fontWeight: 600 }}>Due: {b.dueDate}</span>
                    <span style={{ color: STATUS_COLORS[b.status] ?? "#000", fontWeight: 600, fontSize: "0.85rem" }}>
                      {b.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#555", fontSize: "0.9rem" }}>Total Due</span>
                    <span style={{ fontWeight: 700 }}>₹{b.totalDue.toFixed(2)}</span>
                  </div>
                  {balance > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
                      <span style={{ color: "#c00", fontSize: "0.85rem" }}>Balance</span>
                      <span style={{ color: "#c00", fontWeight: 600 }}>₹{balance.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
