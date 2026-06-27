"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "../lib/api";

type Notice = {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
};

type NoticeInput = {
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  publishAt: string;
  expiresAt: string;
};

const EMPTY: NoticeInput = {
  title: "",
  body: "",
  audience: "all",
  pinned: false,
  publishAt: "",
  expiresAt: "",
};

const th: React.CSSProperties = { padding: "0.5rem", textAlign: "left" };
const td: React.CSSProperties = { padding: "0.5rem" };

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export default function NoticesPage() {
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<NoticeInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  function requireAuth() {
    if (!getToken()) { router.replace("/login"); return false; }
    return true;
  }

  async function load() {
    setLoading(true);
    try {
      const rows = await adminFetch<Notice[]>("/admin/notices");
      setNotices(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!requireAuth()) return;
    load();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireAuth()) return;
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title,
        body: form.body,
        audience: form.audience,
        pinned: form.pinned,
      };
      if (form.publishAt) body.publishAt = new Date(form.publishAt).toISOString();
      if (form.expiresAt) body.expiresAt = new Date(form.expiresAt).toISOString();

      if (editId) {
        await adminFetch<Notice>(`/admin/notices/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await adminFetch<Notice>("/admin/notices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setForm(EMPTY);
      setEditId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(n: Notice) {
    setEditId(n.id);
    setForm({
      title: n.title,
      body: n.body,
      audience: n.audience,
      pinned: n.pinned,
      publishAt: n.publishAt ? new Date(n.publishAt).toISOString().slice(0, 16) : "",
      expiresAt: n.expiresAt ? new Date(n.expiresAt).toISOString().slice(0, 16) : "",
    });
  }

  async function handleDelete(id: string) {
    if (!requireAuth()) return;
    if (!confirm("Delete this notice?")) return;
    try {
      await adminFetch<undefined>(`/admin/notices/${id}`, { method: "DELETE" });
      setNotices((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1>Notices</h1>

      <h2>{editId ? "Edit notice" : "Create notice"}</h2>
      <form onSubmit={handleSubmit} style={{ marginBottom: "2rem" }}>
        <p>
          <label>Title<br />
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              style={{ width: "100%", padding: "0.4rem" }}
            />
          </label>
        </p>
        <p>
          <label>Body<br />
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              required
              rows={4}
              style={{ width: "100%", padding: "0.4rem" }}
            />
          </label>
        </p>
        <p>
          <label>Audience{" "}
            <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
              <option value="all">All residents</option>
              <option value="owners">Owners only</option>
              <option value="tenants">Tenants only</option>
            </select>
          </label>
          {"  "}
          <label>
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
            />{" "}
            Pinned
          </label>
        </p>
        <p>
          <label>Publish at (optional)<br />
            <input
              type="datetime-local"
              value={form.publishAt}
              onChange={(e) => setForm((f) => ({ ...f, publishAt: e.target.value }))}
              style={{ padding: "0.4rem" }}
            />
          </label>
          {"  "}
          <label>Expires at (optional)<br />
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              style={{ padding: "0.4rem" }}
            />
          </label>
        </p>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={saving} style={{ marginRight: "0.5rem" }}>
          {saving ? "Saving…" : editId ? "Update" : "Publish"}
        </button>
        {editId && (
          <button type="button" onClick={() => { setEditId(null); setForm(EMPTY); }}>
            Cancel
          </button>
        )}
      </form>

      <h2>All notices</h2>
      {loading ? (
        <p>Loading…</p>
      ) : notices.length === 0 ? (
        <p>No notices yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ccc" }}>
              <th style={th}>Title</th>
              <th style={th}>Audience</th>
              <th style={th}>Pinned</th>
              <th style={th}>Publish at</th>
              <th style={th}>Expires at</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {notices.map((n) => (
              <tr key={n.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={td}>{n.title}</td>
                <td style={td}>{n.audience}</td>
                <td style={td}>{n.pinned ? "✓" : ""}</td>
                <td style={td}>{new Date(n.publishAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                <td style={td}>{n.expiresAt ? new Date(n.expiresAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                <td style={td}>
                  <button onClick={() => handleEdit(n)} style={{ marginRight: "0.5rem" }}>Edit</button>
                  <button onClick={() => handleDelete(n.id)} style={{ color: "#c00" }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
