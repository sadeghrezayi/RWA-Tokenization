"use client";

import { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorDetailDto, InvestorDirectoryEntryDto } from "../lib/api";
import { formatDate, formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState } from "./ui/primitives";
import { kycStatus } from "./ui/status";

// FR-PT-3 user management: every investor at a glance (identity, KYC,
// settlement balance), with a drill-down of one person's full footprint —
// chain identity, portfolio, transfers, redemptions. People first (P2);
// addresses are copyable chips, never the label.
export const InvestorsPanel = ({
  locale,
  api,
  token,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
}) => {
  const t = dictionaries[locale];
  const [investors, setInvestors] = useState<InvestorDirectoryEntryDto[]>([]);
  const [detail, setDetail] = useState<InvestorDetailDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    api
      .listInvestors(token)
      .then(setInvestors)
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      });
  }, [api, token, t.authFailed]);

  const openDetail = (investorId: string) => {
    setError(undefined);
    api
      .investorDetail(token, investorId)
      .then(setDetail)
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      });
  };

  return (
    <Card title={t.investorsTitle}>
      {investors.length === 0 ? (
        <EmptyState icon="◎">{t.noInvestors}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.emailLabel}</th>
                <th>{t.statusLabel}</th>
                <th className="table__num">{t.balanceLabel}</th>
                <th className="table__num">{t.heldLabel}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {investors.map((investor) => {
                const badge = kycStatus(investor.kycState);
                return (
                  <tr key={investor.id} data-testid={`investor-${investor.id}`}>
                    <td>
                      <strong>{investor.email}</strong>
                    </td>
                    <td>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className="table__num num">{formatRial(investor.balanceRial)}</td>
                    <td className="table__num num">{formatRial(investor.heldRial)}</td>
                    <td className="table__num">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          openDetail(investor.id);
                        }}
                      >
                        {t.detailsButton}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      <InvestorDetailModal
        detail={detail}
        locale={locale}
        onClose={() => {
          setDetail(undefined);
        }}
      />
    </Card>
  );
};

const InvestorDetailModal = ({
  detail,
  locale,
  onClose,
}: {
  detail: InvestorDetailDto | undefined;
  locale: Locale;
  onClose: () => void;
}) => {
  const t = dictionaries[locale];
  if (detail === undefined) {
    return null;
  }
  const badge = kycStatus(detail.investor.kycState);

  return (
    <Modal open title={detail.investor.email} onClose={onClose}>
      <div className="stack" style={{ gap: "var(--space-4)" }}>
        <div className="row">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {detail.investor.kycRejectionReason !== undefined && (
            <span className="muted text-sm">{detail.investor.kycRejectionReason}</span>
          )}
        </div>

        <section>
          <p className="stat__label">{t.ledgerSectionLabel}</p>
          <div className="row text-sm">
            <span>
              {t.balanceLabel}: <span className="num">{formatRial(detail.ledger.balanceRial)}</span>
            </span>
            <span>
              {t.heldLabel}: <span className="num">{formatRial(detail.ledger.heldRial)}</span>
            </span>
          </div>
        </section>

        <section>
          <p className="stat__label">{t.chainSectionLabel}</p>
          <div className="row text-sm">
            <span>
              {t.identityAddressLabel}: <Address value={detail.chain.identityAddress} />
            </span>
            <span>
              {t.walletLabel}: <Address value={detail.chain.walletAddress} />
            </span>
          </div>
        </section>

        <section>
          <p className="stat__label">{t.portfolioLabel}</p>
          {detail.holdings.length === 0 ? (
            <p className="muted text-sm">{t.noActivity}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.assetLabel}</th>
                    <th className="table__num">{t.tokensLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.holdings.map((holding) => (
                    <tr key={holding.assetId}>
                      <td>{holding.assetName}</td>
                      <td className="table__num num">{formatTokens(holding.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <p className="stat__label">{t.transfersLabel}</p>
          {detail.transfers.length === 0 ? (
            <p className="muted text-sm">{t.noActivity}</p>
          ) : (
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              {detail.transfers.map((transfer) => (
                <div key={transfer.id} className="row text-sm">
                  <Badge tone={transfer.direction === "sent" ? "warning" : "success"}>
                    {transfer.direction === "sent" ? t.sentLabel : t.receivedLabel}
                  </Badge>
                  <span>{transfer.counterparty}</span>
                  <span className="muted">{transfer.assetName}</span>
                  <span className="num">{formatTokens(transfer.tokens)}</span>
                  <span className="muted">{formatDate(transfer.at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <p className="stat__label">{t.redemptionsLabel}</p>
          {detail.redemptions.length === 0 ? (
            <p className="muted text-sm">{t.noActivity}</p>
          ) : (
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              {detail.redemptions.map((redemption) => (
                <div key={redemption.id} className="row text-sm">
                  <Badge
                    tone={
                      redemption.state === "fulfilled"
                        ? "success"
                        : redemption.state === "rejected"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {redemption.state}
                  </Badge>
                  <span className="muted">{redemption.assetName}</span>
                  <span className="num">{formatTokens(redemption.tokens)}</span>
                  {redemption.payoutRial !== undefined && (
                    <span className="num">
                      {t.payoutLabel}: {formatRial(redemption.payoutRial)}
                    </span>
                  )}
                  {redemption.rejectionReason !== undefined && (
                    <span className="muted">{redemption.rejectionReason}</span>
                  )}
                  <span className="muted">{formatDate(redemption.requestedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};
