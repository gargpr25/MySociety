import type { ReactNode } from "react";

export const metadata = {
  title: "mySociety",
  description: "Resident app for billing, notices, complaints, and bookings",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
