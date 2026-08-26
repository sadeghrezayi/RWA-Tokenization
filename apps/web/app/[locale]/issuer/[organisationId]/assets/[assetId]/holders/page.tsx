"use client";

import { use } from "react";
import { IssuerHolders } from "../../../../../../../components/issuer/issuer-holders";
import { useIssuerSession } from "../../../../../../../components/issuer/issuer-session";

// P1-2 / FR-PT-2. Neither id is trusted from the URL: the endpoint authorises
// against the ASSET's owning organisation, so pairing your own organisation id
// with someone else's asset id earns a refusal rather than a cap table.
export default function Page({
  params,
}: {
  params: Promise<{ organisationId: string; assetId: string }>;
}) {
  const { organisationId, assetId } = use(params);
  const { locale, api, token } = useIssuerSession();
  return (
    <IssuerHolders
      locale={locale}
      organisationId={organisationId}
      assetId={assetId}
      token={token}
      api={api}
    />
  );
}
