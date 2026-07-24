"use client";

import { ApprovalsPanel } from "../../../../components/admin/approvals-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <ApprovalsPanel locale={locale} api={api} token={token} />;
}
