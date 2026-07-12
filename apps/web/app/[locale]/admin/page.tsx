"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { AdminOfferingsPanel } from "../../../components/admin-offerings-panel";
import { AssetsPanel } from "../../../components/assets-panel";
import { DistributionsPanel } from "../../../components/distributions-panel";
import { OfficerLogin } from "../../../components/officer-login";
import { OfficerPanel } from "../../../components/officer-panel";
import { Button } from "../../../components/ui/primitives";
import { createApiClient } from "../../../lib/api";
import { dictionaries, isLocale } from "../../../lib/i18n";

type Tab = "kyc" | "assets" | "offerings" | "distributions";

export default function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const api = useMemo(() => createApiClient(), []);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("kyc");
  if (!isLocale(locale)) {
    notFound();
  }
  const t = dictionaries[locale];

  if (token === undefined) {
    return (
      <div className="stack">
        <div>
          <h1 className="page-title">{t.adminTitle}</h1>
          <p className="page-subtitle">{t.adminSubtitle}</p>
        </div>
        <OfficerLogin locale={locale} api={api} onAuthed={setToken} />
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "kyc", label: t.pendingKycTitle },
    { id: "assets", label: t.assetsTitle },
    { id: "offerings", label: t.offeringsTitle },
    { id: "distributions", label: t.distributionsTitle },
  ];

  return (
    <div className="stack">
      <div className="row row--between">
        <div>
          <h1 className="page-title">{t.adminTitle}</h1>
          <p className="page-subtitle">{t.adminSubtitle}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setToken(undefined);
          }}
        >
          {t.logout}
        </Button>
      </div>

      <nav className="tabs" aria-label="admin sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === tab ? "tab tab--active" : "tab"}
            aria-current={item.id === tab ? "page" : undefined}
            onClick={() => {
              setTab(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "kyc" && <OfficerPanel locale={locale} api={api} token={token} />}
      {tab === "assets" && <AssetsPanel locale={locale} api={api} token={token} />}
      {tab === "offerings" && <AdminOfferingsPanel locale={locale} api={api} token={token} />}
      {tab === "distributions" && <DistributionsPanel locale={locale} api={api} token={token} />}
    </div>
  );
}
