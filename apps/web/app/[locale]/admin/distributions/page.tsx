"use client";

import { DistributionsPanel } from "../../../../components/distributions-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <DistributionsPanel locale={locale} api={api} token={token} />;
}
