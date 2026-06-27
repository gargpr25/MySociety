"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Notice } from "../lib/api";

export default function NoticesPage() {
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api
      .listNotices()
      .then(setNotices)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p style={{ color: "#888", padding: "1rem 0" }}>Loading notices…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Notices</h1>
        <button
          onClick={() => {
            if (typeof window !== "undefined") sessionStorage.removeItem("resident_token");
            router.push("/login");
          }}
          style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "0.85rem" }}
        >
          Logout
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {notices.length === 0 && !error && (
        <p style={{ color: "#888", textAlign: "center", marginTop: "2rem" }}>No notices yet.</p>
      )}

      <div>
        {notices.map((n) => (
          <Link key={n.id} href={`/notices/${n.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                padding: "0.875rem 1rem",
                marginBottom: "0.75rem",
                background: n.pinned ? "#f0f7ff" : "#fff",
                borderLeft: n.pinned ? "4px solid #1a73e8" : "1px solid #e0e0e0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <strong style={{ fontSize: "0.95rem" }}>{n.title}</strong>
                {n.pinned && (
                  <span style={{ fontSize: "0.7rem", color: "#1a73e8", fontWeight: 600, marginLeft: "0.5rem", whiteSpace: "nowrap" }}>
                    PINNED
                  </span>
                )}
              </div>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#555", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {n.body}
              </p>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "#999" }}>
                {new Date(n.publishAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
