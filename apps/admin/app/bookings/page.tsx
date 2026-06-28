"use client";

import { useEffect, useState } from "react";
import { api, type Booking, type BookableResource } from "../lib/api";

export default function BookingsPage() {
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedResource, setSelectedResource] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("1");
  const [newDesc, setNewDesc] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [r, b] = await Promise.all([api.listResources(), api.listBookings({})]);
      setResources(r);
      setBookings(b);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreateResource(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createResource({ name: newName, description: newDesc, capacity: parseInt(newCapacity) });
      setShowCreate(false);
      setNewName(""); setNewCapacity("1"); setNewDesc("");
      setMsg("Resource created");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await api.updateResource(id, { isActive: false });
      setMsg("Resource deactivated");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleCancelBooking(id: string) {
    try {
      await api.cancelBooking(id);
      setMsg("Booking cancelled");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  const filteredBookings = selectedResource
    ? bookings.filter((b) => b.resourceId === selectedResource)
    : bookings;

  return (
    <div>
      <h1>Amenity Bookings</h1>
      {msg && <p style={{ color: "#7c3aed" }}>{msg}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Bookable Resources</h2>
        <button onClick={() => setShowCreate(!showCreate)}>+ Add Resource</button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreateResource} style={{ background: "#f9f9f9", padding: "1rem", borderRadius: 8, marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: 400 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Resource name (e.g. Playground)" required style={{ padding: "0.4rem" }} />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" style={{ padding: "0.4rem" }} />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <label>Capacity:</label>
            <input type="number" min="1" max="100" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} style={{ width: 60, padding: "0.4rem" }} />
          </div>
          <button type="submit">Create</button>
        </form>
      )}

      {loading ? <p>Loading…</p> : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem", fontSize: 14 }}>
            <thead><tr style={{ background: "#f5f5f5" }}>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Name</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Capacity</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
              <th style={{ padding: "0.5rem", textAlign: "left" }}>Actions</th>
            </tr></thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem" }}>{r.name} {r.description && <span style={{ color: "#6b7280", fontSize: 12 }}>— {r.description}</span>}</td>
                  <td style={{ padding: "0.5rem" }}>{r.capacity}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <span style={{ color: r.isActive ? "#16a34a" : "#6b7280" }}>{r.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => setSelectedResource(selectedResource === r.id ? "" : r.id)} style={{ fontSize: 12, padding: "2px 8px" }}>
                      {selectedResource === r.id ? "Clear filter" : "Filter bookings"}
                    </button>
                    {r.isActive && (
                      <button onClick={() => handleDeactivate(r.id)} style={{ fontSize: 12, padding: "2px 8px", color: "#dc2626" }}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Bookings {selectedResource && `(filtered)`}</h2>
          {filteredBookings.length === 0 ? <p>No bookings.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ background: "#f5f5f5" }}>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Resource</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Unit</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Slot Start</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Slot End</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
                <th style={{ padding: "0.5rem", textAlign: "left" }}>Actions</th>
              </tr></thead>
              <tbody>
                {filteredBookings.map((b) => {
                  const resource = resources.find((r) => r.id === b.resourceId);
                  return (
                    <tr key={b.id} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: "0.5rem" }}>{resource?.name ?? b.resourceId.slice(0, 8)}</td>
                      <td style={{ padding: "0.5rem" }}>{b.unitId.slice(0, 8)}…</td>
                      <td style={{ padding: "0.5rem" }}>{new Date(b.slotStart).toLocaleString()}</td>
                      <td style={{ padding: "0.5rem" }}>{new Date(b.slotEnd).toLocaleString()}</td>
                      <td style={{ padding: "0.5rem" }}>
                        <span style={{ color: b.status === "confirmed" ? "#16a34a" : "#6b7280" }}>{b.status}</span>
                      </td>
                      <td style={{ padding: "0.5rem" }}>
                        {b.status === "confirmed" && (
                          <button onClick={() => handleCancelBooking(b.id)} style={{ fontSize: 12, padding: "2px 8px", color: "#dc2626" }}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
