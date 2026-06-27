"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, getToken, type Notice } from "../../lib/api";

export default function NoticeDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (!id) return;
    api
      .getNotice(id)
      .then(setNotice)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) return <p style={{ color: "#888", padding: "1rem 0" }}>Loading…</p>;

  if (error) {
    return (
      <div>
        <p>
          <Link href="/notices" style={{ color: "#1a73e8" }}>← Notices</Link>
        </p>
        <p style={{ color: "red" }}>{error}</p>
      </div>
    );
  }

  if (!notice) return null;

  return (
    <div>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/notices" style={{ color: "#1a73e8", textDecoration: "none" }}>← Notices</Link>
      </p>

      {notice.pinned && (
        <span style={{ fontSize: "0.75rem", background: "#1a73e8", color: "#fff", borderRadius: 4, padding: "0.2rem 0.5rem", fontWeight: 600 }}>
          PINNED
        </span>
      )}

      <h1 style={{ fontSize: "1.25rem", marginTop: notice.pinned ? "0.75rem" : 0 }}>{notice.title}</h1>

      <p style={{ fontSize: "0.8rem", color: "#999", marginBottom: "1.25rem" }}>
        {new Date(notice.publishAt).toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        {notice.expiresAt && (
          <> · Expires {new Date(notice.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>
        )}
      </p>

      <div style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", fontSize: "0.95rem" }}>
        {notice.body}
      </div>
    </div>
  );
}
