import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Allow remote access in dev mode (fixes HMR/CSS loading from other machines)
  allowedDevOrigins: ["home.farsheed.com", "*.farsheed.com", "192.168.*.*", "10.*.*.*", "172.16.*.*"],
};

export default nextConfig;
