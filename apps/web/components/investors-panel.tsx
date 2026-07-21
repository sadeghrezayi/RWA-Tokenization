"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorDirectoryDto, OpenFollowUpDto } from "../lib/api";
import { formatDate, formatRial } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Button, Card, EmptyState, Stat } from "./ui/primitives";
import { kycStatus, stageStatus } from "./ui/status";
import { useToast } from "./ui/toast";

// FR-PT-3 + CRM/sales (user-approved scope 2026-07-20): the investor directory
// with relationship stage, tags, invested and portfolio value at a glance, a
// totals strip, and the open follow-up queue. Each row opens the full page.
export const InvestorsPanel = ({
  locale,
  api,
  token,
  onOpenInvestor,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
  onOpenInvestor: (investorId: string) => void;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [directory, setDirectory] = useState<InvestorDirectoryDto | undefined>(undefined);
  const [followUps, setFollowUps] = useState<OpenFollowUpDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [dir, queue] = await Promise.all([api.listInvestors(token), api.openFollowUps(token)]);
    setDirectory(dir);
    setFollowUps(queue);
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    });
  }, [refresh, t.authFailed]);

  const complete = (followUpId: string) => {
    setError(undefined);
    void (async () => {
      try {
        await api.completeFollowUp(token, followUpId);
        await refresh();
        toast.show(t.followUpCompleted, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  return (
    <div className="stack">
      {followUps.length > 0 && (
        <Card title={t.followUpQueueTitle}>
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            {followUps.map((followUp) => (
              <div key={followUp.id} className="row row--between">
                <span className="row">
                  {followUp.overdue && <Badge tone="danger">{t.overdueLabel}</Badge>}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onOpenInvestor(followUp.investorId);
                    }}
                  >
                    {followUp.email}
                  </button>
                  <span>{followUp.text}</span>
                  <span className="muted text-sm">
                    {t.dueLabel}: {formatDate(followUp.dueAt)}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    complete(followUp.id);
                  }}
                >
                  {t.completeButton}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={t.investorsTitle}>
        {directory === undefined || directory.investors.length === 0 ? (
          <EmptyState icon="◎">{t.noInvestors}</EmptyState>
        ) : (
          <div className="stack">
            <div className="stat-row">
              <Stat label={t.investorsSummaryLabel} value={directory.summary.investorCount} />
              <Stat label={t.balanceLabel} value={formatRial(directory.summary.totalBalanceRial)} />
              <Stat
                label={t.investedLabel}
                value={formatRial(directory.summary.totalInvestedRial)}
              />
              <Stat
                label={t.portfolioValueLabel}
                value={formatRial(directory.summary.totalPortfolioValueRial)}
              />
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.emailLabel}</th>
                    <th>{t.statusLabel}</th>
                    <th>{t.stageLabel}</th>
                    <th>{t.tagsLabel}</th>
                    <th className="table__num">{t.balanceLabel}</th>
                    <th className="table__num">{t.investedLabel}</th>
                    <th className="table__num">{t.portfolioValueLabel}</th>
                    <th className="table__num">{t.actionsLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.investors.map((investor) => {
                    const kyc = kycStatus(investor.kycState);
                    const stage = stageStatus(investor.stage);
                    return (
                      <tr key={investor.id} data-testid={`investor-${investor.id}`}>
                        <td>
                          <strong>{investor.email}</strong>
                        </td>
                        <td>
                          <Badge tone={kyc.tone}>{kyc.label}</Badge>
                        </td>
                        <td>
                          <Badge tone={stage.tone}>{stage.label}</Badge>
                        </td>
                        <td>
                          <span className="row row--wrap">
                            {investor.tags.map((tag) => (
                              <span key={tag} className="tag-chip tag-chip--static">
                                {tag}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="table__num num">{formatRial(investor.balanceRial)}</td>
                        <td className="table__num num">{formatRial(investor.totalInvestedRial)}</td>
                        <td className="table__num num">
                          {formatRial(investor.portfolioValueRial)}
                        </td>
                        <td className="table__num">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              onOpenInvestor(investor.id);
                            }}
                          >
                            {t.openButton}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
};
