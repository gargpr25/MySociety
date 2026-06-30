import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Rewrite /api/* → API service so the frontend never hardcodes the backend URL.
  // Set NEXT_PUBLIC_API_URL (or API_URL) to the Railway API service's internal URL.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
