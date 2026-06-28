"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

const COMPLAINT_CATEGORIES = [
  { value: "electric", label: "Electrical issue" },
  { value: "plumbing", label: "Plumbing issue" },
  { value: "mason", label: "Civil / masonry work" },
  { value: "painting", label: "Painting work" },
  { value: "other", label: "Other complaint" },
];

const REQUEST_CATEGORIES = [
  { value: "ac_cleaning", label: "AC cleaning" },
  { value: "shifting", label: "Shifting assistance" },
  { value: "parking_alloc", label: "Parking allocation" },
  { value: "playground_alloc", label: "Playground / clubhouse allocation" },
  { value: "other", label: "Other request" },
];

export default function RaiseTicketPage() {
  const router = useRouter();
  const [type, setType] = useState<"complaint" | "request">("complaint");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const categories = type === "complaint" ? COMPLAINT_CATEGORIES : REQUEST_CATEGORIES;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || !description.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const ticket = await api.createTicket({ type, category, description: description.trim(), priority });
      router.push(`/tickets/${ticket.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to raise ticket");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <a href="/tickets" style={{ color: "#2563eb" }}>← My Tickets</a>
      <h1 style={{ marginTop: "1rem" }}>Raise a Ticket</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 480 }}>
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Type</label>
          <div style={{ display: "flex", gap: "1rem" }}>
            {(["complaint", "request"] as const).map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="radio" value={t} checked={type === t} onChange={() => { setType(t); setCategory(""); }} />
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} required style={{ width: "100%", padding: "0.4rem" }}>
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ padding: "0.4rem" }}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
            minLength={10}
            placeholder="Describe the issue in detail (at least 10 characters)"
            style={{ width: "100%", padding: "0.4rem", boxSizing: "border-box" }}
          />
        </div>

        {error && <p style={{ color: "#dc2626" }}>{error}</p>}

        <button type="submit" disabled={submitting} style={{ padding: "0.6rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
          {submitting ? "Raising ticket…" : "Raise Ticket"}
        </button>
      </form>
    </div>
  );
}
