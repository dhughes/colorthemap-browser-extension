import { CTM_BASE_URL } from "../auth/config";
import { readCtmError } from "./ctm-error";
import type { CtmMap } from "./messages";

interface MapResponseBody {
  id: number;
  name: string;
}

// Fetches the authenticated user's maps from CTM. Runs in the background SW,
// where host_permissions for the CTM origin let it bypass CORS (content scripts
// can't call this directly). Throws with CTM's message on a non-OK response.
export async function fetchMaps(
  accessToken: string,
  baseUrl: string = CTM_BASE_URL,
): Promise<CtmMap[]> {
  const response = await fetch(`${baseUrl}/api/v1/maps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(await readCtmError(response));
  }

  const body = (await response.json()) as MapResponseBody[];
  return body.map((map) => ({ id: map.id, name: map.name }));
}
