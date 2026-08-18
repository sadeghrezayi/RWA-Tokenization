"use client";

import { IssuerHome } from "../../../components/issuer/issuer-home";
import { useIssuerSession } from "../../../components/issuer/issuer-session";

export default function Page() {
  const { locale, api } = useIssuerSession();
  return <IssuerHome locale={locale} api={api} />;
}
