import {
  CTM_SIGNUP_URL,
  connectAuthPanel,
  requestConnect,
  requestDisconnect,
  type AuthView,
} from "./ui/authPanel";

const loggedOut = document.getElementById("logged-out")!;
const loggedIn = document.getElementById("logged-in")!;
const avatar = document.getElementById("avatar") as HTMLImageElement;
const email = document.getElementById("email")!;
const signup = document.getElementById("signup") as HTMLAnchorElement;
const authError = document.getElementById("auth-error")!;

signup.href = CTM_SIGNUP_URL;

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

document.getElementById("connect")!.addEventListener("click", () => {
  clearError();
  requestConnect().catch(() =>
    showError("Sign-in didn't complete. Please try again."),
  );
});

document.getElementById("disconnect")!.addEventListener("click", () => {
  clearError();
  requestDisconnect().catch(() =>
    showError("Couldn't disconnect. Please try again."),
  );
});

connectAuthPanel(render);
