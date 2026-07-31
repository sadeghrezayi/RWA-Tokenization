import type { Metadata } from "next";
import { PublicCatalog } from "../../../../components/public/public-catalog";
import { fetchPublicOfferings } from "../../../../lib/public-api";
import { dictionaries, isLocale } from "../../../../lib/i18n";
import type { Locale } from "../../../../lib/i18n";

export const revalidate = 60;

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> => {
  const { locale: raw } = await params;
  const t = dictionaries[isLocale(raw) ? raw : "en"];
  return { title: `${t.publicBrowseTitle} · ${t.appTitle}`, description: t.publicHomeLead };
};

export default async function BrowsePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const t = dictionaries[locale];
  const offerings = await fetchPublicOfferings();

  return (
    <section className="stack">
      <h1 className="page-title">{t.publicBrowseTitle}</h1>
      <PublicCatalog locale={locale} offerings={offerings} />
    </section>
  );
}
