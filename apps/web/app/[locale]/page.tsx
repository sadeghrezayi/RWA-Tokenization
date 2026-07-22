import { redirect } from "next/navigation";

// The investor portal lives under section routes; land on the portfolio.
export default async function PortalIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/portfolio`);
}
