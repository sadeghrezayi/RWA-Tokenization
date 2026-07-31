import type { MetadataRoute } from "next";
import { fetchPublicOfferings } from "../lib/public-api";
import { defaultLocale, locales } from "../lib/i18n";

const siteUrl = (): string => process.env.SITE_URL ?? "http://localhost:3000";

// 2.2: the sitemap is built from the PUBLIC catalog endpoint, so it can only
// ever contain deliberately-published offerings — an unpublished one is
// invisible to the API and therefore cannot leak into search engines.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const offerings = (await fetchPublicOfferings()) ?? [];

  const staticEntries: MetadataRoute.Sitemap = locales.flatMap((locale) => [
    { url: `${base}/${locale}`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/${locale}/browse`, changeFrequency: "daily", priority: 0.8 },
  ]);

  const offeringEntries: MetadataRoute.Sitemap = offerings.map((offering) => ({
    url: `${base}/${defaultLocale}/browse/${offering.id}`,
    lastModified: new Date(offering.publishedAt),
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticEntries, ...offeringEntries];
}
