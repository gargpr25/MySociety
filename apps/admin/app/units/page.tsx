"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Unit } from "../lib/api";

export default function UnitsPage() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .listUnits()
      .then(setUnits)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p>Loading units…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  const filtered = search.trim()
    ? units.filter(
        (u) =>
          u.flatNo.toLowerCase().includes(search.toLowerCase()) ||
          u.type.toLowerCase().includes(search.toLowerCase()),
      )
    : units;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Units ({units.length})</h1>
        <Link href="/import" style={{ fontSize: 13 }}>↑ Import CSV</Link>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search flat number or type…"
          style={{ marginLeft: "auto", padding: "0.3rem 0.6rem", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, width: 220 }}
        />
      </div>

      {units.length === 0 ? (
        <p>No units yet. <Link href="/import">Import a CSV file</Link> to get started.</p>
      ) : (
        <>
          {search && filtered.length === 0 && <p style={{ color: "#6b7280" }}>No units match "{search}".</p>}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #ccc" }}>
                <th style={th}>Flat No</th>
                <th style={th}>Type</th>
                <th style={th}>Carpet Area (sq ft)</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={td}>{u.flatNo}</td>
                  <td style={td}>{u.type}</td>
                  <td style={td}>{u.carpetArea}</td>
                  <td style={td}>
                    <Link href={`/units/${u.id}`}>View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {search && filtered.length > 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: "0.5rem" }}>Showing {filtered.length} of {units.length} units</p>
          )}
        </>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left" };
const td: React.CSSProperties = { padding: "0.5rem" };
