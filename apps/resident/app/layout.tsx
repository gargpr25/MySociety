import type { ReactNode } from "react";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";

export const metadata = {
  title: "mySociety",
  description: "Resident app for billing, notices, complaints, and bookings",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a73e8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f5f5" }}>
        <ServiceWorkerRegistrar />
        <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", minHeight: "100vh", padding: "1rem" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
