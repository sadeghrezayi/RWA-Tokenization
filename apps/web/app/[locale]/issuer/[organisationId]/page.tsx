"use client";

import { use } from "react";
import { IssuerAssets } from "../../../../components/issuer/issuer-assets";
import { useIssuerSession } from "../../../../components/issuer/issuer-session";

// The organisation's own page: what it has brought to the platform. The id is
// not trusted from the URL — the endpoint authorises it against the reader's
// membership, so a stranger's guess gets a refusal rather than a list.
export default function Page({ params }: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = use(params);
  const { locale, api, token } = useIssuerSession();
  return <IssuerAssets locale={locale} organisationId={organisationId} csrf={token} api={api} />;
}
