import type { MetadataRoute } from "next";

const siteUrl = (): string => process.env.SITE_URL ?? "http://localhost:3000";

// 2.2: only the public marketplace is crawlable. The portals are behind auth
// anyway, but disallowing them keeps signed-in surfaces out of search results
// and out of crawl budget.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/en/admin", "/en/portfolio", "/en/profile", "/en/offerings"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
