import type { CtmMap, UploadResult } from "../upload/messages";

// Which map the selector should start on: the last one used on this site if it
// still exists, otherwise the first map. Null when the user has no maps.
export function resolveInitialMapId(
  maps: CtmMap[],
  lastMapId: number | null,
): number | null {
  if (maps.length === 0) {
    return null;
  }
  if (lastMapId !== null && maps.some((map) => map.id === lastMapId)) {
    return lastMapId;
  }
  return maps[0]!.id;
}

export interface OutcomeCopy {
  tone: "success" | "error";
  message: string;
}

// Maps an upload outcome to user-facing copy. CTM's own error detail is shown
// verbatim; a duplicate is a benign success ("it's already there").
export function describeOutcome(result: UploadResult): OutcomeCopy {
  switch (result.status) {
    case "ok":
      return { tone: "success", message: "Sent to Color The Map." };
    case "duplicate":
      return { tone: "success", message: "Already in this map." };
    case "error":
      return { tone: "error", message: result.detail ?? "Upload failed." };
  }
}
