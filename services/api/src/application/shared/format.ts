// Human-readable formatting for operator-facing text (P2 human labels).
//
// String-based on purpose: Rial amounts are minor-unit integers that must never
// round-trip through a float, so the digits are grouped textually rather than
// via Number/Intl.
export const groupDigits = (amount: string): string => amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
