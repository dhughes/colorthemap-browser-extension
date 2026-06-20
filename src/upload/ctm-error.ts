// CTM's JSON endpoints return errors as `{ detail: "..." }` (FastAPI), while
// the tus pre-create path returns plain text. Read whichever is present so the
// extension can surface CTM's actual message verbatim rather than a generic one.
export async function readCtmError(response: Response): Promise<string> {
  const fallback = response.statusText || `HTTP ${response.status}`;
  let text: string;
  try {
    text = await response.text();
  } catch {
    return fallback;
  }
  if (text.trim() === "") {
    return fallback;
  }
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const detail = body.detail ?? body.error ?? body.message;
    return typeof detail === "string" && detail.trim() !== ""
      ? detail
      : fallback;
  } catch {
    // Not JSON — surface the plain-text body (e.g. tusd's text errors).
    return text.trim();
  }
}
