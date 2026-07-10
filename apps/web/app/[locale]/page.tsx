import { notFound } from "next/navigation";
import { Dashboard } from "../../components/dashboard";
import { isLocale } from "../../lib/i18n";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <Dashboard locale={locale} />;
}
