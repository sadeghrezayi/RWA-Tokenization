import { DomainError } from "../identity/errors.js";

// A custodial wallet row the platform cannot use. Never skipped silently: a
// wallet that is quietly dropped from a holder snapshot reads as "this holder
// owns nothing", which under-pays a distribution. Refuse, and name the row.
export class CorruptWalletDirectoryError extends DomainError {}

const CUSTODIAL_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const isCustodialAddress = (value: string): boolean => CUSTODIAL_ADDRESS.test(value);

export const assertCustodialAddress = (address: string, investorId: string): string => {
  if (!isCustodialAddress(address)) {
    throw new CorruptWalletDirectoryError(
      `wallet directory holds an unusable address "${address}" for investor ${investorId}`,
    );
  }
  return address;
};
