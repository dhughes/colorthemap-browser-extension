import { CTM_BASE_URL } from "../auth/config";
import { ctmFetch } from "./fetch-ctm";
import type { CtmMap } from "./messages";

interface MapResponseBody {
  id: number;
  name: string;
}

// Fetches the authenticated user's maps from CTM. Runs in the background SW,
// where host_permissions for the CTM origin let it bypass CORS (content scripts
// can't call this directly). Throws a typed UploadServerError/UploadNetworkError
// (via ctmFetch) so the handler can classify it for the toast.
export async function fetchMaps(
  accessToken: string,
  baseUrl: string = CTM_BASE_URL,
): Promise<CtmMap[]> {
  const response = await ctmFetch(`${baseUrl}/api/v1/maps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = (await response.json()) as MapResponseBody[];
  return body.map((map) => ({ id: map.id, name: map.name }));
}
