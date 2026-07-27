import { getAllowPrivateHosts, setAllowPrivateHosts } from "./shared/settings";
import {
  CTM_SIGNUP_URL,
  connectAuthPanel,
  requestConnect,
  requestDisconnect,
  type AuthView,
} from "./ui/authPanel";
import { alertClass, buttonClass } from "./ui/recipes";

const loggedOut = document.getElementById("logged-out")!;
const loggedIn = document.getElementById("logged-in")!;
const avatar = document.getElementById("avatar") as HTMLImageElement;
const email = document.getElementById("email")!;
const signup = document.getElementById("signup") as HTMLAnchorElement;
const authError = document.getElementById("auth-error")!;
const connect = document.getElementById("connect")!;
const disconnect = document.getElementById("disconnect")!;
const dangerWarning = document.getElementById("danger-warning")!;
const allowPrivateHosts = document.getElementById(
  "allow-private-hosts",
) as HTMLInputElement;

signup.href = CTM_SIGNUP_URL;

// Recipe-styled controls get their classes here, not in the markup, so
// recipes.ts stays the single source of the shared looks.
authError.className = `${alertClass("error")} mb-6`;
dangerWarning.className = `${alertClass("warning")} mb-4`;
connect.className = buttonClass({ tone: "primary", size: "lg", width: "full" });
disconnect.className = buttonClass({
  tone: "destructive",
  emphasis: "secondary",
});

// The "allow private hosts" opt-in is independent of auth — it gates the
// re-fetch SSRF guard (see refetch-safety.ts), so it's always shown and wired.
void getAllowPrivateHosts().then((on) => {
  allowPrivateHosts.checked = on;
});
allowPrivateHosts.addEventListener("change", () => {
  void setAllowPrivateHosts(allowPrivateHosts.checked);
});

function showError(message: string): void {
  authError.textContent = message;
  authError.hidden = false;
}

function clearError(): void {
  authError.hidden = true;
}

function render(view: AuthView): void {
  // A state change means the last action succeeded — clear any stale error.
  clearError();
  // Two views: logged-out (welcome + connect) and logged-in (account).
  loggedOut.hidden = view.authenticated;
  loggedIn.hidden = !view.authenticated;
  email.textContent = view.email ?? "";
  if (view.avatarUrl) {
    avatar.src = view.avatarUrl;
    avatar.hidden = false;
  } else {
    avatar.removeAttribute("src");
    avatar.hidden = true;
  }
}

connect.addEventListener("click", () => {
  clearError();
  requestConnect().catch(() =>
    showError("Sign-in didn't complete. Please try again."),
  );
});

disconnect.addEventListener("click", () => {
  clearError();
  requestDisconnect().catch(() =>
    showError("Couldn't disconnect. Please try again."),
  );
});

connectAuthPanel(render);
