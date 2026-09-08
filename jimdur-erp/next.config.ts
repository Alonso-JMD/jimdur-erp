import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the database driver on the server side and use the full Node.js
  // runtime for Neon, file parsing and the existing route handlers.
  serverExternalPackages: ["@neondatabase/serverless"],
};

export default nextConfig;
