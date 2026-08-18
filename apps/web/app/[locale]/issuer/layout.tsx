import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { IssuerShell } from "../../../components/issuer/issuer-shell";
import { isLocale } from "../../../lib/i18n";

export default async function IssuerLayout({
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
  return <IssuerShell locale={locale}>{children}</IssuerShell>;
}
