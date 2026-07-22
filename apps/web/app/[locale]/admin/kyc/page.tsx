"use client";

import { OfficerPanel } from "../../../../components/officer-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <OfficerPanel locale={locale} api={api} token={token} />;
}
