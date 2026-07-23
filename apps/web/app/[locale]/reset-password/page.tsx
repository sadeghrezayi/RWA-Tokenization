import { notFound } from "next/navigation";
import { ResetPasswordScreen } from "../../../components/reset-password-screen";
import { isLocale } from "../../../lib/i18n";

// T4 self-service reset — the page the emailed link points at
// (/{locale}/reset-password?token=...). Sits outside the portal/admin shells so
// a signed-out user can reach it. The single-use token arrives as a query param.
export default async function ResetPasswordPage({
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
  return <ResetPasswordScreen locale={locale} token={value} />;
}
