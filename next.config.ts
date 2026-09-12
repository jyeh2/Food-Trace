import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Without this, Next dev blocks cross-origin requests to its dev-tooling
  // endpoints (e.g. /_next/hmr) from any host but localhost — including a
  // phone hitting the printed "Network:" LAN IP for phone-camera testing.
  // Update this IP if it changes (new network, DHCP renewal, etc).
  allowedDevOrigins: ["172.26.54.152"],
};

export default nextConfig;
