import { redirect } from "next/navigation";

// The console lives under section routes now; land on the overview.
export default async function AdminIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/admin/overview`);
}
