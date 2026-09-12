import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones/other devices on the LAN, plus the ngrok tunnel, load the dev
  // server (HMR, API routes) instead of only localhost. The trailing wildcard
  // octet covers a DHCP lease change.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io", "192.168.150.236", "192.168.150.*", ...(process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)],
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
