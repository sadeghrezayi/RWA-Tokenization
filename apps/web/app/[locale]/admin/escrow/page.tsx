"use client";

import { EscrowAwaitingMintPanel } from "../../../../components/admin/escrow-awaiting-mint-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";

export default function Page() {
  const { locale, api, token } = useAdminSession();
  return <EscrowAwaitingMintPanel locale={locale} api={api} token={token} />;
}
