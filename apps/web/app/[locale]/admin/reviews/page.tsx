"use client";

import { DueReviewsPanel } from "../../../../components/admin/due-reviews-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <DueReviewsPanel locale={locale} api={api} token={token} />;
}
