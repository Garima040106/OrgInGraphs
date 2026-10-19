import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    const backendOrigin = (
      process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "https://orgingraphs.onrender.com"
    ).replace(/\/+$/, "");

    return [
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
      { source: "/health", destination: `${backendOrigin}/health` },
    ];
  },
};

export default nextConfig;
