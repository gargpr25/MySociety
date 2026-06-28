"use client";

import { useEffect, useRef, useState } from "react";

export type ComboboxOption = {
  id: string;
  label: string;
  sublabel?: string;
};

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Combobox({ options, value, onChange, placeholder = "Search…", disabled }: ComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
  }

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          padding: "0.3rem 0.5rem",
          background: disabled ? "#f9fafb" : "#fff",
          cursor: disabled ? "not-allowed" : "pointer",
          gap: "0.4rem",
        }}
        onClick={() => !disabled && setOpen(true)}
      >
        {selected && !open ? (
          <>
            <span style={{ flex: 1, fontSize: 14 }}>{selected.label}</span>
            {selected.sublabel && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>{selected.sublabel}</span>
            )}
            <button
              type="button"
              onClick={handleClear}
              style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </>
        ) : (
          <input
            autoFocus={open}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selected ? selected.label : placeholder}
            disabled={disabled}
            style={{
              border: "none",
              outline: "none",
              flex: 1,
              fontSize: 14,
              background: "transparent",
              cursor: disabled ? "not-allowed" : "text",
            }}
          />
        )}
        <span style={{ color: "#9ca3af", fontSize: 10 }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            zIndex: 100,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "0.5rem 0.75rem", fontSize: 13, color: "#9ca3af" }}>No results</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.id}
                onMouseDown={() => handleSelect(o.id)}
                style={{
                  padding: "0.45rem 0.75rem",
                  cursor: "pointer",
                  background: o.id === value ? "#eff6ff" : undefined,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 14,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f3f4f6"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = o.id === value ? "#eff6ff" : ""; }}
              >
                <span>{o.label}</span>
                {o.sublabel && <span style={{ fontSize: 12, color: "#6b7280" }}>{o.sublabel}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
