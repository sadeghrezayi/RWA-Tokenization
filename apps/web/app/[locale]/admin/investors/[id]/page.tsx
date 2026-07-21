"use client";

import { use, useEffect, useMemo, useState } from "react";
import { notFound, useRouter } from "next/navigation";
import { InvestorDetailPage } from "../../../../../components/investor-detail-page";
import { OfficerLogin } from "../../../../../components/officer-login";
import { createApiClient } from "../../../../../lib/api";
import { dictionaries, isLocale } from "../../../../../lib/i18n";
import { OFFICER_TOKEN_KEY } from "../../page";

export default function InvestorDetailRoute({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = use(params);
  const router = useRouter();
  const api = useMemo(() => createApiClient(), []);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(OFFICER_TOKEN_KEY) ?? undefined);
    setHydrated(true);
  }, []);

  if (!isLocale(locale)) {
    notFound();
  }
  const t = dictionaries[locale];
  const backToList = () => {
    router.push(`/${locale}/admin`);
  };

  if (!hydrated) {
    return null;
  }

  // Officer session lives in sessionStorage (set by the admin console). If it is
  // absent — e.g. a deep link or a new tab — collect credentials here.
  if (token === undefined) {
    return (
      <div className="stack">
        <div>
          <h1 className="page-title">{t.adminTitle}</h1>
          <p className="page-subtitle">{t.adminSubtitle}</p>
        </div>
        <OfficerLogin
          locale={locale}
          api={api}
          onAuthed={(newToken) => {
            sessionStorage.setItem(OFFICER_TOKEN_KEY, newToken);
            setToken(newToken);
          }}
        />
      </div>
    );
  }

  return (
    <InvestorDetailPage
      locale={locale}
      api={api}
      token={token}
      investorId={id}
      onBack={backToList}
    />
  );
}
