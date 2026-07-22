"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { OfferingDetailPage } from "../../../../../components/offering-detail-page";
import { useAdminSession } from "../../../../../components/admin/admin-session";

export default function OfferingDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <OfferingDetailPage
      locale={locale}
      api={api}
      token={token}
      offeringId={id}
      onBack={() => {
        router.push(`/${locale}/admin/offerings`);
      }}
    />
  );
}
