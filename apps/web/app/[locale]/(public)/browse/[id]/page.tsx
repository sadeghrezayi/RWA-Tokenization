import type { Metadata } from "next";
import { PublicOfferingDetail } from "../../../../../components/public/public-offering-detail";
import { fetchPublicOffering } from "../../../../../lib/public-api";
import { dictionaries, isLocale } from "../../../../../lib/i18n";
import type { Locale } from "../../../../../lib/i18n";

export const revalidate = 60;

// Per-offering metadata, built only from factual published data. Deliberately no
// promotional or forward-looking wording (OD-21) — a share preview is still a
// financial promotion.
export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> => {
  const { locale: raw, id } = await params;
  const t = dictionaries[isLocale(raw) ? raw : "en"];
  const offering = await fetchPublicOffering(id);
  if (!offering) {
    // An unlisted offering must not get a descriptive title that confirms it.
    return { title: `${t.publicOfferingMissing} · ${t.appTitle}`, robots: { index: false } };
  }
  return {
    title: `${offering.assetName} · ${t.appTitle}`,
    description: `${t.publicTermsTitle}: ${t.publicSupply} ${offering.supply}.`,
  };
};

export default async function PublicOfferingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const offering = await fetchPublicOffering(id);

  return <PublicOfferingDetail locale={locale} offering={offering} />;
}
