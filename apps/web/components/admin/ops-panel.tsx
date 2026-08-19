"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ApiClient, WorkQueueDto, WorkQueueKeyDto, WorkQueueSectionDto } from "../../lib/api";
import { dictionaries } from "../../lib/i18n";
import type { Dictionary, Locale } from "../../lib/i18n";
import { Card, EmptyState, Skeleton } from "../ui/primitives";

// Where each queue is actually worked. The dashboard triages; the section pages
// act — a count with nowhere to go would just be decoration.
const QUEUE_ROUTES: Record<WorkQueueKeyDto, string> = {
  kyc: "kyc",
  approvals: "approvals",
  redemptions: "redemptions",
};

const queueLabel = (t: Dictionary, key: WorkQueueKeyDto): string =>
  ({
    kyc: t.opsQueueKyc,
    approvals: t.opsQueueApprovals,
    redemptions: t.opsQueueRedemptions,
  })[key];

// Whole days a request has been waiting. Deliberately coarse: an operator cares
// that something has sat for three days, not for three days and four hours.
const daysWaiting = (since: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000));

// 1.8: the ops work queue — one screen answering "what needs a human right
// now?", ordered longest-wait-first.
export const OpsPanel = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [queue, setQueue] = useState<WorkQueueDto | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api
      .getWorkQueue(token)
      .then((view) => {
        setQueue(view);
        setFailed(false);
      })
      .catch(() => {
        // Never render "all clear" for a queue we could not read — that would
        // tell an operator there is no work when we simply do not know.
        setFailed(true);
      });
  }, [api, token]);

  useEffect(load, [load]);

  if (failed) {
    return (
      <section className="stack">
        <h1 className="page-title">{t.opsTitle}</h1>
        <Card>
          <p role="alert" className="field__error">
            {t.opsLoadFailed}
          </p>
        </Card>
      </section>
    );
  }

  if (!queue) {
    return (
      <section className="stack">
        <h1 className="page-title">{t.opsTitle}</h1>
        <Skeleton lines={4} testId="ops-skeleton" />
      </section>
    );
  }

  const base = `/${locale}/admin`;

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <h1 className="page-title">{t.opsTitle}</h1>
        <p className="page-subtitle">{t.opsSubtitle}</p>
      </header>

      <div className="queue-cards">
        {queue.sections.map((section) => (
          <div
            key={section.key}
            data-testid={`queue-card-${section.key}`}
            className={section.total > 0 ? "queue-card queue-card--attention" : "queue-card"}
          >
            <span className="queue-card__label">{queueLabel(t, section.key)}</span>
            <span className="queue-card__count">{section.total}</span>
            <Link className="queue-card__link" href={`${base}/${QUEUE_ROUTES[section.key]}`}>
              {t.opsOpenQueue}
            </Link>
          </div>
        ))}
      </div>

      {queue.totalOutstanding === 0 ? (
        <Card>
          <EmptyState icon="◎">{t.opsAllClear}</EmptyState>
        </Card>
      ) : (
        queue.sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <QueueSection key={section.key} section={section} t={t} locale={locale} />
          ))
      )}
    </section>
  );
};

const QueueSection = ({
  section,
  t,
  locale,
}: {
  section: WorkQueueSectionDto;
  t: Dictionary;
  locale: Locale;
}) => (
  <Card title={`${queueLabel(t, section.key)} (${String(section.total)})`}>
    <ul className="queue-list">
      {section.items.map((item) => (
        <li key={item.id} className="queue-list__item">
          <span className="queue-list__label">{item.label}</span>
          {item.waitingSince === undefined ? null : (
            <time className="queue-list__age" dateTime={item.waitingSince}>
              {t.opsWaitingSince} {new Date(item.waitingSince).toLocaleDateString(locale)} (
              {String(daysWaiting(item.waitingSince))}d)
            </time>
          )}
        </li>
      ))}
    </ul>
  </Card>
);
