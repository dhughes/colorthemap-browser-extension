import {
  CTM_SIGNUP_URL,
  connectAuthPanel,
  requestConnect,
  requestDisconnect,
  type AuthView,
} from "./ui/authPanel";

const welcome = document.getElementById("welcome")!;
const loggedOut = document.getElementById("logged-out")!;
const loggedIn = document.getElementById("logged-in")!;
const avatar = document.getElementById("avatar") as HTMLImageElement;
const email = document.getElementById("email")!;
const signup = document.getElementById("signup") as HTMLAnchorElement;

signup.href = CTM_SIGNUP_URL;

// background.ts opens this page with ?welcome=1 on first install.
const welcomeRequested =
  new URLSearchParams(location.search).get("welcome") === "1";

function render(view: AuthView): void {
  // The welcome greeting only makes sense for a freshly installed, not-yet-
  // connected user — hide it once they're signed in.
  welcome.hidden = !welcomeRequested || view.authenticated;
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
  void requestConnect();
});

document.getElementById("disconnect")!.addEventListener("click", () => {
  void requestDisconnect();
});

connectAuthPanel(render);
