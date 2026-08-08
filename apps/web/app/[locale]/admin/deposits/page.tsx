"use client";

import { FundingQueueCard } from "../../../../components/admin/funding-queue-card";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <FundingQueueCard locale={locale} api={api} csrfToken={token} />;
}
