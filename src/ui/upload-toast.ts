import browser from "webextension-polyfill";
import {
  getAuthStateMessage,
  startAuthMessage,
  type AuthState,
} from "../auth/messages";
import { base64ToBytes } from "../shared/base64";
import { getFormatSpec } from "../shared/formats";
import { getAllowPrivateHosts } from "../shared/settings";
import { matchesFormat } from "../shared/sniff";
import { getLastMapForHost, setLastMapForHost } from "../upload/last-map";
import {
  listMapsMessage,
  uploadMessage,
  type CtmMap,
  type ListMapsResult,
  type UploadFileInput,
  type UploadResult,
} from "../upload/messages";
import shadowCss from "../styles/shadow.css?inline";
import {
  addDetectedFile,
  cancelCountdown,
  countdownRemainingFraction,
  describeUploadOutcome,
  isCountdownElapsed,
  offerTitle,
  originsNeedingPermission,
  pauseCountdown,
  resolveInitialMapId,
  resumeCountdown,
  sendButtonLabel,
  signInMessage,
  signInRetryMessage,
  signInTitle,
  startCountdown,
  successDeepLink,
  translateFailureReason,
  type CountdownState,
  type DetectedFile,
  type OutcomeCard,
} from "./toast-view";
import {
  buttonClass,
  closeButtonClass,
  formatBadgeClass,
  labelClass,
  selectClass,
  spinnerClass,
  surfaceCardClass,
} from "./recipes";

const HOST_TAG = "ctm-upload-toast";
// The union of every live card's URLs, as a JSON array attribute — the
// cross-bundle dedupe surface. A string attribute is the safest thing to read
// across isolated-world content-script bundles (no realm/prototype baggage).
const HOST_URLS_ATTR = "data-ctm-urls";
// The channel a non-owning content-script bundle uses to hand a file to the
// live host controller (which was created by whichever bundle detected first).
const ADD_FILE_EVENT = "ctm:toast-add-file";

// One auto-dismiss duration for every countdown surface (offer, sign-in,
// success). Hover pauses it; engaging (focus/pointer) cancels it outright.
const COUNTDOWN_MS = 10_000;

// Firefox aborts an in-flight fetch when a link's own download starts in the
// same tick (Chrome doesn't). Retry once after the download is dispatched.
const FETCH_RETRY_DELAY_MS = 150;

export type { DetectedFile };

// Validates a detected file BEFORE offering it, then hands it to the toast
// (parity with Detector A, which content-checks up front). For a same-origin
// file the content script reads and sniffs it — a URL-level false positive
// never reaches the toast. Bytes already in hand (Detector A) skip straight to
// the toast. A cross-origin file can't be read here (CORS) → offer and validate
// at Send.
const inFlight = new Set<string>();

export async function requestUploadToast(file: DetectedFile): Promise<void> {
  if (file.bytesBase64 !== undefined) {
    openUploadToast(file);
    return;
  }
  if (inFlight.has(file.url) || isAlreadyOffered(file.url)) {
    return;
  }
  if (!isSameOrigin(file.url)) {
    openUploadToast(file);
    return;
  }

  inFlight.add(file.url);
  try {
    const bytesBase64 = await fetchAndEncodeBlob(file.url);
    if (bytesBase64 === null) {
      // Couldn't read the file even after the retry — defer to Detector B (the
      // download), which validates without the race; opening here would skip
      // validation.
      return;
    }
    // Validate via the base64 string, not the blob's ArrayBuffer directly:
    // FileReader.readAsArrayBuffer yields a page-realm buffer in Firefox, and
    // any typed-array op on it trips the Xray membrane. readAsDataURL yields a
    // string (realm-safe); base64ToBytes rebuilds content-realm bytes. Reuse
    // the base64 for the upload too.
    const head = new Uint8Array(base64ToBytes(bytesBase64)).subarray(0, 2048);
    if (!matchesFormat(head, file.format)) {
      return; // not actually this format — no toast
    }
    openUploadToast({ ...file, bytesBase64 });
  } catch (error) {
    console.error("[ctm] pre-validation failed", error);
  } finally {
    inFlight.delete(file.url);
  }
}

// Offers one detected file. Cross-bundle singleton via the DOM: if a host is
// already mounted, hand the file to its controller through a CustomEvent (the
// controller may live in a different content-script bundle); otherwise mount a
// fresh host here. Runs synchronously, so two near-simultaneous calls can't both
// create a host — the second sees the first's element.
export function openUploadToast(file: DetectedFile): void {
  const existing = document.querySelector(HOST_TAG);
  if (existing) {
    existing.dispatchEvent(new CustomEvent(ADD_FILE_EVENT, { detail: file }));
    return;
  }
  new UploadToastHost(file);
}

function isAlreadyOffered(url: string): boolean {
  const host = document.querySelector(HOST_TAG);
  const raw = host?.getAttribute(HOST_URLS_ATTR);
  if (!raw) {
    return false;
  }
  try {
    return (JSON.parse(raw) as unknown[]).includes(url);
  } catch {
    return false;
  }
}

// Owns the shadow host and the stack of cards. New detections accumulate into
// the newest still-offering card, or stack a fresh card beneath it when none is
// offering (e.g. the previous one is sending or already showed its result).
class UploadToastHost {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly stack: HTMLElement;
  private readonly cards: ToastCard[] = [];

  constructor(first: DetectedFile) {
    this.host = document.createElement(HOST_TAG);
    // Injected into arbitrary pages, the toast must sit above their own UI. Pin
    // a max-z-index fixed layer (with !important to beat aggressive site CSS);
    // pointer-events:none makes the full-viewport host click-through — only the
    // cards (pointer-events:auto) are interactive, so the page stays usable.
    this.host.style.cssText =
      "position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;";
    // Closed so a host page can't read the toast's contents via
    // host.shadowRoot — that readback was a recon oracle (SSRF hardening, #23).
    // The controller keeps its own `this.shadow` handle, so nothing internal
    // depends on the element exposing shadowRoot.
    this.shadow = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = shadowCss;

    // Anchored to the bottom-right; grows upward as cards stack, so the newest
    // sits lowest ("under" the earlier ones). No overflow clip — it would crop
    // each card's raised shadow.
    this.stack = el(
      "div",
      "fixed bottom-4 right-4 flex flex-col items-end gap-3",
    );

    this.shadow.append(style, this.stack);
    this.host.addEventListener(ADD_FILE_EVENT, this.onAddFile);
    document.documentElement.append(this.host);

    this.addFile(first);
  }

  private readonly onAddFile = (event: Event): void => {
    const file = (event as CustomEvent<DetectedFile>).detail;
    if (file) {
      this.addFile(file);
    }
  };

  private addFile(file: DetectedFile): void {
    // One card per distinct file. If the same URL already has a card, only act
    // when this arrival carries bytes the card lacked (Detector C queued the
    // bare link, then Detector A caught the body) — upgrade it in place so Send
    // needn't re-fetch. Otherwise it's a duplicate and we ignore it.
    const existing = this.cards.find((card) => card.hasUrl(file.url));
    if (existing) {
      existing.upgradeBytes(file);
      return;
    }
    const card = new ToastCard(file, this.stack, () => this.dispose(card));
    this.cards.push(card);
    card.mount();
    this.syncOfferedUrls();
  }

  private dispose(card: ToastCard): void {
    const index = this.cards.indexOf(card);
    if (index !== -1) {
      this.cards.splice(index, 1);
    }
    this.syncOfferedUrls();
    if (this.cards.length === 0) {
      this.host.removeEventListener(ADD_FILE_EVENT, this.onAddFile);
      this.host.remove();
    }
  }

  private syncOfferedUrls(): void {
    const urls = this.cards.flatMap((card) => card.urls());
    this.host.setAttribute(HOST_URLS_ATTR, JSON.stringify(urls));
  }
}

type ToastPhase =
  | "loading"
  | "no-maps"
  | "offer"
  | "sign-in"
  | "authenticating"
  | "sending"
  | "success"
  | "error";

// One toast card: its own file list, map picker, countdown, and lifecycle. The
// host may hold several at once, but each is self-contained.
class ToastCard {
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly body: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly hostname = location.hostname;

  private files: DetectedFile[];
  private maps: CtmMap[] = [];
  private selectedMapId: number | null = null;
  // Pre-loaded from storage during loadMaps so send() can read it synchronously
  // (send() must run before its first await to keep the click-gesture token that
  // browser.permissions.request requires).
  private allowPrivateHosts = false;
  private phase: ToastPhase = "loading";
  private countdown: CountdownState | null = null;
  private raf: number | null = null;
  // A send that hit a logged-out state and is waiting for the user to connect,
  // so it can be resumed verbatim afterward. Null when there's nothing pending.
  private pendingSend: { mapId: number; files: DetectedFile[] } | null = null;
  private disposed = false;

  constructor(
    first: DetectedFile,
    private readonly stack: HTMLElement,
    private readonly onDispose: () => void,
  ) {
    this.files = [first];

    this.card = el(
      "div",
      `${surfaceCardClass("light")} pointer-events-auto ctm-toast-enter flex w-[24rem] max-w-[calc(100vw-2rem)] flex-col text-text focus:outline-none`,
    );
    this.card.tabIndex = -1;

    const header = el(
      "div",
      "relative flex items-center justify-between gap-3 border-b border-border px-5 py-3",
    );
    this.title = el("h2", "text-title font-semibold text-text");
    const close = button(closeButtonClass, "×", () => this.dismiss());
    close.setAttribute("aria-label", "Dismiss");
    this.bar = el("div", "ctm-toast-bar is-hidden");
    header.append(this.title, close, this.bar);

    this.body = el("div", "px-5 py-4");
    this.footer = el("div", "flex gap-2 px-5 pb-5");

    this.card.append(header, this.body, this.footer);
    this.card.addEventListener("keydown", this.onKeydown);
    this.card.addEventListener("mouseenter", () => this.pause());
    this.card.addEventListener("mouseleave", () => this.resume());
    this.card.addEventListener("focusin", () => this.engage());
    this.card.addEventListener("pointerdown", () => this.engage());
  }

  mount(): void {
    this.stack.append(this.card);
    void this.loadMaps();
  }

  hasUrl(url: string): boolean {
    return this.files.some((file) => file.url === url);
  }

  urls(): string[] {
    return this.files.map((file) => file.url);
  }

  // The same URL arrived again; adopt bytes it now carries (Detector A caught the
  // body after Detector C queued the bare link) so Send won't re-fetch. Nothing
  // visible changes — same filename, host, format — so there's no re-render.
  upgradeBytes(file: DetectedFile): void {
    const { files } = addDetectedFile(this.files, file);
    this.files = files;
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.dismiss();
    }
  };

  private async loadMaps(): Promise<void> {
    this.renderLoading();
    let result: ListMapsResult;
    try {
      result = (await browser.runtime.sendMessage(
        listMapsMessage(),
      )) as ListMapsResult;
    } catch (error) {
      console.error("[ctm] list maps failed", error);
      this.renderOutcome(translateFailureReason("unknown"), null);
      return;
    }
    if (!result.ok) {
      if (result.reason === "sign-in-required") {
        this.renderSignIn();
        return;
      }
      this.renderOutcome(translateFailureReason(result.reason), null);
      return;
    }
    if (result.maps.length === 0) {
      this.renderNoMaps();
      return;
    }
    this.maps = result.maps;
    this.selectedMapId = resolveInitialMapId(
      result.maps,
      await getLastMapForHost(this.hostname),
    );
    this.allowPrivateHosts = await getAllowPrivateHosts();
    this.renderOffer();
  }

  private renderLoading(): void {
    this.setPhase("loading");
    this.title.textContent = offerTitle(this.files.length);
    this.body.replaceChildren(spinnerRow("Checking your maps…"));
    this.footer.replaceChildren();
    this.hideBar();
  }

  private renderNoMaps(): void {
    this.setPhase("no-maps");
    this.title.textContent = "No maps yet";
    const text = el("p", "text-secondary text-text-muted");
    text.append(
      document.createTextNode("Create a map on "),
      anchor(browser.runtime.getURL("options.html"), "Color The Map"),
      document.createTextNode(" first, then try again."),
    );
    this.body.replaceChildren(text);
    this.footer.replaceChildren(
      button(`${buttonClass({ tone: "primary" })} flex-1`, "Got it", () =>
        this.dismiss(),
      ),
    );
    this.hideBar();
  }

  private renderOffer(): void {
    this.setPhase("offer");
    this.title.textContent = offerTitle(this.files.length);
    this.body.replaceChildren(this.fileList(), this.mapChoice());

    // CTM's DialogFooter: two equal-width pills, dismiss (gray) left, primary
    // (magenta) right.
    const dismiss = button(
      `${buttonClass({ emphasis: "secondary" })} flex-1`,
      "No thanks",
      () => this.dismiss(),
    );
    const send = button(
      `${buttonClass({ tone: "primary" })} flex-1`,
      sendButtonLabel(this.files.length),
      () => this.send(),
    );
    this.footer.replaceChildren(dismiss, send);

    if (this.countdown === null) {
      this.countdown = startCountdown(COUNTDOWN_MS, now());
    }
    this.showBarIfRunning();
  }

  private fileList(): HTMLElement {
    const list = el("ul", "flex flex-col gap-2");
    for (const file of this.files) {
      const row = el("li", "flex flex-col gap-0.5");
      const top = el("div", "flex items-center gap-2");
      const name = el(
        "span",
        "min-w-0 flex-1 truncate text-secondary text-text",
      );
      name.textContent = file.filename;
      name.title = file.filename;
      const badge = el("span", formatBadgeClass);
      badge.textContent = getFormatSpec(file.format).label;
      top.append(name, badge);

      // Name the source host so it's obvious where a file would be fetched
      // from — the URL isn't otherwise visible, and a link can point anywhere.
      const source = el("span", "truncate text-secondary text-text-muted");
      source.textContent = `from ${hostForDisplay(file.url)}`;
      source.title = file.url;

      row.append(top, source);
      list.append(row);
    }
    return list;
  }

  private mapChoice(): HTMLElement {
    if (this.maps.length === 1) {
      const wrap = el("div", "mt-4");
      const label = el("p", `${labelClass} mb-1`);
      label.textContent = "Sending to";
      const only = el("p", "text-body text-text");
      only.textContent = this.maps[0]!.name;
      wrap.append(label, only);
      return wrap;
    }
    const wrap = el("div", "mt-4");
    const label = el("label", `${labelClass} mb-1 block`);
    label.textContent = "Send to";
    const select = document.createElement("select");
    select.className = selectClass;
    for (const map of this.maps) {
      const option = document.createElement("option");
      option.value = String(map.id);
      option.textContent = map.name;
      option.selected = map.id === this.selectedMapId;
      select.append(option);
    }
    select.addEventListener("change", () => {
      this.selectedMapId = Number(select.value);
    });
    wrap.append(label, select);
    return wrap;
  }

  private send(): void {
    if (this.phase !== "offer" || this.selectedMapId === null) {
      return;
    }
    const mapId = this.selectedMapId;
    const files = this.files;
    // Front-load the host-permission prompt while the click gesture is still
    // valid: compute the cross-origin origins the background must re-fetch
    // synchronously, and request BEFORE any await (an intervening await drops
    // the gesture token the prompt requires).
    const origins = originsNeedingPermission(
      files,
      location.origin,
      this.allowPrivateHosts,
    );
    const grant =
      origins.length > 0
        ? browser.permissions.request({ origins })
        : Promise.resolve(true);
    void this.runSend(mapId, files, grant);
  }

  private async runSend(
    mapId: number,
    files: DetectedFile[],
    grant: Promise<boolean>,
  ): Promise<void> {
    this.renderSending();

    let granted = false;
    try {
      granted = await grant;
    } catch (error) {
      console.warn("[ctm] host permission request failed", error);
    }
    if (!granted) {
      this.renderOutcome(translateFailureReason("permission-denied"), null);
      return;
    }

    const resolved = (
      await Promise.all(files.map((file) => this.resolveFile(file)))
    ).filter((input): input is UploadFileInput => input !== null);
    if (resolved.length === 0) {
      // The grant succeeded (or wasn't needed) but no file could be read — a
      // same-origin read failure, not a declined permission.
      this.renderOutcome(translateFailureReason("network"), null);
      return;
    }
    // Files dropped by a local read failure never reach CTM's counts; fold them
    // in so the outcome is honest ("Added 2 of 3") rather than silently short.
    const droppedLocally = files.length - resolved.length;

    await setLastMapForHost(this.hostname, mapId);

    let result: UploadResult;
    try {
      result = (await browser.runtime.sendMessage(
        uploadMessage({ mapId, files: resolved }),
      )) as UploadResult;
    } catch (error) {
      console.error("[ctm] upload request failed", error);
      this.renderOutcome(translateFailureReason("unknown"), null);
      return;
    }
    if (result.status === "error" && result.reason === "sign-in-required") {
      // CTM rejected the token mid-send. Hold this exact send and prompt the
      // user to connect; resumeAfterAuth replays it once they're back.
      this.pendingSend = { mapId, files };
      this.renderSignIn();
      return;
    }
    if (result.status === "done" && droppedLocally > 0) {
      result = {
        ...result,
        failed: result.failed + droppedLocally,
        total: result.total + droppedLocally,
      };
    }
    this.renderOutcome(
      describeUploadOutcome(result, this.mapName(mapId)),
      mapId,
    );
  }

  // Resolve the file's bytes as base64 where the content script must (Detector A
  // already has them; a same-origin file is read here with cookies). Cross-origin
  // files are left for the background to re-fetch with the granted permission.
  private async resolveFile(
    file: DetectedFile,
  ): Promise<UploadFileInput | null> {
    if (file.bytesBase64 !== undefined) {
      return toInput(file);
    }
    if (isSameOrigin(file.url)) {
      const bytesBase64 = await fetchAndEncodeBlob(file.url);
      return bytesBase64 === null ? null : { ...toInput(file), bytesBase64 };
    }
    return toInput(file);
  }

  // The logged-out (or token-rejected) state: an inline Connect CTA in place of
  // the raw error the send flow used to surface. It auto-dismisses like the
  // offer — an ignored card times out. Clicking Connect enters the
  // authenticating phase, which freezes the timer for the OAuth round trip.
  private renderSignIn({ retry = false }: { retry?: boolean } = {}): void {
    this.setPhase("sign-in");
    this.title.textContent = signInTitle();
    const message = el("p", "text-secondary text-text-muted");
    message.textContent = retry
      ? signInRetryMessage()
      : signInMessage(this.files.length);
    this.body.replaceChildren(message);

    const dismiss = button(
      `${buttonClass({ emphasis: "secondary" })} flex-1`,
      "No thanks",
      () => this.dismiss(),
    );
    const connect = button(
      `${buttonClass({ tone: "primary" })} flex-1`,
      "Connect",
      () => this.connect(),
    );
    this.footer.replaceChildren(dismiss, connect);

    this.countdown = startCountdown(COUNTDOWN_MS, now());
    this.showBarIfRunning();
  }

  private renderAuthenticating(): void {
    this.setPhase("authenticating");
    // Freeze auto-dismiss: the user is away completing OAuth (~a minute) and the
    // card must still be here when they return.
    this.countdown = null;
    this.body.replaceChildren(spinnerRow("Connecting…"));
    this.footer.replaceChildren();
    this.hideBar();
  }

  private connect(): void {
    if (this.phase !== "sign-in") {
      return;
    }
    void this.runConnect();
  }

  // Launches OAuth in the background SW (openOptions:false keeps the user on
  // this tab), then treats getAuthState as the source of truth: the start-auth
  // promise can reject on a benign window-close or an SW eviction, so the
  // re-query — not the promise's fate — decides success.
  private async runConnect(): Promise<void> {
    this.renderAuthenticating();
    try {
      await browser.runtime.sendMessage(
        startAuthMessage({ openOptions: false }),
      );
    } catch (error) {
      console.warn("[ctm] sign-in did not complete", error);
    }
    if (this.disposed) {
      return;
    }
    if (await this.isSignedIn()) {
      await this.resumeAfterAuth();
    } else {
      this.renderSignIn({ retry: true });
    }
  }

  private async isSignedIn(): Promise<boolean> {
    try {
      const state = (await browser.runtime.sendMessage(
        getAuthStateMessage(),
      )) as AuthState | undefined;
      return state?.status === "authenticated";
    } catch {
      return false;
    }
  }

  private async resumeAfterAuth(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const pending = this.pendingSend;
    this.pendingSend = null;
    if (pending) {
      // The user already picked a map and granted any host permission before
      // the token was rejected — replay that send (permission still held, so
      // pass a resolved grant rather than re-prompting outside a gesture).
      await this.runSend(pending.mapId, pending.files, Promise.resolve(true));
    } else {
      // Never got as far as an offer — reload maps and land on the normal
      // offer for the user to pick a map and Send.
      await this.loadMaps();
    }
  }

  private renderSending(): void {
    this.setPhase("sending");
    this.body.replaceChildren(spinnerRow("Sending…"));
    this.footer.replaceChildren();
    this.hideBar();
  }

  private renderOutcome(card: OutcomeCard, mapId: number | null): void {
    this.setPhase(card.tone === "error" ? "error" : "success");
    this.title.textContent = card.title;

    const body: Node[] = [];
    if (card.message !== "") {
      const message = el("p", "text-secondary text-text");
      message.textContent = card.message;
      body.push(message);
    }
    if (card.details.length > 0) {
      const list = el(
        "ul",
        `flex flex-col gap-2 ${card.message !== "" ? "mt-3" : ""}`,
      );
      for (const failure of card.details) {
        const row = el("li", "flex flex-col gap-0.5");
        if (failure.file !== "") {
          const name = el("p", "truncate text-secondary font-medium text-text");
          name.textContent = failure.file;
          name.title = failure.file;
          row.append(name);
        }
        const reason = el("p", "text-micro text-text-muted");
        reason.textContent = failure.reason;
        row.append(reason);
        list.append(row);
      }
      body.push(list);
    }
    this.body.replaceChildren(...body);

    // The primary action, if any: open the map when something landed. It pairs
    // with Done as two equal pills; a plain outcome gets a lone full-width Done.
    // (The logged-out path no longer reaches here — the toast shows its inline
    // Connect card instead, see renderSignIn.)
    const primary =
      card.showMapLink && mapId !== null
        ? { href: successDeepLink(mapId), label: "Open your map" }
        : null;

    if (primary) {
      this.footer.replaceChildren(
        button(`${buttonClass({ emphasis: "secondary" })} flex-1`, "Done", () =>
          this.dismiss(),
        ),
        anchorButton(
          primary.href,
          primary.label,
          `${buttonClass({ tone: "primary" })} flex-1 no-underline`,
        ),
      );
    } else {
      this.footer.replaceChildren(
        button(`${buttonClass({ tone: "primary" })} flex-1`, "Done", () =>
          this.dismiss(),
        ),
      );
    }

    if (card.tone === "error") {
      this.countdown = null;
      this.hideBar();
    } else {
      this.countdown = startCountdown(COUNTDOWN_MS, now());
      this.showBarIfRunning();
    }
  }

  private mapName(mapId: number): string {
    return this.maps.find((map) => map.id === mapId)?.name ?? "your map";
  }

  // ─── Countdown / interaction ───────────────────────────────────────────────

  private setPhase(phase: ToastPhase): void {
    this.phase = phase;
    this.card.dataset.phase = phase;
  }

  private pause(): void {
    if (this.countdown?.status === "running") {
      this.countdown = pauseCountdown(this.countdown, now());
      this.reflectCountdown();
      // The bar is frozen while paused — stop the rAF loop; resume restarts it.
      this.stopTicking();
    }
  }

  private resume(): void {
    if (this.countdown?.status === "paused") {
      this.countdown = resumeCountdown(this.countdown, now());
      this.reflectCountdown();
      this.startTicking();
    }
  }

  private engage(): void {
    if (this.countdown !== null && this.countdown.status !== "canceled") {
      this.countdown = cancelCountdown(this.countdown);
      this.reflectCountdown();
      this.hideBar();
      this.stopTicking();
    }
  }

  private showBarIfRunning(): void {
    this.reflectCountdown();
    if (this.countdown?.status === "running") {
      this.bar.classList.remove("is-hidden");
      this.startTicking();
    }
  }

  private hideBar(): void {
    this.bar.classList.add("is-hidden");
    this.stopTicking();
    this.reflectCountdown();
  }

  private reflectCountdown(): void {
    this.card.dataset.countdown = this.countdown?.status ?? "none";
  }

  private startTicking(): void {
    if (this.raf === null) {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private stopTicking(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private readonly tick = (): void => {
    if (this.countdown === null) {
      this.raf = null;
      return;
    }
    const t = now();
    this.bar.style.transform = `scaleX(${countdownRemainingFraction(this.countdown, t)})`;
    if (isCountdownElapsed(this.countdown, t)) {
      this.raf = null;
      this.dismiss();
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private dismiss(): void {
    // Can't dismiss mid-upload: the request is in flight and dropping the card
    // would strand it with no result surfaced.
    if (this.phase === "sending") {
      return;
    }
    this.stopTicking();
    if (prefersReducedMotion()) {
      this.remove();
      return;
    }
    this.card.classList.remove("ctm-toast-enter");
    this.card.classList.add("ctm-toast-leave");
    this.card.addEventListener("animationend", () => this.remove(), {
      once: true,
    });
  }

  private remove(): void {
    this.disposed = true;
    this.card.remove();
    this.onDispose();
  }
}

function toInput(file: DetectedFile): UploadFileInput {
  const input: UploadFileInput = {
    filename: file.filename,
    format: file.format,
    url: file.url,
  };
  if (file.bytesBase64 !== undefined) {
    input.bytesBase64 = file.bytesBase64;
  }
  return input;
}

function isSameOrigin(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).origin === location.origin;
  } catch {
    return false;
  }
}

// The host (with port, if any) shown as the file's source. Falls back to the raw
// string if it somehow doesn't parse — messages are validated before they reach
// here, so that's belt-and-suspenders.
function hostForDisplay(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return rawUrl;
  }
}

// Reads a same-origin file from the content script — cookies included, no host
// permission. Returns null on any failure (including a navigation-aborted fetch).
async function fetchBlob(rawUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(rawUrl, { credentials: "include" });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

function retryFetchBlob(rawUrl: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    setTimeout(
      () => void fetchBlob(rawUrl).then(resolve),
      FETCH_RETRY_DELAY_MS,
    );
  });
}

// Reads a same-origin file and returns its base64 bytes, or null if it can't be
// read or encoded (retrying once through the Firefox fetch-abort race). The
// pre-validation and Send paths both need this exact fetch → retry → encode
// sequence.
async function fetchAndEncodeBlob(rawUrl: string): Promise<string | null> {
  const blob = (await fetchBlob(rawUrl)) ?? (await retryFetchBlob(rawUrl));
  if (!blob) {
    return null;
  }
  try {
    return await blobToBase64(blob);
  } catch (error) {
    console.error("[ctm] encode failed", error);
    return null;
  }
}

// Base64 via native FileReader rather than typed-array access, so it works
// inside Firefox's content-script Xray membrane.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function now(): number {
  return performance.now();
}

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

function button(
  className: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function anchor(href: string, text: string): HTMLAnchorElement {
  const node = document.createElement("a");
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  node.className = "text-magenta-700 underline";
  node.textContent = text;
  return node;
}

// An anchor wearing a button look — for the "Open your map" action, which
// navigates rather than runs a handler.
function anchorButton(
  href: string,
  text: string,
  className: string,
): HTMLAnchorElement {
  const node = document.createElement("a");
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  node.className = className;
  node.textContent = text;
  return node;
}

function spinnerRow(label: string): HTMLElement {
  const row = el("div", "flex items-center gap-3");
  const spinner = el("div", spinnerClass);
  const text = el("span", "text-secondary text-text");
  text.textContent = label;
  row.append(spinner, text);
  return row;
}
