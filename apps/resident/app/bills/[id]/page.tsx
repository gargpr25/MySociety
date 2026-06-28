"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Bill, type BillLineItem, type PaymentOrder } from "../../lib/api";

const STATUS_COLORS: Record<string, string> = {
  paid: "#0a7",
  partial: "#c80",
  overdue: "#c00",
  unpaid: "#555",
};

type BillDetail = Bill & { lineItems: BillLineItem[] };

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<PaymentOrder | null>(null);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    if (!id) return;
    api.getBill(id).then(setBill).catch((e: Error) => setError(e.message));
  }, [id, router]);

  async function handlePay() {
    if (!bill) return;
    setPaying(true);
    setError(null);
    try {
      const order = await api.createPaymentOrder(bill.id);
      setPayResult(order);
      // In production, open Razorpay Checkout here using order.providerOrderId.
      // For the fake provider, we show the order details so the developer can
      // simulate the webhook manually or via a test harness.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  }

  if (!bill) {
    return <p style={{ padding: "1rem", color: "#888" }}>{error ?? "Loading…"}</p>;
  }

  const balance = bill.totalDue - bill.paidAmount;

  return (
    <div>
      <Link href="/bills" style={{ fontSize: "0.9rem", color: "#555" }}>← My Bills</Link>
      <h1 style={{ fontSize: "1.2rem", marginTop: "0.5rem", marginBottom: "1rem" }}>
        Bill — {bill.dueDate}
        <span style={{ marginLeft: "0.75rem", fontSize: "0.8em", color: STATUS_COLORS[bill.status] ?? "#000" }}>
          {bill.status.toUpperCase()}
        </span>
      </h1>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem" }}>Line Items</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "0.4rem 0", textAlign: "left", borderBottom: "1px solid #ddd", fontSize: "0.85rem" }}>Description</th>
              <th style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #ddd", fontSize: "0.85rem" }}>Qty</th>
              <th style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #ddd", fontSize: "0.85rem" }}>Rate</th>
              <th style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #ddd", fontSize: "0.85rem" }}>Amount</th>
              <th style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #ddd", fontSize: "0.85rem" }}>Tax</th>
            </tr>
          </thead>
          <tbody>
            {bill.lineItems.map((li) => (
              <tr key={li.id}>
                <td style={{ padding: "0.4rem 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>{li.description}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>{li.qty}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>₹{li.rate.toFixed(2)}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>₹{li.amount.toFixed(2)}</td>
                <td style={{ padding: "0.4rem 0", textAlign: "right", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>₹{li.taxAmount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ borderTop: "2px solid #ddd", paddingTop: "0.75rem" }}>
        {[
          { label: "Subtotal", value: bill.subtotal },
          { label: "Tax", value: bill.taxTotal },
          ...(bill.arrearsCarryForward > 0 ? [{ label: "Arrears", value: bill.arrearsCarryForward }] : []),
        ].map(({ label, value }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", fontSize: "0.9rem" }}>
            <span style={{ color: "#555" }}>{label}</span>
            <span>₹{value.toFixed(2)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", fontWeight: 700, borderTop: "1px solid #ddd", marginTop: "0.25rem" }}>
          <span>Total Due</span>
          <span>₹{bill.totalDue.toFixed(2)}</span>
        </div>
        {bill.paidAmount > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.2rem 0", fontSize: "0.9rem", color: "#0a7" }}>
              <span>Paid</span>
              <span>₹{bill.paidAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", fontWeight: 700, color: balance > 0 ? "#c00" : "#0a7" }}>
              <span>Balance</span>
              <span>₹{balance.toFixed(2)}</span>
            </div>
          </>
        )}
      </section>

      <section style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a
          href={api.invoicePdfUrl(bill.id)}
          download
          style={{
            display: "inline-block",
            padding: "0.6rem 1.2rem",
            background: "#555",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          Download Invoice PDF
        </a>

        {bill.status !== "paid" && balance > 0 && (
          <button
            onClick={handlePay}
            disabled={paying}
            style={{
              padding: "0.6rem 1.2rem",
              background: "#0a7",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "0.9rem",
            }}
          >
            {paying ? "Creating order…" : `Pay ₹${balance.toFixed(2)}`}
          </button>
        )}
      </section>

      {payResult && (
        <section style={{ marginTop: "1rem", background: "#f0fff4", border: "1px solid #0a7", borderRadius: 6, padding: "0.75rem 1rem" }}>
          <p style={{ fontSize: "0.85rem", color: "#0a7", margin: 0 }}>
            Payment order created (ID: <code>{payResult.providerOrderId}</code>). Amount: ₹{(payResult.amountPaise / 100).toFixed(2)}.
            The Razorpay checkout would open here in production.
          </p>
        </section>
      )}
    </div>
  );
}
