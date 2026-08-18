// DI tokens shared between HTTP-layer providers and the composition root.
export const AUTH_RATE_LIMITER = "AUTH_RATE_LIMITER";
// Reading "am I signed in?" is not a credential attempt and must not share the
// credential budget — every page load asks it (KNOWN_ISSUES K-27).
export const AUTH_READ_RATE_LIMITER = "AUTH_READ_RATE_LIMITER";
export const LOGIN_THROTTLE_SERVICE = "LOGIN_THROTTLE_SERVICE";
