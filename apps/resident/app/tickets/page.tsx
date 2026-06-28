"use client";

import { useEffect, useState } from "react";
import { api, type ResidentTicket } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  open: "#2563eb",
  assigned: "#7c3aed",
  in_progress: "#d97706",
  resolved: "#16a34a",
  closed: "#6b7280",
  reopened: "#dc2626",
};

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<ResidentTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTickets().then(setTickets).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>My Tickets</h1>
        <a href="/tickets/new" style={{ background: "#2563eb", color: "#fff", padding: "0.4rem 0.8rem", borderRadius: 6, textDecoration: "none" }}>
          + Raise Ticket
        </a>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : tickets.length === 0 ? (
        <p>No tickets raised yet. <a href="/tickets/new">Raise your first ticket.</a></p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {tickets.map((t) => (
            <a key={t.id} href={`/tickets/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.75rem 1rem", background: t.slaBreached ? "#fff5f5" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{t.category} · {t.type}</span>
                  <span style={{ background: STATUS_COLORS[t.status] ?? "#999", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 12 }}>
                    {t.status}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.description}
                </div>
                {t.slaBreached && (
                  <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>⚠ SLA overdue</div>
                )}
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                  {new Date(t.createdAt).toLocaleDateString()}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
