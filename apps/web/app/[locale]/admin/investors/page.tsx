"use client";

import { useRouter } from "next/navigation";
import { InvestorsPanel } from "../../../../components/investors-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <InvestorsPanel
      locale={locale}
      api={api}
      token={token}
      onOpenInvestor={(id) => {
        router.push(`/${locale}/admin/investors/${id}`);
      }}
    />
  );
}
