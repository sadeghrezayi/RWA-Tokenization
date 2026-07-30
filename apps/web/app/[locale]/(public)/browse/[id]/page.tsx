"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { PublicOfferingDetail } from "../../../../../components/public/public-offering-detail";
import { createApiClient } from "../../../../../lib/api";
import { isLocale } from "../../../../../lib/i18n";
import type { Locale } from "../../../../../lib/i18n";

export default function PublicOfferingPage() {
  const params = useParams<{ locale: string; id: string }>();
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const api = useMemo(() => createApiClient(), []);

  return <PublicOfferingDetail locale={locale} api={api} offeringId={params.id} />;
}
