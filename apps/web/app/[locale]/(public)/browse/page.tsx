"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { PublicCatalog } from "../../../../components/public/public-catalog";
import { createApiClient } from "../../../../lib/api";
import { dictionaries, isLocale } from "../../../../lib/i18n";
import type { Locale } from "../../../../lib/i18n";

export default function BrowsePage() {
  const params = useParams<{ locale: string }>();
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const api = useMemo(() => createApiClient(), []);
  const t = dictionaries[locale];

  return (
    <section className="stack">
      <h1 className="page-title">{t.publicBrowseTitle}</h1>
      <PublicCatalog locale={locale} api={api} />
    </section>
  );
}
