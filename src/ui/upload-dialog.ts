import browser from "webextension-polyfill";
import { CTM_BASE_URL } from "../auth/config";
import { base64ToBytes } from "../shared/base64";
import { getFormatSpec, type GpsFormat } from "../shared/formats";
import { matchesFormat } from "../shared/sniff";
import { getLastMapForHost, setLastMapForHost } from "../upload/last-map";
import {
  listMapsMessage,
  uploadMessage,
  type CtmMap,
  type ListMapsResult,
  type UploadResult,
} from "../upload/messages";
import { dialogCss } from "./dialog-css";
import { describeOutcome, resolveInitialMapId } from "./dialog-view";

const HOST_TAG = "ctm-upload-dialog";

export interface UploadDialogRequest {
  url: string;
  filename: string;
  format: GpsFormat;
  sourceHostname: string;
  // Detector A's intercepted body, base64-encoded. When absent, the dialog reads
  // a same-origin file directly (link path) or, failing that, the background
  // re-fetches the URL after a host permission is granted.
  bytesBase64?: string;
}

const HOST_URL_ATTR = "data-ctm-url";

// Validates a detected file BEFORE offering the dialog, then opens it (parity
// with Detector A, which content-checks up front). For a same-origin file the
// content script reads it and confirms the bytes match the claimed format — if
// not, no dialog; if so, the validated bytes ride into the dialog so Send needn't
// re-fetch. Bytes already in hand (Detector A) skip straight to opening.
//
// A cross-origin file can't be read here (CORS) → open and validate at Send.
//
// Firefox aborts an in-flight fetch when the link's own download starts in the
// same tick (Chrome doesn't), so the first same-origin read can fail spuriously.
// We retry once after the download has been dispatched — a fresh fetch then
// succeeds. Only a genuine read failure falls through to Detector B.
const inFlight = new Set<string>();

// Long enough for the link's download to be dispatched (after which a new fetch
// is no longer cancelled), short enough to keep the dialog feeling instant.
const FETCH_RETRY_DELAY_MS = 150;

function retryFetchBlob(rawUrl: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    setTimeout(
      () => void fetchBlob(rawUrl).then(resolve),
      FETCH_RETRY_DELAY_MS,
    );
  });
}

export async function requestUploadDialog(
  request: UploadDialogRequest,
): Promise<void> {
  if (request.bytesBase64 !== undefined) {
    openUploadDialog(request);
    return;
  }
  if (
    inFlight.has(request.url) ||
    document.querySelector(HOST_TAG)?.getAttribute(HOST_URL_ATTR) ===
      request.url
  ) {
    return;
  }
  if (!isSameOrigin(request.url)) {
    openUploadDialog(request);
    return;
  }

  inFlight.add(request.url);
  try {
    const blob =
      (await fetchBlob(request.url)) ?? (await retryFetchBlob(request.url));
    if (!blob) {
      // Couldn't read the file even after the retry — defer to Detector B (the
      // download), which validates without the race; opening here would skip
      // validation.
      return;
    }
    // Validate via the base64 string, not the blob's ArrayBuffer directly:
    // FileReader.readAsArrayBuffer yields a page-realm buffer in Firefox, and any
    // typed-array op on it trips the Xray membrane. readAsDataURL yields a string
    // (realm-safe), and base64ToBytes rebuilds content-realm bytes. Reuse the
    // base64 for the upload too.
    const bytesBase64 = await blobToBase64(blob);
    const head = new Uint8Array(base64ToBytes(bytesBase64)).subarray(0, 2048);
    if (!matchesFormat(head, request.format)) {
      return; // not actually this format — no dialog
    }
    openUploadDialog({ ...request, bytesBase64 });
  } catch (error) {
    console.error("[ctm] pre-validation failed", error);
  } finally {
    inFlight.delete(request.url);
  }
}

function isSameOrigin(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).origin === location.origin;
  } catch {
    return false;
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

// Opens the "Send to Color The Map" dialog for one detected file. A DOM-level
// singleton (works across the separate content-script bundles): if a dialog is
// already open for the SAME file it's left alone — this dedupes a Detector C
// link click against the Detector B download it triggers. A different file
// replaces whatever's open.
export function openUploadDialog(request: UploadDialogRequest): void {
  const existing = document.querySelector(HOST_TAG);
  if (existing?.getAttribute(HOST_URL_ATTR) === request.url) {
    return;
  }
  existing?.remove();
  new UploadDialog(request).mount();
}

class UploadDialog {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly body: HTMLElement;
  private readonly footer: HTMLElement;
  private maps: CtmMap[] = [];
  private selectedMapId: number | null = null;
  private sending = false;

  constructor(private readonly request: UploadDialogRequest) {
    this.host = document.createElement(HOST_TAG);
    this.host.setAttribute(HOST_URL_ATTR, request.url);
    // The dialog is injected into arbitrary pages and must sit above their own
    // modals. Pin the host to a max-z-index fixed layer (with !important to beat
    // aggressive site CSS); appended last in the DOM, it also wins z-index ties.
    this.host.style.cssText =
      "position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;";
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = dialogCss();

    const backdrop = el("div", "modal-backdrop");
    const card = el("div", "card modal-card modal-card-column");
    card.style.maxWidth = "420px";
    card.addEventListener("click", (event) => event.stopPropagation());

    const header = el("div", "modal-header");
    const title = el("h2", "modal-title");
    title.textContent = "Send to Color The Map";
    const close = button("btn btn-icon", "×", () => this.close());
    close.setAttribute("aria-label", "Close");
    header.append(title, close);

    this.body = el("div", "card-body");
    this.body.style.padding = "var(--space-xl)";
    this.footer = el("div", "action-row");
    this.footer.style.padding = "0 var(--space-xl) var(--space-xl)";

    card.append(header, this.body, this.footer);
    backdrop.append(card);
    backdrop.addEventListener("click", () => this.close());
    this.shadow.append(style, backdrop);
  }

  mount(): void {
    document.documentElement.append(this.host);
    document.addEventListener("keydown", this.onKeydown, true);
    void this.loadMaps();
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.close();
    }
  };

  private close(): void {
    // Can't dismiss mid-upload: the request is in flight and closing would
    // orphan it with no result surfaced.
    if (this.sending) {
      return;
    }
    document.removeEventListener("keydown", this.onKeydown, true);
    this.host.remove();
  }

  private async loadMaps(): Promise<void> {
    this.renderLoading();
    let result: ListMapsResult;
    try {
      result = (await browser.runtime.sendMessage(
        listMapsMessage(),
      )) as ListMapsResult;
    } catch (error) {
      console.error("[ctm] list maps failed", error);
      this.renderResult({ tone: "error", message: messageOf(error) });
      return;
    }
    if (!result.ok) {
      this.renderResult({ tone: "error", message: result.error });
      return;
    }
    if (result.maps.length === 0) {
      this.renderNoMaps();
      return;
    }
    this.maps = result.maps;
    this.selectedMapId = resolveInitialMapId(
      result.maps,
      await getLastMapForHost(this.request.sourceHostname),
    );
    this.renderForm();
  }

  private renderLoading(): void {
    this.body.replaceChildren(spinnerRow("Loading your maps…"));
    this.footer.replaceChildren();
  }

  private renderNoMaps(): void {
    const text = el("p");
    text.style.margin = "0";
    text.append(
      document.createTextNode("You don't have any maps yet. "),
      anchor(`${CTM_BASE_URL}/maps`, "Create one on Color The Map"),
      document.createTextNode(" first, then try again."),
    );
    this.body.replaceChildren(text);
    this.footer.replaceChildren(
      button("btn btn-primary", "Close", () => this.close()),
    );
  }

  private renderForm(): void {
    const summary = el("p");
    summary.style.margin = "0 0 var(--space-lg)";
    summary.append(
      document.createTextNode("Send "),
      strong(this.request.filename),
      document.createTextNode(
        ` (${getFormatSpec(this.request.format).label}) to:`,
      ),
    );

    this.body.replaceChildren(summary);

    if (this.maps.length === 1) {
      const only = el("p", "form-label");
      only.style.margin = "0";
      only.textContent = this.maps[0]!.name;
      this.body.append(only);
    } else {
      const select = document.createElement("select");
      select.className = "form-select";
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
      this.body.append(select);
    }

    const cancel = button("btn", "Cancel", () => this.close());
    const send = button("btn btn-primary", "Send to Color The Map", () => {
      void this.send();
    });
    this.footer.replaceChildren(cancel, send);
  }

  private async send(): Promise<void> {
    if (this.selectedMapId === null) {
      return;
    }
    const mapId = this.selectedMapId;

    // Resolve the file bytes as base64. Detector A already captured them. For a
    // link, read the same-origin file directly (cookies included, no host
    // permission) and encode via Blob + FileReader — manual typed-array access
    // trips Firefox's Xray membrane. Only a genuinely cross-origin file needs
    // the background to re-fetch it, which requires a per-site host permission.
    let bytesBase64 = this.request.bytesBase64;
    if (bytesBase64 === undefined) {
      const blob = isSameOrigin(this.request.url)
        ? await fetchBlob(this.request.url)
        : null;
      if (!blob && !(await this.ensureHostPermission())) {
        this.renderResult({
          tone: "error",
          message: `Color The Map needs permission to read the file from ${new URL(this.request.url).host}.`,
        });
        return;
      }
      if (blob) {
        try {
          bytesBase64 = await blobToBase64(blob);
        } catch (error) {
          console.error("[ctm] encode failed", error);
          this.renderResult({ tone: "error", message: messageOf(error) });
          return;
        }
      }
    }

    await setLastMapForHost(this.request.sourceHostname, mapId);
    this.renderSending();

    let result: UploadResult;
    try {
      result = (await browser.runtime.sendMessage(
        uploadMessage({
          mapId,
          filename: this.request.filename,
          format: this.request.format,
          url: this.request.url,
          bytesBase64,
        }),
      )) as UploadResult;
    } catch (error) {
      console.error("[ctm] upload request failed", error);
      this.renderResult({ tone: "error", message: messageOf(error) });
      return;
    }
    this.renderResult(describeOutcome(result));
  }

  private async ensureHostPermission(): Promise<boolean> {
    let origins: string[];
    try {
      // Match patterns can't carry a port — build from scheme+host only
      // (`http://127.0.0.1/*`, not `.../127.0.0.1:8080/*`). Host permissions are
      // per-host and ignore the port anyway.
      const { protocol, hostname } = new URL(this.request.url);
      origins = [`${protocol}//${hostname}/*`];
    } catch {
      return false;
    }
    // Call request() directly — no `contains()` pre-check. An intervening await
    // would drop the user-gesture token this prompt requires; request() already
    // resolves true without a prompt when the permission is held.
    try {
      return await browser.permissions.request({ origins });
    } catch (error) {
      console.warn("[ctm] host permission request failed", origins, error);
      return false;
    }
  }

  private renderSending(): void {
    this.sending = true;
    this.body.replaceChildren(spinnerRow("Sending…"));
    this.footer.replaceChildren();
  }

  private renderResult(copy: {
    tone: "success" | "error";
    message: string;
  }): void {
    // The terminal state — re-enable close (Done / Esc / backdrop).
    this.sending = false;
    const alert = el(
      "div",
      `alert ${copy.tone === "success" ? "alert-success" : "alert-error"}`,
    );
    alert.textContent = copy.message;
    this.body.replaceChildren(alert);
    this.footer.replaceChildren(
      button("btn btn-primary", "Done", () => this.close()),
    );
  }
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

function strong(text: string): HTMLElement {
  const node = document.createElement("strong");
  node.textContent = text;
  return node;
}

function anchor(href: string, text: string): HTMLAnchorElement {
  const node = document.createElement("a");
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  node.textContent = text;
  return node;
}

function spinnerRow(label: string): HTMLElement {
  const row = el("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "var(--space-md)";
  const spinner = el("div", "spinner");
  const text = el("span");
  text.textContent = label;
  row.append(spinner, text);
  return row;
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

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  // A rejected Error from the background context fails `instanceof Error` here
  // (different realm), so read its message structurally before giving up.
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Something went wrong.";
}
