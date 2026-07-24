import { notFound } from "next/navigation";
import { VerifyEmailScreen } from "../../../components/verify-email-screen";
import { isLocale } from "../../../lib/i18n";

// T4 email verification — the page the emailed link points at
// (/{locale}/verify-email?token=...). Sits outside the portal/admin shells so a
// signed-out user can reach it. The single-use token arrives as a query param.
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  return <VerifyEmailScreen locale={locale} token={value} />;
}
