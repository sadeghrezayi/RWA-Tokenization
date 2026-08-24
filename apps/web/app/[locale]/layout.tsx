import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ToastProvider } from "../../components/ui/toast";
import { direction, isLocale, locales } from "../../lib/i18n";
import "../globals.css";
import "../components.css";

export const generateStaticParams = () => locales.map((locale) => ({ locale }));

// Every page rendered with NO <title> at all — a serious WCAG failure found by
// axe (P1-6): a screen-reader user tabbing between tabs hears nothing that
// identifies the page, and browser history is a row of blank entries. It also
// undercut the SEO the public catalogue was approved for (OD-5).
//
// `template` lets each page name itself while keeping the platform's name in
// the tab; `default` covers the pages that do not.
export const metadata = {
  title: {
    default: "Asset Tokenization Platform",
    template: "%s · Asset Tokenization Platform",
  },
  description:
    "Ownership of real assets, represented as transferable tokens on a permissioned chain.",
};

// Root shell is intentionally chrome-free: each area (admin console, investor
// portal) provides its own sidebar shell so the layouts don't fight over width.
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

  return (
    <html lang={locale} dir={direction[locale]}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
