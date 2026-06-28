"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type StaffMember, type Ticket, type TicketEvent } from "../../lib/api";
import { Combobox, type ComboboxOption } from "../../components/Combobox";

const STATUS_COLORS: Record<string, string> = {
  open: "#2563eb",
  assigned: "#7c3aed",
  in_progress: "#d97706",
  resolved: "#16a34a",
  closed: "#6b7280",
  reopened: "#dc2626",
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<(Ticket & { events: TicketEvent[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignTo, setAssignTo] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [data, staffList] = await Promise.all([api.getTicket(id), api.listStaff()]);
      setTicket(data);
      setStaff(staffList);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error loading ticket");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleAssign() {
    if (!assignTo.trim()) return;
    try {
      await api.assignTicket(id, assignTo.trim(), comment || undefined);
      setMsg("Assigned");
      setAssignTo("");
      setComment("");
      await load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleStatus() {
    if (!newStatus) return;
    try {
      await api.updateTicketStatus(id, newStatus, comment || undefined);
      setMsg(`Status updated to ${newStatus}`);
      setNewStatus("");
      setComment("");
      await load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleComment() {
    if (!comment.trim()) return;
    try {
      await api.commentTicket(id, comment.trim());
      setMsg("Comment added");
      setComment("");
      await load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error");
    }
  }

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;
  if (!ticket) return <p>Not found</p>;

  const NEXT_STATUSES: Record<string, string[]> = {
    open: ["in_progress", "resolved", "closed"],
    assigned: ["in_progress", "resolved", "closed"],
    in_progress: ["resolved", "closed"],
    resolved: ["closed", "reopened"],
    closed: ["reopened"],
    reopened: ["in_progress", "resolved", "closed"],
  };
  const allowedStatuses = NEXT_STATUSES[ticket.status] ?? [];

  return (
    <div>
      <a href="/tickets" style={{ color: "#2563eb" }}>← Back to Tickets</a>
      <h1 style={{ marginTop: "1rem" }}>
        Ticket{" "}
        <span style={{ background: STATUS_COLORS[ticket.status] ?? "#999", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 16 }}>
          {ticket.status}
        </span>
        {ticket.slaBreached && <span style={{ color: "#dc2626", marginLeft: 8 }}>⚠ SLA BREACHED</span>}
      </h1>

      <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: "0.5rem", marginBottom: "1.5rem" }}>
        <dt>Type</dt><dd>{ticket.type}</dd>
        <dt>Category</dt><dd>{ticket.category}</dd>
        <dt>Priority</dt><dd>{ticket.priority}</dd>
        <dt>Raised by</dt><dd>{ticket.raisedBy}</dd>
        <dt>Assigned to</dt><dd>{ticket.assignedTo ? (staff.find((s) => s.id === ticket.assignedTo)?.name ?? ticket.assignedTo.slice(0, 8) + "…") : "—"}</dd>
        <dt>SLA due</dt><dd>{ticket.slaDueAt ? new Date(ticket.slaDueAt).toLocaleString() : "—"}</dd>
        <dt>Created</dt><dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
        <dt>Description</dt><dd>{ticket.description}</dd>
      </dl>

      {msg && <p style={{ color: "#7c3aed", marginBottom: "1rem" }}>{msg}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2rem", maxWidth: 480 }}>
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Assign to</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Combobox
              options={staff.map((s): ComboboxOption => ({ id: s.id, label: s.name, sublabel: s.email }))}
              value={assignTo}
              onChange={setAssignTo}
              placeholder="Search staff…"
            />
            <button onClick={handleAssign} disabled={!assignTo}>Assign</button>
          </div>
        </div>

        {allowedStatuses.length > 0 && (
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Update status</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={{ flex: 1, padding: "0.3rem" }}>
                <option value="">Select…</option>
                {allowedStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={handleStatus} disabled={!newStatus}>Update</button>
            </div>
          </div>
        )}

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Comment</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} style={{ flex: 1, padding: "0.3rem" }} placeholder="Optional note with assign/status, or standalone comment" />
            <button onClick={handleComment}>Add Comment</button>
          </div>
        </div>
      </div>

      <h2>Event History</h2>
      {ticket.events.length === 0 ? (
        <p>No events.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {ticket.events.map((ev) => (
            <div key={ev.id} style={{ borderLeft: "3px solid #e5e7eb", paddingLeft: "0.75rem" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {new Date(ev.createdAt).toLocaleString()} · {ev.actorKind}
                {ev.actorId && ` (${ev.actorId.slice(0, 8)}…)`}
              </div>
              <div>
                {ev.eventType === "comment" && ev.body}
                {ev.eventType === "status_change" && `Status: ${ev.oldValue} → ${ev.newValue}`}
                {ev.eventType === "assigned" && `Assigned to ${ev.newValue}`}
                {ev.eventType === "created" && "Ticket created"}
                {ev.body && ev.eventType !== "comment" && <span style={{ color: "#6b7280", marginLeft: 8 }}>"{ev.body}"</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
