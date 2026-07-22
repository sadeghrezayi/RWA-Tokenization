"use client";

import { useRouter } from "next/navigation";
import { DistributionsPanel } from "../../../../components/distributions-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <DistributionsPanel
      locale={locale}
      api={api}
      token={token}
      onOpenDistribution={(id) => {
        router.push(`/${locale}/admin/distributions/${id}`);
      }}
    />
  );
}
