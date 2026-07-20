"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { AdminOfferingsPanel } from "../../../components/admin-offerings-panel";
import { AssetsPanel } from "../../../components/assets-panel";
import { AuditPanel } from "../../../components/audit-panel";
import { DistributionsPanel } from "../../../components/distributions-panel";
import { InvestorsPanel } from "../../../components/investors-panel";
import { RegistryPanel } from "../../../components/registry-panel";
import { OfficerLogin } from "../../../components/officer-login";
import { OfficerPanel } from "../../../components/officer-panel";
import { OverviewPanel } from "../../../components/overview-panel";
import { RedemptionsPanel } from "../../../components/redemptions-panel";
import { Button } from "../../../components/ui/primitives";
import { createApiClient } from "../../../lib/api";
import { dictionaries, isLocale } from "../../../lib/i18n";

type Tab =
  | "overview"
  | "kyc"
  | "investors"
  | "assets"
  | "offerings"
  | "distributions"
  | "redemptions"
  | "registry"
  | "audit";

export default function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  const api = useMemo(() => createApiClient(), []);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("overview");
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
    { id: "overview", label: t.overviewTitle },
    { id: "kyc", label: t.pendingKycTitle },
    { id: "investors", label: t.investorsTitle },
    { id: "assets", label: t.assetsTitle },
    { id: "offerings", label: t.offeringsTitle },
    { id: "distributions", label: t.distributionsTitle },
    { id: "redemptions", label: t.redemptionsTitle },
    { id: "registry", label: t.registryTitle },
    { id: "audit", label: t.auditTitle },
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

      {tab === "overview" && <OverviewPanel locale={locale} api={api} token={token} />}
      {tab === "kyc" && <OfficerPanel locale={locale} api={api} token={token} />}
      {tab === "investors" && <InvestorsPanel locale={locale} api={api} token={token} />}
      {tab === "assets" && <AssetsPanel locale={locale} api={api} token={token} />}
      {tab === "offerings" && <AdminOfferingsPanel locale={locale} api={api} token={token} />}
      {tab === "distributions" && <DistributionsPanel locale={locale} api={api} token={token} />}
      {tab === "redemptions" && <RedemptionsPanel locale={locale} api={api} token={token} />}
      {tab === "registry" && <RegistryPanel locale={locale} api={api} token={token} />}
      {tab === "audit" && <AuditPanel locale={locale} api={api} token={token} />}
    </div>
  );
}
