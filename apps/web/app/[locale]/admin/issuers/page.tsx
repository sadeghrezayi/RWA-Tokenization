"use client";

import { IssuersPanel } from "../../../../components/admin/issuers-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <IssuersPanel locale={locale} api={api} csrfToken={token} />;
}
