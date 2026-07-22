"use client";

import { RedemptionsPanel } from "../../../../components/redemptions-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <RedemptionsPanel locale={locale} api={api} token={token} />;
}
