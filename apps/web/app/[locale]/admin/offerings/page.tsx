"use client";

import { AdminOfferingsPanel } from "../../../../components/admin-offerings-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <AdminOfferingsPanel locale={locale} api={api} token={token} />;
}
