import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ToastProvider } from "../../components/ui/toast";
import { dictionaries, direction, isLocale, locales } from "../../lib/i18n";
import "../globals.css";
import "../components.css";

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
        <ToastProvider>
          <header className="app-header">
            <span className="app-header__brand">
              <span className="app-header__logo" aria-hidden="true">
                ◈
              </span>
              {t.appTitle}
            </span>
            <span className="app-header__right">Pilot · self-hosted</span>
          </header>
          <main className="app-main">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
