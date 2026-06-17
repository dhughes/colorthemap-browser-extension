import { AUTH_MESSAGE_TYPES, isAuthMessage, type AuthState } from "./messages";
import { getAuthState, logout, startAuthFlow } from "./service";

// Routes a runtime message to the matching auth action. Returns a Promise the
// onMessage listener forwards as the response (the AuthState for a query), or
// undefined for messages this handler doesn't own — letting other listeners
// handle them.
export function handleAuthMessage(
  message: unknown,
): Promise<void | AuthState> | undefined {
  if (!isAuthMessage(message)) return undefined;
  switch (message.type) {
    case AUTH_MESSAGE_TYPES.startAuth:
      return startAuthFlow();
    case AUTH_MESSAGE_TYPES.logout:
      return logout();
    case AUTH_MESSAGE_TYPES.getAuthState:
      return getAuthState();
    case AUTH_MESSAGE_TYPES.authStateChanged:
      // Outbound broadcast from this SW — not an inbound request.
      return undefined;
  }
}
