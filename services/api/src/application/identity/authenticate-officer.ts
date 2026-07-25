// Stable principal id for the bootstrapped super-admin — the account the single
// env officer maps to (1.4c). Keeping this id fixed makes the User-backed login
// behaviour-preserving: the MFA store key and any officer-id references are
// unchanged. Staff auth now lives in AuthenticateStaff.
export const OFFICER_PRINCIPAL_ID = "officer-1";
