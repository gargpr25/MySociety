"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, getToken, type UnitDetail } from "../../lib/api";

export default function UnitDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (!id) return;
    api
      .getUnit(id)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return <p>Loading…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (!detail) return null;

  const { unit, unitResidents, residents, parkingSpots } = detail;
  const residentById = Object.fromEntries(residents.map((r) => [r.id, r]));

  return (
    <div>
      <p>
        <Link href="/units">← Back to units</Link>
      </p>
      <h1>Unit {unit.flatNo}</h1>
      <table style={{ marginBottom: "1rem" }}>
        <tbody>
          <tr>
            <th style={{ paddingRight: "1rem", textAlign: "left" }}>Type</th>
            <td>{unit.type}</td>
          </tr>
          <tr>
            <th style={{ paddingRight: "1rem", textAlign: "left" }}>Carpet Area</th>
            <td>{unit.carpetArea} sq ft</td>
          </tr>
        </tbody>
      </table>

      <h2>Residents</h2>
      {unitResidents.length === 0 ? (
        <p>No residents linked.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ccc" }}>
              <th style={th}>Name</th>
              <th style={th}>Mobile</th>
              <th style={th}>Relationship</th>
              <th style={th}>Primary</th>
              <th style={th}>Can Pay</th>
            </tr>
          </thead>
          <tbody>
            {unitResidents.map((ur) => {
              const r = residentById[ur.residentId];
              return (
                <tr key={ur.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}>{r?.name ?? "—"}</td>
                  <td style={td}>{r?.mobile ?? "—"}</td>
                  <td style={td}>{ur.relationship}</td>
                  <td style={td}>{ur.isPrimary ? "✓" : ""}</td>
                  <td style={td}>{ur.canPay ? "✓" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2>Parking Spots</h2>
      {parkingSpots.length === 0 ? (
        <p>No parking spots assigned.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ccc" }}>
              <th style={th}>Spot No</th>
              <th style={th}>Type</th>
              <th style={th}>Rentable</th>
            </tr>
          </thead>
          <tbody>
            {parkingSpots.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={td}>{s.spotNo}</td>
                <td style={td}>{s.type}</td>
                <td style={td}>{s.isRentable ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left" };
const td: React.CSSProperties = { padding: "0.5rem" };
