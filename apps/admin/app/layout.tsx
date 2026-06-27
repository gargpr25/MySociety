import type { ReactNode } from "react";

export const metadata = {
  title: "mySociety Admin",
  description: "Society administration console",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
