import type { NextConfig } from "next";

// StrayWatch: static front end only. Detection runs in the viewer's browser; there is no API.
const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The site itself needs the camera (live monitoring) and location (placing cameras).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
