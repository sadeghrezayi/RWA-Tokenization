"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiClient, PublicOfferingDto } from "../../lib/api";
import { formatDate, formatRial } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Card, EmptyState, Skeleton } from "../ui/primitives";

// 2.1b (OD-5): the anonymous browse page. Every offering shown here was
// deliberately published by an operator — the API is the gate, this just renders
// what it returns.
export const PublicCatalog = ({ locale, api }: { locale: Locale; api: ApiClient }) => {
  const t = dictionaries[locale];
  const [offerings, setOfferings] = useState<PublicOfferingDto[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .publicOfferings()
      .then((list) => {
        if (active) setOfferings(list);
      })
      .catch(() => {
        // "Nothing on offer" would be a lie when the catalog simply failed to
        // load — a visitor must not be told the market is empty.
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  if (failed) {
    return (
      <Card>
        <p role="alert" className="form-error">
          {t.publicCatalogFailed}
        </p>
      </Card>
    );
  }
  if (!offerings) {
    return <Skeleton lines={3} testId="catalog-skeleton" />;
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
