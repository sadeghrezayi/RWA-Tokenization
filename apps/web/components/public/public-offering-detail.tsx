import Link from "next/link";
import type { PublicOfferingDto } from "../../lib/api";
import { formatDate, formatRial, formatTokens } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Card } from "../ui/primitives";

// 2.2: pure presentational, server-rendered. Shows ONLY the factual terms the
// API returns — per OD-21 there is no projected yield, expected return, or any
// other forward-looking figure on this page, and none may be added without an
// approved methodology.
//
// `undefined` = not publicly listed. Publicly the offering simply does not
// exist, so this reads as "not available" rather than hinting the id is real.
//
// The risk notice is deliberately generic and non-jurisdictional: real
// disclosure text is jurisdiction policy (OD-8, undecided) and REQUIRES LOCAL
// LEGAL VALIDATION. It is not invented here.
export const PublicOfferingDetail = ({
  locale,
  offering,
}: {
  locale: Locale;
  offering: PublicOfferingDto | undefined;
}) => {
  const t = dictionaries[locale];

  if (!offering) {
    return (
      <Card>
        <p>{t.publicOfferingMissing}</p>
        <Link href={`/${locale}/browse`}>{t.publicBackToBrowse}</Link>
      </Card>
    );
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
