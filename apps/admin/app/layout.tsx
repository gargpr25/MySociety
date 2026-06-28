import type { ReactNode } from "react";
import { ClientShell } from "./components/ClientShell";

export const metadata = {
  title: "mySociety Admin",
  description: "Society administration console",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "1rem" }}>
        <nav style={{ borderBottom: "1px solid #ddd", paddingBottom: "0.5rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0 1rem", flexWrap: "wrap" }}>
          <a href="/units" style={{ marginRight: "1rem", fontWeight: 600 }}>Units</a>
          <a href="/import" style={{ marginRight: "1rem" }}>Import CSV</a>
          <a href="/notices" style={{ marginRight: "1rem" }}>Notices</a>
          <a href="/billing" style={{ marginRight: "1rem" }}>Billing</a>
          <a href="/payments" style={{ marginRight: "1rem" }}>Payments</a>
          <a href="/bank" style={{ marginRight: "1rem" }}>Bank Account</a>
          <a href="/tickets" style={{ marginRight: "1rem" }}>Tickets</a>
          <a href="/bookings" style={{ marginRight: "1rem" }}>Bookings</a>
          <a href="/parking" style={{ marginRight: "1rem" }}>Parking</a>
          <a href="/integrations" style={{ marginRight: "1rem" }}>Integrations</a>
          <a href="/login">Login / Logout</a>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
            Press <kbd style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 4, padding: "1px 5px", fontFamily: "inherit" }}>⌘K</kbd> to search
          </span>
        </nav>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
