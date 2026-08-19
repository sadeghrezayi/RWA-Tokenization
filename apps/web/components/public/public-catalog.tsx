import Link from "next/link";
import type { PublicOfferingDto } from "../../lib/api";
import { formatDate, formatRial } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Card, EmptyState } from "../ui/primitives";

// 2.2: pure presentational — the server page fetches, so a crawler receives real
// HTML rather than an empty shell it has to execute JS to fill.
//
// `undefined` means the catalog could not be read. That renders an error, NOT
// an empty state: telling a visitor the market is empty when we simply failed
// to load it would be a lie about the business.
export const PublicCatalog = ({
  locale,
  offerings,
}: {
  locale: Locale;
  offerings: PublicOfferingDto[] | undefined;
}) => {
  const t = dictionaries[locale];

  if (!offerings) {
    return (
      <Card>
        <p role="alert" className="field__error">
          {t.publicCatalogFailed}
        </p>
      </Card>
    );
  }
  if (offerings.length === 0) {
    return (
      <Card>
        <EmptyState icon="◈">{t.publicCatalogEmpty}</EmptyState>
      </Card>
    );
  }

  return (
    <ul className="offer-grid">
      {offerings.map((offering) => (
        <li key={offering.id}>
          <Link className="offer-card" href={`/${locale}/browse/${offering.id}`}>
            <span className="offer-card__name">{offering.assetName}</span>
            <span className="offer-card__price">{formatRial(offering.priceRial)}</span>
            <span className="offer-card__meta">
              {t.publicPerToken} · {t.publicClosesOn} {formatDate(offering.closesAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
};
