"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, IssuerMemberDto, IssuerOrganisationDto } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Dictionary, Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Field, SelectField, Skeleton, Stat } from "../ui/primitives";
import { IssuerDecisionCard } from "./issuer-decision-card";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type Role = IssuerMemberDto["role"];

const roleLabel = (t: Dictionary, role: Role): string =>
  role === "issuer_admin" ? t.issuerRoleAdmin : t.issuerRoleContributor;

// 3.2g: one issuer's own page — the organisation's legal identity, and the
// people who act for it.
//
// The team is the point. The platform's approval covers the ORGANISATION; every
// person acting for it must have completed individual verification separately
// (user decision, 2026-08-15). This screen is the first place a person can
// exercise that rule: an unverified invitee is refused by the server and the
// refusal is shown verbatim rather than swallowed.
export const IssuerDetailPage = ({
  locale,
  api,
  csrfToken,
  organisationId,
  onBack,
}: {
  locale: Locale;
  api: ApiClient;
  csrfToken: string;
  organisationId: string;
  onBack: () => void;
}) => {
  const t = dictionaries[locale];
  const [organisation, setOrganisation] = useState<IssuerOrganisationDto | undefined>(undefined);
  const [team, setTeam] = useState<IssuerMemberDto[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("issuer_contributor");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [record, members] = await Promise.all([
        api.issuer(organisationId),
        api.issuerTeam(organisationId),
      ]);
      setOrganisation(record);
      setTeam(members);
      setLoadError(undefined);
    } catch (error) {
      // A failed read must never look like an organisation with no people.
      setLoadError(messageOf(error));
    }
  }, [api, organisationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setActionError(undefined);
      await load();
    } catch (error) {
      // The server's own words — "has not completed individual verification",
      // "must keep at least one administrator" — are what the officer needs.
      setActionError(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    if (email.trim() === "") {
      setActionError(t.issuerInviteEmailRequired);
      return;
    }
    await run(async () => {
      await api.addIssuerMember(csrfToken, organisationId, email.trim(), role);
      setEmail("");
    });
  };

  if (loadError !== undefined) {
    return (
      <Card title={t.issuerOrganisationTitle}>
        <p className="field__error" role="alert">
          {loadError}
        </p>
      </Card>
    );
  }

  if (!organisation || !team) {
    return (
      <Card title={t.issuerOrganisationTitle}>
        <Skeleton lines={4} testId="issuer-detail-loading" />
      </Card>
    );
  }

  return (
    <div className="stack">
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        {t.issuerDetailBack}
      </Button>

      <Card title={organisation.legalName} subtitle={organisation.contactEmail}>
        <div className="stat-row">
          <Stat label={t.issuersRegistrationLabel} value={organisation.registrationNumber} />
          <Stat label={t.issuersAppliedLabel} value={formatDate(organisation.appliedAt)} />
          <Stat
            label={t.issuersStateLabel}
            value={organisation.canSubmitAssets ? t.issuersCanSubmit : organisation.state}
          />
        </div>
        {organisation.decidedBy !== undefined && (
          <p className="muted">
            {t.issuersDecidedBy} {organisation.decidedByLabel ?? organisation.decidedBy}
            {organisation.decidedAt !== undefined ? ` · ${formatDate(organisation.decidedAt)}` : ""}
          </p>
        )}
        {organisation.rejectionReason !== undefined && (
          <p className="muted">{organisation.rejectionReason}</p>
        )}
      </Card>

      {/* 4.3: the decision sits with the identity and the team it is about,
          instead of only in the queue row two screens away. */}
      <IssuerDecisionCard
        locale={locale}
        api={api}
        csrfToken={csrfToken}
        organisationId={organisation.id}
        state={organisation.state}
        onDecided={() => {
          void load();
        }}
      />

      <Card title={t.issuerTeamTitle} subtitle={t.issuerTeamSubtitle}>
        <div className="stack">
          {team.length === 0 ? (
            <EmptyState icon="◷">{t.issuerTeamEmpty}</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.issuerTeamMemberLabel}</th>
                    <th>{t.issuerTeamRoleLabel}</th>
                    <th>{t.issuerTeamAddedLabel}</th>
                    <th className="table__num">{t.actionsLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member) => (
                    <tr key={member.userId} data-testid={`member-${member.userId}`}>
                      {/* A person is their address. Only when it cannot be
                          resolved does the id stand in for them. */}
                      <td>{member.email ?? member.userId}</td>
                      <td>
                        <Badge tone={member.canManageTeam ? "info" : "neutral"}>
                          {roleLabel(t, member.role)}
                        </Badge>
                      </td>
                      <td>{formatDate(member.addedAt)}</td>
                      <td className="table__num">
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            void run(() =>
                              api.removeIssuerMember(csrfToken, organisationId, member.userId),
                            );
                          }}
                        >
                          {t.issuerRemoveButton}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="row row--bottom">
            <Field
              id="issuer-invite-email"
              label={t.issuerInviteEmailLabel}
              type="email"
              value={email}
              hint={t.issuerInviteEmailHint}
              disabled={busy}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <SelectField
              id="issuer-invite-role"
              label={t.issuerTeamRoleLabel}
              value={role}
              disabled={busy}
              onChange={(event) => {
                setRole(event.target.value as Role);
              }}
            >
              <option value="issuer_contributor">{t.issuerRoleContributor}</option>
              <option value="issuer_admin">{t.issuerRoleAdmin}</option>
            </SelectField>
            <Button
              type="button"
              loading={busy}
              onClick={() => {
                void invite();
              }}
            >
              {t.issuerInviteButton}
            </Button>
          </div>

          {actionError !== undefined && (
            <p className="field__error" role="alert">
              {actionError}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};
