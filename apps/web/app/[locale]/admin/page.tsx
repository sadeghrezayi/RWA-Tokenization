"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { AssetsPanel } from "../../../components/assets-panel";
import { OfficerPanel } from "../../../components/officer-panel";
import { createApiClient } from "../../../lib/api";
import { isLocale } from "../../../lib/i18n";

export default function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const api = useMemo(() => createApiClient(), []);
  const [token, setToken] = useState<string | undefined>(undefined);
  if (!isLocale(locale)) {
    notFound();
  }
  return (
    <>
      <OfficerPanel locale={locale} api={api} onAuthed={setToken} />
      {token !== undefined && <AssetsPanel locale={locale} api={api} token={token} />}
    </>
  );
}
