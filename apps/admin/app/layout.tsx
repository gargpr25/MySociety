import type { ReactNode } from "react";

export const metadata = {
  title: "mySociety Admin",
  description: "Society administration console",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "1rem" }}>
        <nav style={{ borderBottom: "1px solid #ddd", paddingBottom: "0.5rem", marginBottom: "1.5rem" }}>
          <a href="/units" style={{ marginRight: "1rem", fontWeight: 600 }}>Units</a>
          <a href="/import" style={{ marginRight: "1rem" }}>Import CSV</a>
          <a href="/notices" style={{ marginRight: "1rem" }}>Notices</a>
          <a href="/billing" style={{ marginRight: "1rem" }}>Billing</a>
          <a href="/login">Login / Logout</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
