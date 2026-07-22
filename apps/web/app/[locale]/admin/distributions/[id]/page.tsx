"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { DistributionDetailPage } from "../../../../../components/distribution-detail-page";
import { useAdminSession } from "../../../../../components/admin/admin-session";

export default function DistributionDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <DistributionDetailPage
      locale={locale}
      api={api}
      token={token}
      distributionId={id}
      onBack={() => {
        router.push(`/${locale}/admin/distributions`);
      }}
    />
  );
}
