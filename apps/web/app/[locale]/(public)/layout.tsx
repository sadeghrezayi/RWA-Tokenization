import type { ReactNode } from "react";
import Link from "next/link";
import { dictionaries, isLocale } from "../../../lib/i18n";
import type { Locale } from "../../../lib/i18n";

// 2.1b: chrome for the anonymous marketplace (OD-5). Deliberately minimal — a
// visitor here has no session, so there is no sidebar, no notifications and
// nothing that assumes an identity.
export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const t = dictionaries[locale];

  return (
    <div className="public">
      <header className="public__bar">
        <Link href={`/${locale}`} className="brand">
          <span className="brand__logo" aria-hidden="true">
            ◈
          </span>
          <span>{t.appTitle}</span>
        </Link>
        <nav className="public__nav" aria-label="public navigation">
          <Link href={`/${locale}/browse`}>{t.publicBrowseTitle}</Link>
          <Link className="btn btn--primary btn--sm" href={`/${locale}/portfolio`}>
            {t.publicSignIn}
          </Link>
        </nav>
      </header>
      <main className="public__main">{children}</main>
    </div>
  );
}
