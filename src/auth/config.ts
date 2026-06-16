export const CLIENT_ID = "ctm-browser-extension";

export const SCOPE = "ctm:full";

// Color The Map origin the extension talks to. Dev points at the
// valid-TLS dev deployment; the production build flips this to
// https://colorthemap.app when packaging lands (#7 / #8). Kept as a single
// switch point so api.ts callers stay pure (they receive the base URL).
export const CTM_BASE_URL = "https://dev.colorthemap.app";

// Token is considered stale this many ms before its actual expiry, so a
// refresh happens before a request can fail mid-flight.
export const REFRESH_THRESHOLD_MS = 120_000;

// chrome.alarms enforces a 1-minute minimum period in MV3.
export const REFRESH_ALARM_NAME = "ctm-auth-refresh";
export const REFRESH_ALARM_PERIOD_MINUTES = 1;
