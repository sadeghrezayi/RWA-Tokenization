"use client";

import { AssetsPanel } from "../../../../components/assets-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <AssetsPanel locale={locale} api={api} token={token} />;
}
