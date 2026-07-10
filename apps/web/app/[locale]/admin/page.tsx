"use client";

import { use, useMemo } from "react";
import { notFound } from "next/navigation";
import { OfficerPanel } from "../../../components/officer-panel";
import { createApiClient } from "../../../lib/api";
import { isLocale } from "../../../lib/i18n";

export default function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const api = useMemo(() => createApiClient(), []);
  if (!isLocale(locale)) {
    notFound();
  }
  return <OfficerPanel locale={locale} api={api} />;
}
