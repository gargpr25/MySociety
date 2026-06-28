"use client";

import { useEffect, useState } from "react";
import { api, type Ticket } from "../lib/api";

const STATUS_COLORS: Record<string, string> = {
  open: "#2563eb",
  assigned: "#7c3aed",
  in_progress: "#d97706",
  resolved: "#16a34a",
  closed: "#6b7280",
  reopened: "#dc2626",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#6b7280",
  normal: "#2563eb",
  high: "#d97706",
  urgent: "#dc2626",
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [slaMsg, setSlaMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const data = await api.listTickets(params);
      setTickets(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, typeFilter]);

  async function handleCheckSla() {
    try {
      const result = await api.checkSla();
      setSlaMsg(`SLA check: ${result.checked} checked, ${result.breached} newly breached`);
    } catch (e: unknown) {
      setSlaMsg(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Tickets</h1>
        <button onClick={handleCheckSla} style={{ padding: "0.4rem 0.8rem" }}>Check SLA Breaches</button>
      </div>
      {slaMsg && <p style={{ color: "#7c3aed" }}>{slaMsg}</p>}

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {["open", "assigned", "in_progress", "resolved", "closed", "reopened"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="complaint">complaint</option>
          <option value="request">request</option>
        </select>
        <button onClick={load} disabled={loading}>Refresh</button>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : tickets.length === 0 ? (
        <p>No tickets.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Type</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Category</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Priority</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>SLA</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Description</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} style={{ borderTop: "1px solid #eee", background: t.slaBreached ? "#fff5f5" : undefined }}>
                <td style={{ padding: "0.5rem" }}>
                  <span style={{ background: STATUS_COLORS[t.status] ?? "#999", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 12 }}>
                    {t.status}
                  </span>
                </td>
                <td style={{ padding: "0.5rem" }}>{t.type}</td>
                <td style={{ padding: "0.5rem" }}>{t.category}</td>
                <td style={{ padding: "0.5rem" }}>
                  <span style={{ color: PRIORITY_COLORS[t.priority] ?? "#999", fontWeight: 600 }}>{t.priority}</span>
                </td>
                <td style={{ padding: "0.5rem", color: t.slaBreached ? "#dc2626" : undefined }}>
                  {t.slaBreached ? "⚠ BREACHED" : t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : "—"}
                </td>
                <td style={{ padding: "0.5rem", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.description}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <a href={`/tickets/${t.id}`} style={{ color: "#2563eb" }}>View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
