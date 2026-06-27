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

  return (
    <div>
      <h1>Units ({units.length})</h1>
      <p>
        <Link href="/import">↑ Import CSV</Link>
      </p>
      {units.length === 0 ? (
        <p>No units yet. <Link href="/import">Import a CSV file</Link> to get started.</p>
      ) : (
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
            {units.map((u) => (
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
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left" };
const td: React.CSSProperties = { padding: "0.5rem" };
