import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained .next/standalone/server.js so the Windows service
  // can run `node server.js` without node_modules being installed at the target.
  output: "standalone",
  // better-sqlite3 is a native module; keep it external so Next doesn't try to
  // bundle the .node binary.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
