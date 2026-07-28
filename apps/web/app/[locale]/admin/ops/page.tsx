"use client";

import { OpsPanel } from "../../../../components/admin/ops-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <OpsPanel locale={locale} api={api} token={token} />;
}
