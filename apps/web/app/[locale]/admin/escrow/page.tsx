"use client";

import { EscrowAwaitingMintPanel } from "../../../../components/admin/escrow-awaiting-mint-panel";
import { useAdminSession } from "../../../../components/admin/admin-session";
import { PERMISSIONS } from "../../../../lib/api";

export default function Page() {
  const { locale, api, token, permissions } = useAdminSession();
  // Returning money is a LEDGER_CREDIT act (treasury), not a reporting one —
  // an auditor can see stranded escrow and must not be offered the lever.
  return (
    <EscrowAwaitingMintPanel
      locale={locale}
      api={api}
      token={token}
      canRelease={permissions.includes(PERMISSIONS.LEDGER_CREDIT)}
    />
  );
}
