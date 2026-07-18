// Typed upload-path errors, mirroring src/auth/errors.ts: the background
// classifies failures with instanceof (which works there — error classes don't
// survive the sendMessage boundary) into UploadFailureReason for the toast.
export abstract class UploadError extends Error {
  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

// The request never reached CTM (offline, DNS, TLS, aborted fetch).
export class UploadNetworkError extends UploadError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

// CTM responded, but with an error status.
export class UploadServerError extends UploadError {
  readonly status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.status = status;
  }
}
