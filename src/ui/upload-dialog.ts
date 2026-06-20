import browser from "webextension-polyfill";
import { CTM_BASE_URL } from "../auth/config";
import { bytesToBase64 } from "../shared/base64";
import { getFormatSpec, type GpsFormat } from "../shared/formats";
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
  // Detector A's intercepted bytes. When absent, the background re-fetches the
  // URL (Detector C link path) and the dialog must first secure host permission.
  bytes?: ArrayBuffer;
}

// Opens the "Send to Color The Map" dialog for one detected file. A DOM-level
// singleton: any open dialog is replaced, so Detectors A and C (separate
// content-script bundles) never stack two.
export function openUploadDialog(request: UploadDialogRequest): void {
  document.querySelector(HOST_TAG)?.remove();
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

    // Resolve the file bytes. Detector A already captured them. For a link, the
    // content script can read a same-origin file directly (cookies included, no
    // host permission). Only a genuinely cross-origin file needs the background
    // to re-fetch it, which requires a per-site host permission.
    let bytes = this.request.bytes;
    if (!bytes) {
      bytes = (await this.fetchSameOriginBytes()) ?? undefined;
      if (!bytes && !(await this.ensureHostPermission())) {
        this.renderResult({
          tone: "error",
          message: `Color The Map needs permission to read the file from ${new URL(this.request.url).host}.`,
        });
        return;
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
          bytesBase64: bytes ? bytesToBase64(bytes) : undefined,
        }),
      )) as UploadResult;
    } catch (error) {
      this.renderResult({ tone: "error", message: messageOf(error) });
      return;
    }
    this.renderResult(describeOutcome(result));
  }

  // Reads a same-origin file directly from the content script — cookies
  // included, no host permission. Returns null for cross-origin URLs or any
  // failure, so the caller can fall back to the permission + re-fetch path.
  private async fetchSameOriginBytes(): Promise<ArrayBuffer | null> {
    let url: URL;
    try {
      url = new URL(this.request.url);
    } catch {
      return null;
    }
    if (url.origin !== location.origin) {
      return null;
    }
    try {
      const response = await fetch(this.request.url, {
        credentials: "include",
      });
      return response.ok ? await response.arrayBuffer() : null;
    } catch {
      return null;
    }
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
