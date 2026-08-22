"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient, RiskAssessmentDto, RiskModelDto } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { dictionaries } from "../../lib/i18n";
import type { Locale } from "../../lib/i18n";
import { Badge } from "../ui/badge";
import { Button, Card, EmptyState, Skeleton } from "../ui/primitives";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const TONE = { low: "success", medium: "warning", high: "danger" } as const;

// 4.2: what a person concluded about an applicant, and the two things that must
// never be separated from it — that the model is PROVISIONAL and not legally
// validated, and that the band decides nothing on its own.
//
// The factors are rendered from the model the SERVER publishes, never a list
// hard-coded here: the server scores what it publishes, so a copy in the web
// app could only drift from the thing everyone is actually rated against.
export const RiskCard = ({
  locale,
  investorId,
  token,
  api,
}: {
  locale: Locale;
  investorId: string;
  token: string;
  api: ApiClient;
}) => {
  const t = dictionaries[locale];
  const [model, setModel] = useState<RiskModelDto | undefined>(undefined);
  const [rows, setRows] = useState<RiskAssessmentDto[] | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setRows(await api.investorRiskAssessments(token, investorId));
  }, [api, token, investorId]);

  useEffect(() => {
    void (async () => {
      try {
        const published = await api.riskModel(token);
        setModel(published);
        // Start from the model's first option for each factor, so what the
        // officer SEES selected is what would be submitted — a blank select
        // that silently submits its first entry is a lie about what was said.
        const initial: Record<string, string> = {};
        for (const factor of published.factors) {
          const first = factor.options[0];
          if (first !== undefined) initial[factor.id] = first.value;
        }
        setAnswers(initial);
        await refresh();
      } catch (cause: unknown) {
        setError(messageOf(cause));
      }
    })();
  }, [api, token, refresh]);

  const record = () => {
    setError(undefined);
    void (async () => {
      try {
        await api.assessRisk(token, investorId, answers);
        await refresh();
      } catch (cause: unknown) {
        // The server names the factor that is missing; repeating its words
        // beats a generic failure the officer cannot act on.
        setError(messageOf(cause));
      }
    })();
  };

  const bandLabel = (band: RiskAssessmentDto["band"]): string =>
    band === "high" ? t.riskBandHigh : band === "medium" ? t.riskBandMedium : t.riskBandLow;

  return (
    <Card title={t.riskTitle}>
      {error !== undefined && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {model === undefined ? (
        <Skeleton lines={3} />
      ) : (
        <div className="stack">
          {/* Read before anything else on this card: the weights below were not
              derived from any regulation. */}
          <p className="field__error" data-testid="risk-model-notice">
            {model.notice}
          </p>
          {model.factors.map((factor) => (
            <label key={factor.id} className="field">
              <span className="field__label">{factor.label}</span>
              <select
                className="field__input"
                data-testid={`risk-factor-${factor.id}`}
                value={answers[factor.id] ?? ""}
                onChange={(event) => {
                  setAnswers((current) => ({ ...current, [factor.id]: event.target.value }));
                }}
              >
                {factor.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field__hint">{factor.help}</span>
            </label>
          ))}
          <Button type="button" size="sm" onClick={record} data-testid="risk-submit">
            {t.riskSubmitButton}
          </Button>
        </div>
      )}

      {rows === undefined ? (
        <Skeleton lines={2} />
      ) : rows.length === 0 ? (
        <EmptyState icon="◔">
          {/* Deliberately NOT "low": an unrated file is unrated. */}
          <span data-testid="no-risk-assessment">{t.riskNone}</span>
        </EmptyState>
      ) : (
        <div className="stack">
          {rows.map((row, index) => (
            <div key={`${row.assessedAt}-${String(index)}`} data-testid={`risk-${String(index)}`}>
              <div className="row">
                <Badge tone={TONE[row.band]}>{bandLabel(row.band)}</Badge>
                <span className="text-sm muted">
                  {t.riskScoreLabel} {row.score}
                </span>
                <span className="text-sm muted">
                  {t.riskAssessedByLabel} {row.assessedBy} · {formatDateTime(row.assessedAt)}
                </span>
              </div>
              <p className="field__hint" data-testid={`risk-advisory-${String(index)}`}>
                {row.advisory}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
