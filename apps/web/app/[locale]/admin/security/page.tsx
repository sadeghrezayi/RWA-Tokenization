"use client";

import { OfficerSecurityCard } from "../../../../components/admin/officer-security-card";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <OfficerSecurityCard locale={locale} api={api} token={token} />;
}
