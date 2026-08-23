"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, InvestorDetailDto, RelationshipStageDto } from "../lib/api";
import { formatDate, formatDateTime, formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { OnboardingReviewCard } from "./admin/onboarding-review-card";
import { ScreeningCard } from "./admin/screening-card";
import { RiskCard } from "./admin/risk-card";
import { InvestorCashCard } from "./admin/investor-cash-card";
import { INVESTOR_360_TABS } from "./admin/investor-360-tabs";
import type { Investor360TabId } from "./admin/investor-360-tabs";
import { Address } from "./ui/address";
import { Badge } from "./ui/badge";
import { Button, Card, EmptyState, Field, SelectField, Stat } from "./ui/primitives";
import { kycStatus, offeringStatus } from "./ui/status";
import { useToast } from "./ui/toast";

const STAGES: RelationshipStageDto[] = ["lead", "contacted", "onboarding", "active", "dormant"];

// FR-PT-3 + CRM/sales (user-approved scope 2026-07-20), tabbed for 4.3: one
// person's whole file — identity and compliance, investments, portfolio, cash,
// transfers and the relationship record — organised so an officer can reach the
// part they came for instead of scrolling past everything else.
//
// Which tabs exist, and which are deliberately absent, is in investor-360-tabs.ts.
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
  // Overview first: the page still has to answer "who is this" before anything
  // else, and a remembered tab would open someone else's file on a stranger's
  // cash movements.
  const [activeTab, setActiveTab] = useState<Investor360TabId>("overview");
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
            {/* Only for an approved investor: reissuing asserts on chain that
                a decision was made, so it must never be offered where none
                was. The API refuses it too — this keeps the screen honest. */}
            {detail.investor.kycState === "approved" && (
              <Button
                variant="ghost"
                size="sm"
                title={t.reissueClaimHint}
                onClick={() => {
                  guard(() => api.reissueKycClaim(token, investorId), t.reissueClaimDone);
                }}
              >
                {t.reissueClaimButton}
              </Button>
            )}
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

      {/* 4.3 Investor 360. The header and figures above stay put on every
          tab — an officer acting on the wrong person's file is the failure
          this layout has to prevent. */}
      <div className="tabs" role="tablist" aria-label={t.investorTabsLabel}>
        {INVESTOR_360_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`investor-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`investor-panel-${tab.id}`}
            className={activeTab === tab.id ? "tab tab--active" : "tab"}
            onClick={() => {
              setActiveTab(tab.id);
            }}
          >
            {tab.label(t)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div
          role="tabpanel"
          id={`investor-panel-overview`}
          aria-labelledby="investor-tab-overview"
          className="stack"
        >
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
                        api.setInvestorStage(
                          token,
                          investorId,
                          e.target.value as RelationshipStageDto,
                        ),
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
        </div>
      )}

      {activeTab === "compliance" && (
        <div
          role="tabpanel"
          id={`investor-panel-compliance`}
          aria-labelledby="investor-tab-compliance"
          className="stack"
        >
          {/* 2.3f: the verification file is what an officer opens this page to
          read before deciding, so it leads the compliance tab. */}
          <OnboardingReviewCard
            locale={locale}
            api={api}
            csrfToken={token}
            investorId={investorId}
          />
          {/* Beside the identity evidence, because a reviewer weighs them together
          — and because a screening nobody can see is not a control. */}
          <ScreeningCard locale={locale} api={api} token={token} investorId={investorId} />
          {/* Under the screening it partly rests on: the officer records what
          screening returned as one of the risk factors. */}
          <RiskCard locale={locale} api={api} token={token} investorId={investorId} />
        </div>
      )}

      {activeTab === "investments" && (
        <div
          role="tabpanel"
          id={`investor-panel-investments`}
          aria-labelledby="investor-tab-investments"
          className="stack"
        >
          <Card title={t.salesSectionLabel}>
            <div className="stack">
              <p className="stat__label">{t.subscriptionsLabel}</p>
              {detail.sales.subscriptions.length === 0 ? (
                <EmptyState icon="◇">{t.noActivity}</EmptyState>
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
            </div>
          </Card>
        </div>
      )}

      {activeTab === "portfolio" && (
        <div
          role="tabpanel"
          id={`investor-panel-portfolio`}
          aria-labelledby="investor-tab-portfolio"
          className="stack"
        >
          <Card title={t.portfolioLabel}>
            <div className="stack">
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
        </div>
      )}

      {activeTab === "cash" && (
        <div
          role="tabpanel"
          id={`investor-panel-cash`}
          aria-labelledby="investor-tab-cash"
          className="stack"
        >
          <InvestorCashCard locale={locale} api={api} token={token} investorId={investorId} />
        </div>
      )}

      {activeTab === "transfers" && (
        <div
          role="tabpanel"
          id={`investor-panel-transfers`}
          aria-labelledby="investor-tab-transfers"
          className="stack"
        >
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
        </div>
      )}

      {activeTab === "communications" && (
        <div
          role="tabpanel"
          id={`investor-panel-communications`}
          aria-labelledby="investor-tab-communications"
          className="stack"
        >
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
                            guard(
                              () => api.completeFollowUp(token, followUp.id),
                              t.followUpCompleted,
                            );
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
                        guard(
                          () => api.addInvestorNote(token, investorId, text).then(),
                          t.noteAdded,
                        );
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
        </div>
      )}

      {error !== undefined && (
        <p className="field__error" role="alert" data-testid="investor-detail-error">
          {error}
        </p>
      )}
    </div>
  );
};
