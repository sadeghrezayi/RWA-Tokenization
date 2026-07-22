"use client";

import { AuditPanel } from "../../../../components/audit-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <AuditPanel locale={locale} api={api} token={token} />;
}
