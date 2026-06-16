export function isDetectionEnabledForHost(_host: string): boolean {
  // Single call site for the per-domain enable/disable feature (its own issue).
  // Until that lands, detection runs everywhere.
  return true;
}
