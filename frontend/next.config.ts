import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    const backendOrigin = process.env.NODE_ENV === "production"
      ? process.env.API_BACKEND_URL?.trim() || "http://3.86.152.215:8080"
      : process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8080";
    const normalizedBackendOrigin = backendOrigin.replace(/\/+$/, "");

    return [
      { source: "/api/:path*", destination: `${normalizedBackendOrigin}/api/:path*` },
      { source: "/health", destination: `${normalizedBackendOrigin}/health` },
    ];
  },
};

export default nextConfig;
