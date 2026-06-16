export abstract class AuthError extends Error {
  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

// The user-facing OAuth flow failed: denied consent, a state-parameter
// mismatch, a bad authorization code, or launchWebAuthFlow itself failing.
export class AuthorizationFailed extends AuthError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

// The request never reached CTM (offline, DNS, TLS, aborted fetch).
export class NetworkError extends AuthError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

// CTM responded, but with an error status or an unparseable body.
export class ServerError extends AuthError {
  readonly status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.status = status;
  }
}

// A valid token could not be obtained: no tokens stored, or the refresh
// token was rejected. Callers surface this as "please sign in again".
export class TokenExpired extends AuthError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
