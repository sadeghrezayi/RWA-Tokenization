"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "../../lib/api";
import type { ApiClient, PublicOfferingDto } from "../../lib/api";
import { formatDate, formatRial, formatTokens } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Card, Skeleton } from "../ui/primitives";

// 2.1b: the anonymous offering page. Shows ONLY the factual terms the API
// returns — per OD-21 there is no projected yield, expected return, or any
// other forward-looking figure anywhere on this page, and none may be added
// without an approved methodology.
//
// The risk notice is deliberately generic and non-jurisdictional: real
// disclosure text is jurisdiction policy (OD-8, undecided) and REQUIRES LOCAL
// LEGAL VALIDATION. It is not invented here.
export const PublicOfferingDetail = ({
  locale,
  api,
  offeringId,
}: {
  locale: Locale;
  api: ApiClient;
  offeringId: string;
}) => {
  const t = dictionaries[locale];
  const [offering, setOffering] = useState<PublicOfferingDto | undefined>(undefined);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .publicOffering(offeringId)
      .then((view) => {
        if (active) setOffering(view);
      })
      .catch((error: unknown) => {
        // An unlisted offering is a 404 by design — publicly it does not exist.
        if (active && error instanceof ApiError && error.status === 404) setMissing(true);
        else if (active) setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [api, offeringId]);

  if (missing) {
    return (
      <Card>
        <p>{t.publicOfferingMissing}</p>
        <Link href={`/${locale}/browse`}>{t.publicBackToBrowse}</Link>
      </Card>
    );
  }
  if (!offering) {
    return <Skeleton lines={3} testId="offering-skeleton" />;
  }

  return (
    <article className="stack">
      <header className="stack stack--tight">
        <h1 className="page-title">{offering.assetName}</h1>
        <p className="page-subtitle">
          {t.publicClosesOn} {formatDate(offering.closesAt)}
        </p>
      </header>

      <Card title={t.publicTermsTitle}>
        <dl className="terms" data-testid="offering-terms">
          <div className="terms__row">
            <dt>{t.publicPricePerToken}</dt>
            <dd>{formatRial(offering.priceRial)}</dd>
          </div>
          <div className="terms__row">
            <dt>{t.publicSupply}</dt>
            <dd>{formatTokens(offering.supply)}</dd>
          </div>
          <div className="terms__row">
            <dt>{t.publicMinPerInvestor}</dt>
            <dd>{formatTokens(offering.minPerInvestor)}</dd>
          </div>
          <div className="terms__row">
            <dt>{t.publicMaxPerInvestor}</dt>
            <dd>{formatTokens(offering.maxPerInvestor)}</dd>
          </div>
          <div className="terms__row">
            <dt>{t.publicWindow}</dt>
            <dd>
              {formatDate(offering.opensAt)} – {formatDate(offering.closesAt)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <p className="risk-notice" data-testid="risk-notice">
          {t.publicRiskNotice}
        </p>
      </Card>

      <Card title={t.publicHowToInvest}>
        <p>{t.publicInvestGate}</p>
        <Link className="btn btn--primary" href={`/${locale}/portfolio`}>
          {t.publicSignInToInvest}
        </Link>
      </Card>
    </article>
  );
};
