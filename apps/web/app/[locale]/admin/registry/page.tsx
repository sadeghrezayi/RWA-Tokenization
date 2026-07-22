"use client";

import { RegistryPanel } from "../../../../components/registry-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <RegistryPanel locale={locale} api={api} token={token} />;
}
