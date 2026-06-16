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

signup.href = CTM_SIGNUP_URL;

function render(view: AuthView): void {
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
  void requestConnect();
});

document.getElementById("disconnect")!.addEventListener("click", () => {
  void requestDisconnect();
});

connectAuthPanel(render);
