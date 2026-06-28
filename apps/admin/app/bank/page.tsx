"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, type BankAccount } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  pending_verification: "#888",
  pending_approval: "#c80",
  approved: "#0a7",
  rejected: "#c00",
};

export default function BankAccountPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ accountName: "", accountNumber: "", ifsc: "", bankName: "" });

  const load = () =>
    api
      .listBankAccounts()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    load();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.submitBankAccount(form);
      setForm({ accountName: "", accountNumber: "", ifsc: "", bankName: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const inp: React.CSSProperties = {
    border: "1px solid #ccc", borderRadius: 4, padding: "0.4rem 0.6rem", fontSize: "0.9rem", width: "100%",
  };
  const th: React.CSSProperties = { padding: "0.4rem 0.6rem", textAlign: "left", borderBottom: "1px solid #ddd", fontSize: "0.8rem", color: "#555" };
  const td: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid #eee", fontSize: "0.9rem" };

  return (
    <div>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>Bank Account Onboarding</h1>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      <section style={{ marginBottom: "2rem", background: "#f9f9f9", padding: "1rem", borderRadius: 8, maxWidth: 480 }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Submit New Bank Account</h2>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <input style={inp} placeholder="Account holder name" value={form.accountName}
            onChange={(e) => setForm({ ...form, accountName: e.target.value })} required />
          <input style={inp} placeholder="Account number" value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required />
          <input style={inp} placeholder="IFSC code (e.g. HDFC0001234)" value={form.ifsc}
            onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} required />
          <input style={inp} placeholder="Bank name" value={form.bankName}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })} required />
          <button type="submit" disabled={submitting}
            style={{ padding: "0.5rem 1rem", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
            {submitting ? "Submitting…" : "Submit for Verification"}
          </button>
        </form>
        <p style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.5rem" }}>
          Submitted accounts require platform approval before funds settle to this account.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Bank Account History</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Account Name", "Last 4", "IFSC", "Bank", "Status", "Submitted"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, color: "#888" }}>No bank accounts submitted yet.</td></tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td style={td}>{a.accountName}</td>
                <td style={td}>****{a.accountNumberLast4}</td>
                <td style={td}>{a.ifsc}</td>
                <td style={td}>{a.bankName}</td>
                <td style={td}>
                  <span style={{ color: STATUS_COLORS[a.status] ?? "#000", fontWeight: 600, fontSize: "0.8rem" }}>
                    {a.status.replace(/_/g, " ").toUpperCase()}
                  </span>
                  {a.rejectionReason && (
                    <span style={{ display: "block", fontSize: "0.75rem", color: "#c00" }}>{a.rejectionReason}</span>
                  )}
                </td>
                <td style={td}>{new Date(a.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
