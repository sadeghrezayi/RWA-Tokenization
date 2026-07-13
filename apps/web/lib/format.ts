// Presentation helpers. Amounts arrive as decimal strings (bigint-safe from the
// API) — group with a regex so we never lose precision through Number.

const groupThousands = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const toIntegerString = (value: string | number | bigint): string | undefined => {
  const raw = typeof value === "string" ? value.trim() : String(value);
  return /^-?\d+$/.test(raw) ? raw : undefined;
};

// Rial (﷼). PRD C3/D3: the domestic settlement unit.
export const formatRial = (value: string | number | bigint): string => {
  const digits = toIntegerString(value);
  return digits === undefined ? "—" : `${groupThousands(digits)} ﷼`;
};

export const formatTokens = (value: string | number | bigint): string => {
  const digits = toIntegerString(value);
  return digits === undefined ? "—" : groupThousands(digits);
};

// P2: addresses are demoted to compact, copyable chips — never a primary label.
export const truncateAddress = (address: string | undefined): string => {
  if (!address) return "—";
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
};

// Calendar date (YYYY-MM-DD) from an ISO timestamp — deterministic, locale-free.
export const formatDate = (iso: string | undefined): string => {
  if (!iso) return "—";
  const match = /^\d{4}-\d{2}-\d{2}/.exec(iso);
  return match ? match[0] : "—";
};
