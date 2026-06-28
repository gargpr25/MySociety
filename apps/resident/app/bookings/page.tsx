"use client";

import { useEffect, useState } from "react";
import { api, type BookableResource, type ResidentBooking } from "../lib/api";

export default function BookingsPage() {
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [bookings, setBookings] = useState<ResidentBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedResource, setSelectedResource] = useState("");
  const [unitId, setUnitId] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [r, b] = await Promise.all([api.listResources(), api.listBookings()]);
      setResources(r);
      setBookings(b);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createBooking({
        resourceId: selectedResource,
        unitId: unitId.trim(),
        slotStart: new Date(slotStart).toISOString(),
        slotEnd: new Date(slotEnd).toISOString(),
      });
      setMsg("Booking confirmed!");
      setShowForm(false);
      setSelectedResource(""); setUnitId(""); setSlotStart(""); setSlotEnd("");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.cancelBooking(id);
      setMsg("Booking cancelled.");
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Amenity Bookings</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ background: "#2563eb", color: "#fff", padding: "0.4rem 0.8rem", borderRadius: 6, border: "none", cursor: "pointer" }}
        >
          + Book Slot
        </button>
      </div>

      {msg && <p style={{ color: "#7c3aed", marginBottom: "1rem" }}>{msg}</p>}

      {showForm && (
        <form onSubmit={handleBook} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontWeight: 600 }}>Amenity</label>
          <select value={selectedResource} onChange={(e) => setSelectedResource(e.target.value)} required style={{ padding: "0.4rem", borderRadius: 4, border: "1px solid #d1d5db" }}>
            <option value="">Select an amenity…</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name} (capacity: {r.capacity})</option>
            ))}
          </select>
          <label style={{ fontWeight: 600 }}>Unit ID (UUID)</label>
          <input value={unitId} onChange={(e) => setUnitId(e.target.value)} required placeholder="your unit UUID" style={{ padding: "0.4rem", fontFamily: "monospace", borderRadius: 4, border: "1px solid #d1d5db" }} />
          <label style={{ fontWeight: 600 }}>Slot Start</label>
          <input type="datetime-local" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} required style={{ padding: "0.4rem", borderRadius: 4, border: "1px solid #d1d5db" }} />
          <label style={{ fontWeight: 600 }}>Slot End</label>
          <input type="datetime-local" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} required style={{ padding: "0.4rem", borderRadius: 4, border: "1px solid #d1d5db" }} />
          <button type="submit" style={{ marginTop: "0.5rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "0.5rem", cursor: "pointer" }}>
            Confirm Booking
          </button>
        </form>
      )}

      {loading ? <p>Loading…</p> : bookings.length === 0 ? (
        <p>No bookings yet. <button onClick={() => setShowForm(true)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}>Book an amenity.</button></p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {bookings.map((b) => {
            const resource = resources.find((r) => r.id === b.resourceId);
            return (
              <div key={b.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.75rem 1rem", background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{resource?.name ?? "Amenity"}</span>
                  <span style={{ background: b.status === "confirmed" ? "#16a34a" : "#6b7280", color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 12 }}>
                    {b.status}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "#374151" }}>
                  {new Date(b.slotStart).toLocaleString()} – {new Date(b.slotEnd).toLocaleString()}
                </div>
                {b.status === "confirmed" && (
                  <button
                    onClick={() => handleCancel(b.id)}
                    style={{ marginTop: "0.5rem", background: "none", border: "1px solid #dc2626", color: "#dc2626", borderRadius: 4, padding: "2px 8px", fontSize: 12, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
