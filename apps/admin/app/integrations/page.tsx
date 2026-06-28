"use client";

import { useEffect, useState } from "react";
import { api, type IntegrationConfig } from "../lib/api";

const EVENT_OPTIONS = [
  { value: "bill.generated", label: "Bill Generated" },
  { value: "payment.captured", label: "Payment Captured" },
  { value: "ticket.created", label: "Ticket Created" },
  { value: "ticket.resolved", label: "Ticket Resolved" },
];

export default function IntegrationsPage() {
  const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");

  // Form state
  const [connectorType, setConnectorType] = useState<"generic_webhook" | "csv_export">("generic_webhook");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [csvPath, setCsvPath] = useState("");
  const [enabledEvents, setEnabledEvents] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.listIntegrations();
      setConfigs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggleEvent(evt: string) {
    setEnabledEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt],
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (enabledEvents.length === 0) {
      setMsg("Select at least one event to enable.");
      return;
    }

    let credentials: Record<string, string> = {};
    if (connectorType === "generic_webhook") {
      if (!webhookUrl) { setMsg("Webhook URL is required."); return; }
      credentials = { url: webhookUrl };
      if (webhookSecret) credentials["secret"] = webhookSecret;
    } else {
      if (!csvPath) { setMsg("CSV file path is required."); return; }
      credentials = { path: csvPath };
    }

    let parsedMappings: Record<string, string> = {};
    if (fieldMappings.trim()) {
      try {
        parsedMappings = JSON.parse(fieldMappings) as Record<string, string>;
      } catch {
        setMsg("Field mappings must be valid JSON (e.g. {\"billId\": \"InvoiceNo\"})");
        return;
      }
    }

    try {
      await api.createIntegration({
        connectorType,
        credentials,
        fieldMappings: parsedMappings,
        enabledEvents,
      });
      setMsg("Connector created.");
      setShowForm(false);
      setWebhookUrl(""); setWebhookSecret(""); setCsvPath(""); setEnabledEvents([]); setFieldMappings("");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleToggleActive(config: IntegrationConfig) {
    try {
      await api.updateIntegration(config.id, { isActive: !config.isActive });
      setMsg(config.isActive ? "Connector disabled." : "Connector enabled.");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Integration Connectors</h1>
        <button onClick={() => setShowForm(!showForm)}>+ Add Connector</button>
      </div>
      {msg && <p style={{ color: "#7c3aed" }}>{msg}</p>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: "#f9f9f9", padding: "1rem", borderRadius: 8, marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 500 }}>
          <label style={{ fontWeight: 600 }}>Connector Type</label>
          <select value={connectorType} onChange={(e) => setConnectorType(e.target.value as "generic_webhook" | "csv_export")} style={{ padding: "0.4rem" }}>
            <option value="generic_webhook">Generic Webhook (HTTP POST + HMAC)</option>
            <option value="csv_export">CSV Export (Tally-style)</option>
          </select>

          {connectorType === "generic_webhook" ? (
            <>
              <label style={{ fontWeight: 600 }}>Webhook URL</label>
              <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} required placeholder="https://your-system.example.com/hook" style={{ padding: "0.4rem" }} />
              <label style={{ fontWeight: 600 }}>HMAC Secret (optional)</label>
              <input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="signing secret" style={{ padding: "0.4rem" }} />
            </>
          ) : (
            <>
              <label style={{ fontWeight: 600 }}>CSV Output Path</label>
              <input value={csvPath} onChange={(e) => setCsvPath(e.target.value)} required placeholder="/var/exports/mysociety.csv" style={{ padding: "0.4rem", fontFamily: "monospace" }} />
            </>
          )}

          <label style={{ fontWeight: 600, marginTop: "0.5rem" }}>Enabled Events</label>
          {EVENT_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontWeight: "normal" }}>
              <input type="checkbox" checked={enabledEvents.includes(opt.value)} onChange={() => toggleEvent(opt.value)} />
              {opt.label}
            </label>
          ))}

          <label style={{ fontWeight: 600, marginTop: "0.5rem" }}>Field Mappings (JSON, optional)</label>
          <textarea
            value={fieldMappings}
            onChange={(e) => setFieldMappings(e.target.value)}
            placeholder='{"billId": "InvoiceNo", "totalDue": "Amount"}'
            rows={3}
            style={{ padding: "0.4rem", fontFamily: "monospace", fontSize: 12 }}
          />

          <button type="submit" style={{ marginTop: "0.5rem" }}>Create Connector</button>
        </form>
      )}

      {loading ? <p>Loading…</p> : configs.length === 0 ? (
        <p>No connectors configured. <button onClick={() => setShowForm(true)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}>Add one.</button></p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ background: "#f5f5f5" }}>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Type</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Events</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Credentials</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Actions</th>
          </tr></thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: 12 }}>{c.connectorType}</td>
                <td style={{ padding: "0.5rem", fontSize: 12 }}>
                  {(c.enabledEvents as string[]).join(", ")}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {c.hasCredentials ? <span style={{ color: "#16a34a" }}>Stored (encrypted)</span> : <span style={{ color: "#6b7280" }}>None</span>}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <span style={{ color: c.isActive ? "#16a34a" : "#6b7280" }}>{c.isActive ? "Active" : "Inactive"}</span>
                </td>
                <td style={{ padding: "0.5rem" }}>
                  <button
                    onClick={() => handleToggleActive(c)}
                    style={{ fontSize: 12, padding: "2px 8px", color: c.isActive ? "#dc2626" : "#16a34a" }}
                  >
                    {c.isActive ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
