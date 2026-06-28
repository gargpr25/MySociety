"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage } from "../lib/api";

type PendingClassification = {
  intent: string;
  category: string;
  type: string;
  originalText: string;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<PendingClassification | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadMessages() {
    setLoading(true);
    try {
      const data = await api.listChatMessages();
      setMessages(data);
      // Restore pending state from last bot message if needed
      const lastBot = [...data].reverse().find((m) => m.role === "bot");
      const meta = lastBot?.metadata as Record<string, unknown> | undefined;
      const pc = meta?.pendingClassification as PendingClassification | undefined;
      setPending(pc ?? null);
    } catch {
      // ignore on first load
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMessages(); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text || sending) return;
    setSending(true);
    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: "",
      role: "user",
      body: text,
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    try {
      const resp = await api.sendChatMessage(text);
      const botMsg: ChatMessage = {
        id: resp.messageId,
        sessionId: "",
        role: "bot",
        body: resp.reply,
        metadata: {},
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, botMsg]);
      setPending((resp.pendingClassification as PendingClassification | null) ?? null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Error sending message";
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), sessionId: "", role: "bot", body: `Sorry, something went wrong: ${errMsg}`, metadata: {}, createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await send(input.trim());
  }

  function renderBody(body: string) {
    // Minimal markdown: **bold** → <strong>
    return body.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: 18 }}>Assistant</h2>
      <p style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#6b7280" }}>
        Describe your complaint or request — I will raise a ticket for you.
      </p>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", paddingBottom: "0.5rem" }}>
        {loading && <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading…</p>}
        {!loading && messages.length === 0 && (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>No messages yet. Type your issue below.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "0.5rem 0.75rem",
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.5,
                background: msg.role === "user" ? "#1a73e8" : "#f3f4f6",
                color: msg.role === "user" ? "#fff" : "#111827",
              }}
              dangerouslySetInnerHTML={{ __html: renderBody(msg.body) }}
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick-reply buttons when there's a pending classification */}
      {pending && !sending && (
        <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "0.5rem" }}>
          <button
            onClick={() => send("YES")}
            style={{ flex: 1, padding: "0.5rem", borderRadius: 8, background: "#16a34a", color: "#fff", border: "none", fontSize: 14, cursor: "pointer", fontWeight: 600 }}
          >
            Yes, raise ticket
          </button>
          <button
            onClick={() => send("NO")}
            style={{ flex: 1, padding: "0.5rem", borderRadius: 8, background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", fontSize: 14, cursor: "pointer" }}
          >
            No, cancel
          </button>
        </div>
      )}

      <form onSubmit={handleSend} style={{ display: "flex", gap: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #e5e7eb" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? "Or type a reply…" : "Describe your issue…"}
          disabled={sending}
          style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, outline: "none" }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{ padding: "0.5rem 1rem", borderRadius: 8, background: "#1a73e8", color: "#fff", border: "none", fontSize: 14, cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.6 : 1 }}
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
