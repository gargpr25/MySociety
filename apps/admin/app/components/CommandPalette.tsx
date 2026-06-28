"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Command = {
  id: string;
  label: string;
  group: string;
  action: () => void;
  keywords?: string;
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { id: "nav-units", label: "Go to Units", group: "Navigate", action: () => router.push("/units"), keywords: "flats apartments" },
    { id: "nav-import", label: "Go to Import CSV", group: "Navigate", action: () => router.push("/import"), keywords: "residents upload" },
    { id: "nav-billing", label: "Go to Billing", group: "Navigate", action: () => router.push("/billing"), keywords: "invoices cycles bill heads" },
    { id: "nav-payments", label: "Go to Payments", group: "Navigate", action: () => router.push("/payments"), keywords: "transactions razorpay" },
    { id: "nav-bank", label: "Go to Bank Account", group: "Navigate", action: () => router.push("/bank"), keywords: "settlement account ifsc" },
    { id: "nav-tickets", label: "Go to Tickets", group: "Navigate", action: () => router.push("/tickets"), keywords: "complaints requests support" },
    { id: "nav-bookings", label: "Go to Bookings", group: "Navigate", action: () => router.push("/bookings"), keywords: "amenities playground clubhouse resources" },
    { id: "nav-parking", label: "Go to Parking", group: "Navigate", action: () => router.push("/parking"), keywords: "spots allocation" },
    { id: "nav-notices", label: "Go to Notices", group: "Navigate", action: () => router.push("/notices"), keywords: "announcements board" },
    { id: "nav-integrations", label: "Go to Integrations", group: "Navigate", action: () => router.push("/integrations"), keywords: "webhook connector tally" },
    { id: "nav-login", label: "Go to Login", group: "Navigate", action: () => router.push("/login"), keywords: "logout sign out" },
  ];

  const q = query.toLowerCase().trim();
  const filtered = q
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.group.toLowerCase().includes(q) ||
          (c.keywords ?? "").toLowerCase().includes(q),
      )
    : commands;

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        if (!open) setQuery("");
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      const cmd = filtered[activeIdx];
      if (cmd) { cmd.action(); setOpen(false); setQuery(""); }
    }
  }

  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{ width: "min(560px, 90vw)", background: "#fff", borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "0.75rem 1rem", borderBottom: "1px solid #e5e7eb", gap: "0.5rem" }}>
          <span style={{ color: "#9ca3af", fontSize: 18 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search pages and actions…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 16, background: "transparent" }}
          />
          <kbd style={{ fontSize: 11, color: "#9ca3af", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 4, padding: "1px 5px" }}>ESC</kbd>
        </div>

        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <p style={{ padding: "1rem", color: "#9ca3af", fontSize: 14 }}>No results</p>
          ) : (
            (() => {
              let lastGroup = "";
              return filtered.map((cmd, i) => {
                const showGroup = cmd.group !== lastGroup;
                lastGroup = cmd.group;
                return (
                  <div key={cmd.id}>
                    {showGroup && (
                      <div style={{ padding: "0.4rem 1rem 0.2rem", fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {cmd.group}
                      </div>
                    )}
                    <div
                      onMouseDown={() => { cmd.action(); setOpen(false); setQuery(""); }}
                      onMouseEnter={() => setActiveIdx(i)}
                      style={{
                        padding: "0.55rem 1rem",
                        cursor: "pointer",
                        fontSize: 14,
                        background: i === activeIdx ? "#eff6ff" : undefined,
                        color: i === activeIdx ? "#1d4ed8" : "#111",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      {cmd.label}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>

        <div style={{ padding: "0.4rem 1rem", borderTop: "1px solid #f3f4f6", fontSize: 11, color: "#9ca3af", display: "flex", gap: "0.75rem" }}>
          <span><kbd style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 3, padding: "1px 4px" }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 3, padding: "1px 4px" }}>↵</kbd> open</span>
          <span><kbd style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 3, padding: "1px 4px" }}>⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
