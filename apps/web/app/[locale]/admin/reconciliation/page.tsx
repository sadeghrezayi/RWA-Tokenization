"use client";

import { ReconciliationPanel } from "../../../../components/admin/reconciliation-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <ReconciliationPanel locale={locale} api={api} token={token} />;
}
