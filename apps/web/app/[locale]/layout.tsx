import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { dictionaries, direction, isLocale, locales } from "../../lib/i18n";
import "../globals.css";

export const generateStaticParams = () => locales.map((locale) => ({ locale }));

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const t = dictionaries[locale];

  return (
    <html lang={locale} dir={direction[locale]}>
      <body>
        <header>
          <h1>{t.appTitle}</h1>
          {/* Locale switcher returns here when a second locale is added (PRD §3 C6). */}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
