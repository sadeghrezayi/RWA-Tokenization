"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto, DistributionViewDto } from "../lib/api";
import { formatRial } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field, SelectField } from "./ui/primitives";
import { distributionStatus } from "./ui/status";
import { useToast } from "./ui/toast";

export interface DistributionsPanelProps {
  locale: Locale;
  api: ApiClient;
  token: string;
  onOpenDistribution?: (distributionId: string) => void;
}

// FR-YD (FR-PT-3 subset): operator declares an income distribution for a
// tokenized asset, reviews the pro-rata reconciliation, then pays it out.
// Each row opens the distribution's own page (full payout breakdown).
export const DistributionsPanel = ({
  locale,
  api,
  token,
  onOpenDistribution,
}: DistributionsPanelProps) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [distributions, setDistributions] = useState<DistributionViewDto[]>([]);
  const [assets, setAssets] = useState<AssetViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [declaring, setDeclaring] = useState(false);

  const refresh = useCallback(async () => {
    const [list, assetList] = await Promise.all([
      api.listDistributions(token),
      api.listAssets(token),
    ]);
    setDistributions(list);
    setAssets(assetList);
  }, [api, token]);

  useEffect(() => {
    refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [refresh]);

  const guard = (action: () => Promise<void>, successMsg?: string) => {
    setError(undefined);
    void (async () => {
      try {
        await action();
        await refresh();
        if (successMsg) toast.show(successMsg, "success");
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t.authFailed);
      }
    })();
  };

  return (
    <Card
      title={t.distributionsTitle}
      actions={
        <Button
          type="button"
          onClick={() => {
            setDeclaring(true);
          }}
        >
          {t.declareDistributionButton}
        </Button>
      }
    >
      {distributions.length === 0 ? (
        <EmptyState icon="◇">{t.noDistributions}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.assetLabel}</th>
                <th>{t.statusLabel}</th>
                <th className="table__num">{t.amountLabel}</th>
                <th>{t.reconciliationLabel}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {distributions.map((distribution) => {
                const status = distributionStatus(distribution.state);
                const r = distribution.reconciliation;
                return (
                  <tr key={distribution.id} data-testid={`distribution-${distribution.id}`}>
                    <td>
                      {onOpenDistribution !== undefined ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => {
                            onOpenDistribution(distribution.id);
                          }}
                        >
                          {distribution.assetName}
                        </button>
                      ) : (
                        distribution.assetName
                      )}
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="num">{formatRial(distribution.totalAmountRial)}</td>
                    <td className="text-sm">
                      {formatRial(r.allocated)} / {formatRial(r.declared)}{" "}
                      {r.balanced && <Badge tone="success">{t.balancedLabel}</Badge>}
                    </td>
                    <td>
                      <div className="table__actions">
                        {distribution.state === "declared" && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              guard(
                                () => api.payDistribution(token, distribution.id),
                                t.distributionPaid,
                              );
                            }}
                          >
                            {t.payDistributionButton}
                          </Button>
                        )}
                      </div>
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

      <DeclareModal
        open={declaring}
        locale={locale}
        assets={assets.filter((a) => a.state === "tokenized")}
        onClose={() => {
          setDeclaring(false);
        }}
        onDeclare={(assetId, amount) => {
          setDeclaring(false);
          guard(async () => {
            await api.declareDistribution(token, assetId, amount);
          }, t.distributionDeclared);
        }}
      />
    </Card>
  );
};

const DeclareModal = ({
  open,
  locale,
  assets,
  onClose,
  onDeclare,
}: {
  open: boolean;
  locale: Locale;
  assets: AssetViewDto[];
  onClose: () => void;
  onDeclare: (assetId: string, amount: string) => void;
}) => {
  const t = dictionaries[locale];
  const [assetId, setAssetId] = useState("");
  const [amount, setAmount] = useState("");
  const effectiveAsset = assetId || (assets[0]?.id ?? "");

  return (
    <Modal
      open={open}
      title={t.declareDistributionButton}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={effectiveAsset === ""}
            onClick={() => {
              if (amount.trim() !== "") {
                onDeclare(effectiveAsset, amount.trim());
                setAmount("");
              }
            }}
          >
            {t.declareDistributionButton}
          </Button>
        </>
      }
    >
      {assets.length === 0 ? (
        <p className="muted">{t.noTokenizedAssets}</p>
      ) : (
        <>
          <SelectField
            id="declare-asset"
            label={t.assetLabel}
            value={effectiveAsset}
            onChange={(e) => {
              setAssetId(e.target.value);
            }}
          >
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <Field
            id="declare-amount"
            label={`${t.amountLabel} (﷼)`}
            type="number"
            hint="Total income to distribute pro-rata to holders."
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
          />
        </>
      )}
    </Modal>
  );
};
