"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApiClient, MyIssuerOrganisationDto } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { issuerStateLabel, issuerStateTone } from "../ui/issuer-state";
import { Card, EmptyState, Skeleton, Stat } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// 3.3e: the issuer portal's landing. What a person acting for an issuer needs
// before anything else — which organisation is mine, where its application
// stands, and what my role there lets me do.
export const IssuerHome = ({ locale, api }: { locale: Locale; api: ApiClient }) => {
  const t = dictionaries[locale];
  // Three states, not two. "You act for no issuer" and "we could not ask" look
  // identical if both render as an empty screen, and they mean opposite things
  // to the person reading them.
  const [organisations, setOrganisations] = useState<MyIssuerOrganisationDto[] | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void api
      .myIssuerOrganisations()
      .then(setOrganisations)
      .catch((cause: unknown) => {
        setError(messageOf(cause));
      });
  }, [api]);

  if (error !== undefined) {
    return (
      <Card title={t.issuerPortalTitle}>
        <p className="field__error" role="alert">
          {error}
        </p>
      </Card>
    );
  }

  if (organisations === undefined) {
    return <Skeleton lines={4} testId="my-issuers-loading" />;
  }

  if (organisations.length === 0) {
    return (
      <Card title={t.issuerPortalTitle}>
        <EmptyState icon="⬡">
          <span data-testid="no-issuer-membership">{t.issuerNoMembership}</span>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="stack">
      {organisations.map((organisation) => (
        <div key={organisation.id} data-testid={`my-issuer-${organisation.id}`}>
          <Card
            title={
              // The name is the way in: everything this organisation has
              // brought, on one page.
              <Link href={`/${locale}/issuer/${organisation.id}`}>{organisation.legalName}</Link>
            }
            subtitle={organisation.contactEmail}
          >
            <div className="stack">
              <div className="row">
                <Badge tone={issuerStateTone(organisation.state)}>
                  {issuerStateLabel(t, organisation.state)}
                </Badge>
                <span className="text-sm muted">
                  {organisation.role === "issuer_admin"
                    ? t.issuerRoleAdmin
                    : t.issuerRoleContributor}
                </span>
              </div>
              <div className="stat-row">
                <Stat label={t.issuersRegistrationLabel} value={organisation.registrationNumber} />
                <Stat label={t.issuersAppliedLabel} value={formatDate(organisation.appliedAt)} />
                {/* What this organisation may actually do today. An issuer whose
                  application is still open must be told why nothing can be
                  submitted yet, rather than shown an action that would 409. */}
                <Stat
                  label={t.issuersStateLabel}
                  value={
                    organisation.canSubmitAssets
                      ? t.issuerMayBringAssets
                      : t.issuerCannotBringAssetsYet
                  }
                />
              </div>
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
};
