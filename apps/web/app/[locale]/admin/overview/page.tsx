"use client";

import { OverviewPanel } from "../../../../components/overview-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <OverviewPanel locale={locale} api={api} token={token} />;
}
