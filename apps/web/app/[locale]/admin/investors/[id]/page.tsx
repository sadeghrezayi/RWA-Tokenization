"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { InvestorDetailPage } from "../../../../../components/investor-detail-page";
import { useAdminSession } from "../../../../../components/admin/admin-session";

export default function InvestorDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <InvestorDetailPage
      locale={locale}
      api={api}
      token={token}
      investorId={id}
      onBack={() => {
        router.push(`/${locale}/admin/investors`);
      }}
    />
  );
}
