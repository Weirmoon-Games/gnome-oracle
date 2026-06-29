import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained .next/standalone/server.js so the Windows service
  // can run `node server.js` without node_modules being installed at the target.
  output: "standalone",
  // Keep native / server-only packages EXTERNAL so Next doesn't try to bundle
  // their binaries:
  //   • better-sqlite3 — native .node binary (default SQLite backend)
  //   • pg             — Postgres driver (only loaded when switched to Postgres)
  //   • kokoro-js / @huggingface/transformers — large; only ever loaded in the
  //     browser via dynamic import, so they must never enter the server bundle
  //     (which would otherwise pull in onnxruntime-node).
  serverExternalPackages: [
    "better-sqlite3",
    "pg",
    "kokoro-js",
    "@huggingface/transformers",
  ],
};

export default nextConfig;
