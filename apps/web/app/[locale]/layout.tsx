import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ToastProvider } from "../../components/ui/toast";
import { direction, isLocale, locales } from "../../lib/i18n";
import "../globals.css";
import "../components.css";

export const generateStaticParams = () => locales.map((locale) => ({ locale }));

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
