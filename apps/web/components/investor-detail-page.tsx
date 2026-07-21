"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorDetailDto, RelationshipStageDto } from "../lib/api";
import { formatDate, formatDateTime, formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import { Button, Card, EmptyState, Field, SelectField, Stat } from "./ui/primitives";
import { kycStatus, offeringStatus } from "./ui/status";
import { useToast } from "./ui/toast";

const STAGES: RelationshipStageDto[] = ["lead", "contacted", "onboarding", "active", "dormant"];

// FR-PT-3 + CRM/sales (user-approved scope 2026-07-20): the full-page investor
// file — identity, relationship management, sales, portfolio, and a merged
// activity timeline. Replaces the cramped popup.
export const InvestorDetailPage = ({
  locale,
  api,
  token,
  investorId,
  onBack,
}: {
  locale: Locale;
  api: ApiClient;
  token: string;
  investorId: string;
  onBack: () => void;
}) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [detail, setDetail] = useState<InvestorDetailDto | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [newTag, setNewTag] = useState("");
  const [note, setNote] = useState("");
  const [followUpText, setFollowUpText] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");

  const refresh = useCallback(async () => {
    setDetail(await api.investorDetail(token, investorId));
  }, [api, token, investorId]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof ApiError ? e.message : t.authFailed);
    });
  }, [refresh, t.authFailed]);

  const guard = (action: () => Promise<void>, successMsg: string) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
        toast.show(successMsg, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  if (detail === undefined) {
    return (
      <div className="stack">
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t.backToInvestors}
        </Button>
        {error !== undefined && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const kyc = kycStatus(detail.investor.kycState);

  return (
    <div className="stack">
      <Button variant="ghost" size="sm" onClick={onBack}>
        {t.backToInvestors}
      </Button>

      <div className="row row--between">
        <div>
          <h1 className="page-title">{detail.investor.email}</h1>
          <div className="row" style={{ marginTop: "var(--space-2)" }}>
            <Badge tone={kyc.tone}>{kyc.label}</Badge>
            {detail.crm.tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => {
                    guard(() => api.removeInvestorTag(token, investorId, tag), t.tagAdded);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="stat-row">
        <Stat label={t.balanceLabel} value={formatRial(detail.ledger.balanceRial)} />
        <Stat label={t.heldLabel} value={formatRial(detail.ledger.heldRial)} />
        <Stat label={t.investedLabel} value={formatRial(detail.sales.totalInvestedRial)} />
        <Stat
          label={t.portfolioValueLabel}
          value={formatRial(detail.sales.portfolioValueRial)}
          hint={detail.sales.portfolioValueFresh ? t.freshValueLabel : t.staleValueLabel}
        />
      </div>

      <Card title={t.relationshipSectionLabel}>
        <div className="stack">
          <div style={{ maxWidth: "20rem" }}>
            <SelectField
              id="investor-stage"
              label={t.stageLabel}
              value={detail.crm.stage}
              onChange={(e) => {
                guard(
                  () =>
                    api.setInvestorStage(token, investorId, e.target.value as RelationshipStageDto),
                  t.stageUpdated,
                );
              }}
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {t.stages[stage]}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="row row--bottom">
            <div style={{ maxWidth: "16rem", flex: 1 }}>
              <Field
                id="investor-new-tag"
                label={t.addTagLabel}
                value={newTag}
                onChange={(e) => {
                  setNewTag(e.target.value);
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (newTag.trim() !== "") {
                  const tag = newTag.trim();
                  setNewTag("");
                  guard(() => api.addInvestorTag(token, investorId, tag), t.tagAdded);
                }
              }}
            >
              {t.addTagButton}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={t.salesSectionLabel}>
        <div className="stack">
          <p className="stat__label">{t.subscriptionsLabel}</p>
          {detail.sales.subscriptions.length === 0 ? (
            <EmptyState icon="₪">{t.noActivity}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.assetLabel}</th>
                    <th>{t.statusLabel}</th>
                    <th className="table__num">{t.subscribeTokensLabel}</th>
                    <th className="table__num">{t.investedLabel}</th>
                    <th>{t.whenLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.sales.subscriptions.map((sub) => {
                    const badge = offeringStatus(sub.state);
                    return (
                      <tr key={sub.offeringId}>
                        <td>{sub.assetName}</td>
                        <td>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </td>
                        <td className="table__num num">
                          {formatTokens(sub.allocated !== "0" ? sub.allocated : sub.requested)}
                        </td>
                        <td className="table__num num">{formatRial(sub.costRial)}</td>
                        <td className="text-sm">{formatDate(sub.closesAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="stat__label" style={{ marginTop: "var(--space-3)" }}>
            {t.portfolioLabel}
          </p>
          {detail.sales.holdings.length === 0 ? (
            <p className="muted text-sm">{t.noActivity}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.assetLabel}</th>
                    <th className="table__num">{t.tokensLabel}</th>
                    <th className="table__num">{t.portfolioValueLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.sales.holdings.map((holding) => (
                    <tr key={holding.assetId}>
                      <td>{holding.assetName}</td>
                      <td className="table__num num">{formatTokens(holding.tokens)}</td>
                      <td className="table__num num">
                        {holding.valueRial !== undefined ? formatRial(holding.valueRial) : "—"}
                        {!holding.valuationFresh && (
                          <Badge tone="warning">{t.staleValueLabel}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card title={t.followUpsSectionLabel}>
        <div className="stack">
          {detail.crm.followUps.length === 0 ? (
            <EmptyState icon="◷">{t.noFollowUps}</EmptyState>
          ) : (
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              {detail.crm.followUps.map((followUp) => (
                <div
                  key={followUp.id}
                  className="row row--between"
                  data-testid={`fu-${followUp.id}`}
                >
                  <span className="row">
                    {followUp.overdue && <Badge tone="danger">{t.overdueLabel}</Badge>}
                    <span>{followUp.text}</span>
                    <span className="muted text-sm">
                      {t.dueLabel}: {formatDate(followUp.dueAt)}
                    </span>
                  </span>
                  {followUp.state === "open" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        guard(() => api.completeFollowUp(token, followUp.id), t.followUpCompleted);
                      }}
                    >
                      {t.completeButton}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="row row--bottom">
            <div style={{ flex: 1 }}>
              <Field
                id="follow-up-text"
                label={t.followUpTextLabel}
                value={followUpText}
                onChange={(e) => {
                  setFollowUpText(e.target.value);
                }}
              />
            </div>
            <Field
              id="follow-up-due"
              label={t.followUpDueLabel}
              type="date"
              value={followUpDue}
              onChange={(e) => {
                setFollowUpDue(e.target.value);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (followUpText.trim() !== "" && followUpDue !== "") {
                  const body = {
                    text: followUpText.trim(),
                    dueAt: new Date(followUpDue).toISOString(),
                  };
                  setFollowUpText("");
                  setFollowUpDue("");
                  guard(
                    () => api.createFollowUp(token, investorId, body).then(),
                    t.followUpCreated,
                  );
                }
              }}
            >
              {t.addFollowUpButton}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={t.timelineSectionLabel}>
        <div className="stack">
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <label className="field__label" htmlFor="crm-note">
              {t.addNoteLabel}
            </label>
            <textarea
              id="crm-note"
              className="field__input"
              rows={2}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
            <div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (note.trim() !== "") {
                    const text = note.trim();
                    setNote("");
                    guard(() => api.addInvestorNote(token, investorId, text).then(), t.noteAdded);
                  }
                }}
              >
                {t.addNoteButton}
              </Button>
            </div>
          </div>

          {detail.timeline.length === 0 ? (
            <EmptyState icon="≡">{t.noNotes}</EmptyState>
          ) : (
            <ul className="timeline">
              {detail.timeline.map((item, i) => (
                <li key={`${item.at}-${String(i)}`} className="timeline__item">
                  <Badge tone={item.kind === "note" ? "info" : "neutral"}>
                    {item.kind === "note" ? "note" : item.text}
                  </Badge>
                  {item.kind === "note" && <span>{item.text}</span>}
                  <span className="muted text-sm">
                    {item.actor === detail.investor.id ? detail.investor.email : item.actor}
                  </span>
                  <span className="muted text-sm">{formatDateTime(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid-2">
        <Card title={t.transfersLabel}>
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
        </Card>

        <Card title={t.redemptionsLabel}>
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
                    <span className="num">{formatRial(redemption.payoutRial)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={t.chainSectionLabel}>
        <div className="row text-sm">
          <span>
            {t.identityAddressLabel}: <Address value={detail.chain.identityAddress} />
          </span>
          <span>
            {t.walletLabel}: <Address value={detail.chain.walletAddress} />
          </span>
        </div>
      </Card>

      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
