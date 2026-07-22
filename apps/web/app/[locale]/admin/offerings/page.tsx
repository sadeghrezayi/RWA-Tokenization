"use client";

import { useRouter } from "next/navigation";
import { AdminOfferingsPanel } from "../../../../components/admin-offerings-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <AdminOfferingsPanel
      locale={locale}
      api={api}
      token={token}
      onOpenOffering={(id) => {
        router.push(`/${locale}/admin/offerings/${id}`);
      }}
    />
  );
}
