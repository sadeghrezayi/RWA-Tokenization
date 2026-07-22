import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../components/admin/admin-shell";
import { isLocale } from "../../../lib/i18n";

export default async function AdminLayout({
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
  return <AdminShell locale={locale}>{children}</AdminShell>;
}
