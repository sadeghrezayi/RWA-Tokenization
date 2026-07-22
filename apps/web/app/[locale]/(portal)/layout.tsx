import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { InvestorShell } from "../../../components/investor/investor-shell";
import { isLocale } from "../../../lib/i18n";

export default async function PortalLayout({
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
  return <InvestorShell locale={locale}>{children}</InvestorShell>;
}
