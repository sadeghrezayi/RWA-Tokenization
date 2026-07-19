import type { GetHolderRegistry } from "./get-holder-registry.js";

// FR-RA-1: exportable registry. CSV fields are escaped per RFC 4180 (quote
// fields containing commas, quotes, or newlines; double embedded quotes).
export const csvField = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const csvLines = (header: string, rows: string[][]): string =>
  [header, ...rows.map((row) => row.map(csvField).join(","))].join("\n");

export interface CsvExport {
  filename: string;
  csv: string;
}

export class ExportHolderRegistryCsv {
  constructor(private readonly registry: GetHolderRegistry) {}

  async execute(input: { assetId: string }): Promise<CsvExport> {
    const view = await this.registry.execute(input);
    return {
      filename: `holder-registry-${view.assetId}.csv`,
      csv: csvLines(
        "email,investor_id,wallet,tokens,holder_since",
        view.holders.map((holder) => [
          holder.email ?? "",
          holder.investorId ?? "",
          holder.wallet,
          holder.tokens,
          holder.since,
        ]),
      ),
    };
  }
}

export class ExportTransferHistoryCsv {
  constructor(private readonly registry: GetHolderRegistry) {}

  async execute(input: { assetId: string }): Promise<CsvExport> {
    const view = await this.registry.execute(input);
    return {
      filename: `transfer-history-${view.assetId}.csv`,
      csv: csvLines(
        "at,kind,from,to,tokens,tx",
        view.history.map((event) => [
          event.at,
          event.kind,
          event.from ?? "",
          event.to ?? "",
          event.tokens,
          event.ref,
        ]),
      ),
    };
  }
}
