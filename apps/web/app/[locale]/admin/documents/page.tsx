"use client";

import { DocumentReviewQueue } from "../../../../components/admin/document-review-queue";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <DocumentReviewQueue locale={locale} api={api} token={token} />;
}
