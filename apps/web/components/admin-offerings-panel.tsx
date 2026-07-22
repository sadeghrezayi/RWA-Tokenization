"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import type { ApiClient, AssetViewDto, OfferingViewDto } from "../lib/api";
import { formatRial, formatTokens } from "../lib/format";
import { dictionaries } from "../lib/i18n";
import type { Locale } from "../lib/i18n";
import { Progress } from "./ui/address";
import { Badge } from "./ui/badge";
import { Modal } from "./ui/modal";
import { Button, Card, EmptyState, Field, SelectField } from "./ui/primitives";
import { offeringStatus } from "./ui/status";
import { useToast } from "./ui/toast";

export interface AdminOfferingsPanelProps {
  locale: Locale;
  api: ApiClient;
  token: string;
  onOpenOffering?: (offeringId: string) => void;
}

// FR-PT-3 subset: operator credits the Rial ledger (simulated bank deposit),
// configures offerings against a tokenized asset, opens and closes them. Each
// row links to the offering's own page.
export const AdminOfferingsPanel = ({
  locale,
  api,
  token,
  onOpenOffering,
}: AdminOfferingsPanelProps) => {
  const t = dictionaries[locale];
  const toast = useToast();
  const [offerings, setOfferings] = useState<OfferingViewDto[]>([]);
  const [assets, setAssets] = useState<AssetViewDto[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [crediting, setCrediting] = useState(false);

  const refresh = useCallback(async () => {
    const [offeringList, assetList] = await Promise.all([
      api.listOfferings(token),
      api.listAssets(token),
    ]);
    setOfferings(offeringList);
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

  const tokenizedAssets = assets.filter((a) => a.state === "tokenized");

  return (
    <Card
      title={t.offeringsTitle}
      actions={
        <div className="row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setCrediting(true);
            }}
          >
            {t.creditLedgerButton}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
          >
            {t.createOfferingButton}
          </Button>
        </div>
      }
    >
      {offerings.length === 0 ? (
        <EmptyState icon="◇">{t.noOfferings}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t.assetLabel}</th>
                <th>{t.statusLabel}</th>
                <th>{t.priceLabel}</th>
                <th>{t.subscribedLabel}</th>
                <th className="table__num">{t.actionsLabel}</th>
              </tr>
            </thead>
            <tbody>
              {offerings.map((offering) => {
                const status = offeringStatus(offering.state);
                return (
                  <tr key={offering.id} data-testid={`admin-offering-${offering.id}`}>
                    <td>
                      {onOpenOffering !== undefined ? (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => {
                            onOpenOffering(offering.id);
                          }}
                        >
                          {offering.assetName}
                        </button>
                      ) : (
                        offering.assetName
                      )}
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="num">{formatRial(offering.priceRial)}</td>
                    <td style={{ minWidth: 140 }}>
                      <Progress
                        value={Number(offering.totalSubscribed)}
                        max={Number(offering.supply)}
                        label={`${formatTokens(offering.totalSubscribed)} / ${formatTokens(offering.supply)}`}
                      />
                    </td>
                    <td>
                      <div className="table__actions">
                        {offering.state === "draft" && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              guard(() => api.openOffering(token, offering.id), t.offeringOpened);
                            }}
                          >
                            {t.openOfferingButton}
                          </Button>
                        )}
                        {offering.state === "open" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              guard(async () => {
                                await api.closeOffering(token, offering.id);
                              }, t.offeringClosed);
                            }}
                          >
                            {t.closeOfferingButton}
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

      <CreateOfferingModal
        open={creating}
        locale={locale}
        assets={tokenizedAssets}
        onClose={() => {
          setCreating(false);
        }}
        onCreate={(body) => {
          setCreating(false);
          guard(async () => {
            await api.createOffering(token, body);
          }, t.offeringCreated);
        }}
      />
      <CreditModal
        open={crediting}
        locale={locale}
        onClose={() => {
          setCrediting(false);
        }}
        onCredit={(investorId, amount) => {
          setCrediting(false);
          guard(() => api.creditLedger(token, investorId, amount), t.ledgerCredited);
        }}
      />
    </Card>
  );
};

const CreateOfferingModal = ({
  open,
  locale,
  assets,
  onClose,
  onCreate,
}: {
  open: boolean;
  locale: Locale;
  assets: AssetViewDto[];
  onClose: () => void;
  onCreate: (body: {
    assetId: string;
    supply: string;
    priceRial: string;
    minPerInvestor: string;
    maxPerInvestor: string;
    minimumRaise: string;
    opensAt: string;
    closesAt: string;
  }) => void;
}) => {
  const t = dictionaries[locale];
  const [assetId, setAssetId] = useState("");
  const [supply, setSupply] = useState("1000");
  const [priceRial, setPriceRial] = useState("1000");
  const effectiveAsset = assetId || (assets[0]?.id ?? "");

  return (
    <Modal
      open={open}
      title={t.createOfferingButton}
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
              onCreate({
                assetId: effectiveAsset,
                supply,
                priceRial,
                minPerInvestor: "5",
                maxPerInvestor: supply,
                minimumRaise: "50",
                opensAt: "2026-01-01T00:00:00.000Z",
                closesAt: "2027-12-31T00:00:00.000Z",
              });
            }}
          >
            {t.createOfferingButton}
          </Button>
        </>
      }
    >
      {assets.length === 0 ? (
        <p className="muted">{t.noTokenizedAssets}</p>
      ) : (
        <>
          <SelectField
            id="offering-asset"
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
            id="offering-supply"
            label={t.supplyLabel}
            type="number"
            value={supply}
            onChange={(e) => {
              setSupply(e.target.value);
            }}
          />
          <Field
            id="offering-price"
            label={`${t.priceLabel} (﷼)`}
            type="number"
            value={priceRial}
            onChange={(e) => {
              setPriceRial(e.target.value);
            }}
          />
        </>
      )}
    </Modal>
  );
};

const CreditModal = ({
  open,
  locale,
  onClose,
  onCredit,
}: {
  open: boolean;
  locale: Locale;
  onClose: () => void;
  onCredit: (investorId: string, amount: string) => void;
}) => {
  const t = dictionaries[locale];
  const [investorId, setInvestorId] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <Modal
      open={open}
      title={t.creditLedgerButton}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (investorId.trim() !== "" && amount.trim() !== "") {
                onCredit(investorId.trim(), amount.trim());
                setInvestorId("");
                setAmount("");
              }
            }}
          >
            {t.creditLedgerButton}
          </Button>
        </>
      }
    >
      <Field
        id="credit-investor"
        label={t.investorIdLabel}
        value={investorId}
        onChange={(e) => {
          setInvestorId(e.target.value);
        }}
      />
      <Field
        id="credit-amount"
        label={`${t.amountLabel} (﷼)`}
        type="number"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
        }}
      />
    </Modal>
  );
};
