import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io", ...(process.env.DEV_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)],
  serverExternalPackages: ["better-sqlite3"],
  // Lets phones/other devices on the LAN load the dev server (HMR, API routes)
  // instead of only localhost. The trailing wildcard octet covers a DHCP lease change.
  allowedDevOrigins: ["192.168.150.236", "192.168.150.*"],
};

export default nextConfig;
