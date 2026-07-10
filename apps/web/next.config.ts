import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // English is the default locale (PRD §3 C6): the bare root lands on /en.
  redirects() {
    return Promise.resolve([{ source: "/", destination: "/en", permanent: false }]);
  },
};

export default nextConfig;
