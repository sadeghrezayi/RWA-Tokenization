import Link from "next/link";
import { dictionaries, isLocale } from "../../../lib/i18n";
import type { Locale } from "../../../lib/i18n";

// 2.1b: the public landing page. Previously `/` redirected to the login-gated
// portfolio; with OD-5 (public catalog) an anonymous visitor lands here instead.
export default async function PublicHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : "en";
  const t = dictionaries[locale];

  return (
    <section className="hero stack">
      <h1 className="hero__title">{t.publicHomeTitle}</h1>
      <p className="hero__lead">{t.publicHomeLead}</p>
      <Link className="btn btn--primary" href={`/${locale}/browse`}>
        {t.publicBrowseCta}
      </Link>
    </section>
  );
}
