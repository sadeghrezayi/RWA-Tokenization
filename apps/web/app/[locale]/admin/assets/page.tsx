"use client";

import { useRouter } from "next/navigation";
import { AssetsPanel } from "../../../../components/assets-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  const router = useRouter();
  return (
    <AssetsPanel
      locale={locale}
      api={api}
      token={token}
      onOpenAsset={(id) => {
        router.push(`/${locale}/admin/assets/${id}`);
      }}
    />
  );
}
