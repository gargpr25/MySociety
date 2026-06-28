"use client";

import { useEffect, useState } from "react";
import { api, type StaffMember, type Ticket, type TicketEvent } from "../lib/api";
import { Combobox, type ComboboxOption } from "../components/Combobox";

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

const NEXT_STATUSES: Record<string, string[]> = {
  open: ["in_progress", "resolved", "closed"],
  assigned: ["in_progress", "resolved", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["in_progress", "resolved", "closed"],
};

type ExpandedData = {
  events: TicketEvent[];
  assignTo: string;
  newStatus: string;
  comment: string;
  msg: string;
  saving: boolean;
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [slaMsg, setSlaMsg] = useState("");
  const [slaResult, setSlaResult] = useState<{ checked: number; breached: number; breachedTickets: Ticket[] } | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedData>>({});

  async function load() {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      const [data, staffList] = await Promise.all([api.listTickets(params), api.listStaff()]);
      setTickets(data);
      setStaff(staffList);
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
      setSlaResult(result);
    } catch (e: unknown) {
      setSlaMsg(e instanceof Error ? e.message : "Error");
    }
  }

  async function expandRow(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (expandedData[id]) return;
    try {
      const detail = await api.getTicket(id);
      setExpandedData((prev) => ({
        ...prev,
        [id]: { events: detail.events, assignTo: "", newStatus: "", comment: "", msg: "", saving: false },
      }));
    } catch (e) {
      console.error(e);
    }
  }

  function updateExpanded(id: string, patch: Partial<ExpandedData>) {
    setExpandedData((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }

  async function handleAssign(id: string) {
    const d = expandedData[id];
    if (!d || !d.assignTo) return;
    updateExpanded(id, { saving: true, msg: "" });
    try {
      await api.assignTicket(id, d.assignTo, d.comment || undefined);
      const detail = await api.getTicket(id);
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, assignedTo: detail.assignedTo, status: detail.status } : t)));
      updateExpanded(id, { events: detail.events, assignTo: "", comment: "", msg: "Assigned", saving: false });
    } catch (e: unknown) {
      updateExpanded(id, { msg: e instanceof Error ? e.message : "Error", saving: false });
    }
  }

  async function handleStatus(id: string) {
    const d = expandedData[id];
    if (!d || !d.newStatus) return;
    updateExpanded(id, { saving: true, msg: "" });
    try {
      await api.updateTicketStatus(id, d.newStatus, d.comment || undefined);
      const detail = await api.getTicket(id);
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: detail.status } : t)));
      updateExpanded(id, { events: detail.events, newStatus: "", comment: "", msg: `Status → ${detail.status}`, saving: false });
    } catch (e: unknown) {
      updateExpanded(id, { msg: e instanceof Error ? e.message : "Error", saving: false });
    }
  }

  async function handleComment(id: string) {
    const d = expandedData[id];
    if (!d || !d.comment.trim()) return;
    updateExpanded(id, { saving: true, msg: "" });
    try {
      await api.commentTicket(id, d.comment.trim());
      const detail = await api.getTicket(id);
      updateExpanded(id, { events: detail.events, comment: "", msg: "Comment added", saving: false });
    } catch (e: unknown) {
      updateExpanded(id, { msg: e instanceof Error ? e.message : "Error", saving: false });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Tickets</h1>
        <button onClick={handleCheckSla} style={{ padding: "0.4rem 0.8rem" }}>Check SLA Breaches</button>
      </div>
      {slaMsg && <p style={{ color: "#7c3aed" }}>{slaMsg}</p>}

      {slaResult && slaResult.breachedTickets.length > 0 && (
        <div style={{ background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#dc2626" }}>⚠ {slaResult.breached} newly breached ticket{slaResult.breached !== 1 ? "s" : ""}</span>
            <button onClick={() => setSlaResult(null)} style={{ fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer" }}>Dismiss</button>
          </div>
          {slaResult.breachedTickets.slice(0, 5).map((t) => (
            <div key={t.id} style={{ fontSize: 13, display: "flex", gap: "0.75rem", marginBottom: "0.25rem" }}>
              <span style={{ color: "#dc2626", fontWeight: 600 }}>{t.category}</span>
              <span style={{ color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</span>
              <a href={`/tickets/${t.id}`} style={{ color: "#2563eb", flexShrink: 0, fontSize: 12 }}>View</a>
            </div>
          ))}
          {slaResult.breachedTickets.length > 5 && (
            <p style={{ margin: "0.25rem 0 0", fontSize: 12, color: "#6b7280" }}>+{slaResult.breachedTickets.length - 5} more</p>
          )}
        </div>
      )}

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
              <th style={{ padding: "0.5rem", textAlign: "left", width: 20 }}></th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Category / Type</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Priority</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>SLA</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Assigned to</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const isExpanded = expandedId === t.id;
              const d = expandedData[t.id];
              const allowedStatuses = NEXT_STATUSES[t.status] ?? [];

              return (
                <>
                  <tr
                    key={t.id}
                    onClick={() => expandRow(t.id)}
                    style={{
                      borderTop: "1px solid #eee",
                      background: isExpanded ? "#f0f9ff" : t.slaBreached ? "#fff5f5" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "0.5rem", color: "#9ca3af", fontSize: 10 }}>{isExpanded ? "▾" : "▸"}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <span style={{ background: STATUS_COLORS[t.status] ?? "#999", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 12 }}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.5rem" }}>{t.category} / {t.type}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <span style={{ color: PRIORITY_COLORS[t.priority] ?? "#999", fontWeight: 600 }}>{t.priority}</span>
                    </td>
                    <td style={{ padding: "0.5rem", color: t.slaBreached ? "#dc2626" : undefined }}>
                      {t.slaBreached ? "⚠ BREACHED" : t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      {t.assignedTo ? (staff.find((s) => s.id === t.assignedTo)?.name ?? t.assignedTo.slice(0, 8) + "…") : "—"}
                    </td>
                    <td style={{ padding: "0.5rem", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.description}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr key={`${t.id}-expanded`} style={{ background: "#f8fbff" }}>
                      <td colSpan={7} style={{ padding: "1rem 1.5rem", borderTop: "1px solid #bfdbfe" }}>
                        {!d ? (
                          <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>Loading…</p>
                        ) : (
                          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                            {/* Actions panel */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 280 }}>
                              <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Assign to</label>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                  <Combobox
                                    options={staff.map((s): ComboboxOption => ({ id: s.id, label: s.name, sublabel: s.email }))}
                                    value={d.assignTo}
                                    onChange={(v) => updateExpanded(t.id, { assignTo: v })}
                                    placeholder="Search staff…"
                                  />
                                  <button onClick={() => handleAssign(t.id)} disabled={!d.assignTo || d.saving} style={{ fontSize: 12, padding: "2px 10px", whiteSpace: "nowrap" }}>
                                    Assign
                                  </button>
                                </div>
                              </div>

                              {allowedStatuses.length > 0 && (
                                <div>
                                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Update status</label>
                                  <div style={{ display: "flex", gap: "0.5rem" }}>
                                    <select value={d.newStatus} onChange={(e) => updateExpanded(t.id, { newStatus: e.target.value })} style={{ flex: 1, padding: "0.3rem", fontSize: 13 }}>
                                      <option value="">Select…</option>
                                      {allowedStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <button onClick={() => handleStatus(t.id)} disabled={!d.newStatus || d.saving} style={{ fontSize: 12, padding: "2px 10px" }}>
                                      Update
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Comment</label>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                  <textarea value={d.comment} onChange={(e) => updateExpanded(t.id, { comment: e.target.value })} rows={2} style={{ flex: 1, padding: "0.3rem", fontSize: 13, resize: "vertical" }} placeholder="Optional comment…" />
                                  <button onClick={() => handleComment(t.id)} disabled={!d.comment.trim() || d.saving} style={{ fontSize: 12, padding: "2px 10px", alignSelf: "flex-start" }}>
                                    Add
                                  </button>
                                </div>
                              </div>

                              {d.msg && <p style={{ margin: 0, color: "#7c3aed", fontSize: 13 }}>{d.msg}</p>}
                              <a href={`/tickets/${t.id}`} style={{ fontSize: 12, color: "#6b7280" }}>Open full detail →</a>
                            </div>

                            {/* Events timeline */}
                            <div style={{ flex: 1, minWidth: 240 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>Timeline</div>
                              {d.events.length === 0 ? (
                                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>No events</p>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: 200, overflowY: "auto" }}>
                                  {d.events.map((ev) => (
                                    <div key={ev.id} style={{ borderLeft: "2px solid #e5e7eb", paddingLeft: "0.5rem" }}>
                                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(ev.createdAt).toLocaleString()} · {ev.actorKind}</div>
                                      <div style={{ fontSize: 13 }}>
                                        {ev.eventType === "comment" && ev.body}
                                        {ev.eventType === "status_change" && `${ev.oldValue} → ${ev.newValue}`}
                                        {ev.eventType === "assigned" && `Assigned to ${ev.newValue ? (staff.find((s) => s.id === ev.newValue)?.name ?? ev.newValue.slice(0, 8) + "…") : "—"}`}
                                        {ev.eventType === "created" && "Ticket created"}
                                        {ev.body && ev.eventType !== "comment" && <span style={{ color: "#6b7280", marginLeft: 4 }}>"{ev.body}"</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
