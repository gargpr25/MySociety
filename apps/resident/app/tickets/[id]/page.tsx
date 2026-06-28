"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type ResidentTicket, type TicketEvent } from "../../lib/api";

const STATUS_COLORS: Record<string, string> = {
  open: "#2563eb",
  assigned: "#7c3aed",
  in_progress: "#d97706",
  resolved: "#16a34a",
  closed: "#6b7280",
  reopened: "#dc2626",
};

export default function TicketStatusPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<(ResidentTicket & { events: TicketEvent[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.getTicket(id);
      setTicket(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      await api.addTicketComment(id, comment.trim());
      setComment("");
      setMsg("Comment added");
      await load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleReopen() {
    try {
      await api.reopenTicket(id);
      setMsg("Ticket reopened");
      await load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>;
  if (!ticket) return <p>Not found</p>;

  return (
    <div>
      <a href="/tickets" style={{ color: "#2563eb" }}>← My Tickets</a>

      <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>{ticket.category} — {ticket.type}</h1>
          <span style={{ background: STATUS_COLORS[ticket.status] ?? "#999", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 13 }}>
            {ticket.status}
          </span>
        </div>
        {ticket.slaBreached && (
          <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>⚠ Response time exceeded</div>
        )}
        <p style={{ color: "#374151", marginTop: 0 }}>{ticket.description}</p>

        <dl style={{ display: "grid", gridTemplateColumns: "130px 1fr", rowGap: "0.3rem", fontSize: 14, color: "#6b7280" }}>
          <dt>Priority</dt><dd>{ticket.priority}</dd>
          <dt>Raised on</dt><dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
          {ticket.slaDueAt && <><dt>Expected by</dt><dd>{new Date(ticket.slaDueAt).toLocaleString()}</dd></>}
          {ticket.assignedTo && <><dt>Assigned to</dt><dd>Society staff</dd></>}
        </dl>
      </div>

      {msg && <p style={{ color: "#7c3aed" }}>{msg}</p>}

      {ticket.status === "resolved" && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ color: "#16a34a", fontWeight: 600 }}>Your issue has been resolved. Was the resolution satisfactory?</p>
          <button onClick={handleReopen} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "0.4rem 0.8rem", cursor: "pointer" }}>
            No — Reopen Ticket
          </button>
        </div>
      )}

      <h2 style={{ fontSize: 16 }}>Updates</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
        {ticket.events.map((ev) => (
          <div key={ev.id} style={{ borderLeft: `3px solid ${ev.actorKind === "resident" ? "#2563eb" : "#7c3aed"}`, paddingLeft: "0.75rem" }}>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {new Date(ev.createdAt).toLocaleString()} · {ev.actorKind === "resident" ? "You" : "Society"}
            </div>
            <div style={{ fontSize: 14 }}>
              {ev.eventType === "comment" && ev.body}
              {ev.eventType === "status_change" && `Status changed to "${ev.newValue}"`}
              {ev.eventType === "assigned" && "Ticket assigned to a staff member"}
              {ev.eventType === "created" && "Ticket raised"}
              {ev.body && ev.eventType !== "comment" && (
                <span style={{ color: "#6b7280", marginLeft: 6 }}>— {ev.body}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {!["closed"].includes(ticket.status) && (
        <form onSubmit={handleComment} style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment…"
            style={{ flex: 1, padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: 6 }}
          />
          <button type="submit" style={{ padding: "0.4rem 0.8rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
