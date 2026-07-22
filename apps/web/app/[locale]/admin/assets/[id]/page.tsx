"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { AssetDetailPage } from "../../../../../components/asset-detail-page";
import { useAdminSession } from "../../../../../components/admin/admin-session";

export default function AssetDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <AssetDetailPage
      locale={locale}
      api={api}
      token={token}
      assetId={id}
      onBack={() => {
        router.push(`/${locale}/admin/assets`);
      }}
    />
  );
}
