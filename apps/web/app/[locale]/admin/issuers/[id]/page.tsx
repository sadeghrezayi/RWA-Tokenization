"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { IssuerDetailPage } from "../../../../../components/admin/issuer-detail-page";
import { useAdminSession } from "../../../../../components/admin/admin-session";

export default function IssuerDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <IssuerDetailPage
      locale={locale}
      api={api}
      csrfToken={token}
      organisationId={id}
      onBack={() => {
        router.push(`/${locale}/admin/issuers`);
      }}
    />
  );
}
