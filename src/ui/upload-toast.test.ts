// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../styles/shadow.css?inline", () => ({ default: "" }));
vi.mock("../upload/last-map", () => ({
  getLastMapForHost: vi.fn(async () => null),
  setLastMapForHost: vi.fn(async () => undefined),
}));
vi.mock("../shared/settings", () => ({
  getAllowPrivateHosts: vi.fn(async () => false),
}));
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
      getURL: (path: string) => `chrome-extension://ext/${path}`,
    },
    permissions: { request: vi.fn(async () => true) },
  },
}));

import browser from "webextension-polyfill";
import {
  openUploadToast,
  requestUploadToast,
  type DetectedFile,
} from "./upload-toast";

const sendMessage = vi.mocked(browser.runtime.sendMessage);
const permissionsRequest = vi.mocked(browser.permissions.request);

const HOST = "ctm-upload-toast";

// The toast's shadow root is closed, so host.shadowRoot is null from the outside
// (the point of the hardening). Capture the root the controller creates by
// spying attachShadow, so tests can still inspect the rendered cards.
let capturedShadow: ShadowRoot | null = null;
let attachShadowSpy: ReturnType<typeof vi.spyOn> | null = null;

// happy-dom's rAF would keep re-scheduling the drain loop; the tick only drives
// the bar visual (covered by pure countdown tests), so stub it inert here.
beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })), // reduced motion → dismissal is synchronous
  );
  capturedShadow = null;
  const realAttachShadow = Element.prototype.attachShadow;
  attachShadowSpy = vi
    .spyOn(Element.prototype, "attachShadow")
    .mockImplementation(function (this: Element, init: ShadowRootInit) {
      const root = realAttachShadow.call(this, init);
      capturedShadow = root;
      return root;
    });
  sendMessage.mockReset();
  permissionsRequest.mockReset().mockResolvedValue(true);
  currentUpload = undefined;
  mapsResult({ ok: true, maps: [{ id: 1, name: "Trails" }] });
});

// Same-origin URLs must match happy-dom's actual page origin, whatever it is.
const local = (path: string): string => `${location.origin}/${path}`;

afterEach(() => {
  document.querySelector(HOST)?.remove();
  vi.unstubAllGlobals();
  attachShadowSpy?.mockRestore();
  attachShadowSpy = null;
});

let currentMaps: unknown;
let currentUpload: unknown;

function mapsResult(result: unknown): void {
  currentMaps = result;
  wireSendMessage();
}

function uploadResult(result: unknown): void {
  currentUpload = result;
  wireSendMessage();
}

function wireSendMessage(): void {
  sendMessage.mockImplementation(async (message: unknown) => {
    const type = (message as { type: string }).type;
    if (type === "ctm:list-maps") return currentMaps;
    if (type === "ctm:upload") return currentUpload;
    return undefined;
  });
}

function host(): HTMLElement {
  const el = document.querySelector(HOST);
  if (!el) throw new Error("no toast host mounted");
  return el as HTMLElement;
}

function cards(): HTMLElement[] {
  if (!capturedShadow) throw new Error("no shadow root captured");
  return [...capturedShadow.querySelectorAll<HTMLElement>("[data-phase]")];
}

function newestCard(): HTMLElement {
  const list = cards();
  return list[list.length - 1]!;
}

function q<T extends Element = HTMLElement>(root: ParentNode, sel: string): T {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`missing element: ${sel}`);
  return found;
}

const file = (over: Partial<DetectedFile> = {}): DetectedFile => ({
  url: "http://localhost/route.gpx",
  filename: "route.gpx",
  format: "gpx",
  bytesBase64: "PGdweC8+",
  ...over,
});

async function waitForPhase(card: HTMLElement, phase: string): Promise<void> {
  await vi.waitFor(() => expect(card.dataset.phase).toBe(phase));
}

describe("mounting", () => {
  it("mounts one click-through host with a closed shadow root", async () => {
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    expect(host().style.pointerEvents).toBe("none");
    // Closed: the page can't read the toast through host.shadowRoot.
    expect(host().shadowRoot).toBeNull();
    expect(capturedShadow).toBeTruthy();
    expect(newestCard().classList.contains("pointer-events-auto")).toBe(true);
  });

  it("names each file's source host in the offer", async () => {
    openUploadToast(
      file({ url: "https://cdn.example.com/track.gpx", filename: "track.gpx" }),
    );
    await waitForPhase(newestCard(), "offer");

    expect(newestCard().textContent).toContain("from cdn.example.com");
  });

  it("never attaches a document-level keydown listener (Esc stays scoped to the card)", async () => {
    const spy = vi.spyOn(document, "addEventListener");
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    const keydownOnDocument = spy.mock.calls.filter(
      ([type]) => type === "keydown",
    );
    expect(keydownOnDocument).toHaveLength(0);
  });
});

describe("offer", () => {
  it("shows a single-map name and a running countdown", async () => {
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    expect(newestCard().textContent).toContain("Found a GPS file");
    expect(newestCard().textContent).toContain("Trails");
    expect(newestCard().querySelector("select")).toBeNull();
    expect(newestCard().dataset.countdown).toBe("running");
  });

  it("offers a picker when the user has several maps", async () => {
    mapsResult({
      ok: true,
      maps: [
        { id: 1, name: "Trails" },
        { id: 7, name: "Rides" },
      ],
    });
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    const select = q<HTMLSelectElement>(newestCard(), "select");
    expect(select.options).toHaveLength(2);
  });

  it("points at Color The Map when the user has no maps", async () => {
    mapsResult({ ok: true, maps: [] });
    openUploadToast(file());
    await waitForPhase(newestCard(), "no-maps");

    expect(newestCard().textContent).toContain("Create a map");
  });
});

describe("one card per file", () => {
  it("opens a separate card for each distinct file (singular copy)", async () => {
    openUploadToast(file({ url: "http://localhost/a.gpx", filename: "a.gpx" }));
    await waitForPhase(newestCard(), "offer");

    openUploadToast(file({ url: "http://localhost/b.gpx", filename: "b.gpx" }));
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    await waitForPhase(newestCard(), "offer");

    const texts = cards().map((c) => c.textContent ?? "");
    expect(texts.some((t) => t.includes("a.gpx"))).toBe(true);
    expect(texts.some((t) => t.includes("b.gpx"))).toBe(true);
    // Each card offers exactly one file — no accumulated "Found 2" batch.
    expect(newestCard().textContent).toContain("Found a GPS file");
    expect(newestCard().textContent).toContain("Send");
  });

  it("dedupes a repeated URL (no second card)", async () => {
    openUploadToast(file({ url: "http://localhost/a.gpx" }));
    await waitForPhase(newestCard(), "offer");

    openUploadToast(file({ url: "http://localhost/a.gpx" }));

    expect(cards()).toHaveLength(1);
    expect(q(newestCard(), "ul").children).toHaveLength(1);
  });

  it("leaves an engaged card untouched when a new file arrives", async () => {
    openUploadToast(file({ url: "http://localhost/a.gpx", filename: "a.gpx" }));
    await waitForPhase(newestCard(), "offer");
    const firstCard = newestCard();
    firstCard.dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(firstCard.dataset.countdown).toBe("canceled");

    openUploadToast(file({ url: "http://localhost/b.gpx", filename: "b.gpx" }));
    await vi.waitFor(() => expect(cards()).toHaveLength(2));

    // The new file is its own card; the engaged one is not rebuilt or restarted.
    expect(newestCard()).not.toBe(firstCard);
    expect(firstCard.dataset.countdown).toBe("canceled");
    expect(q(firstCard, "ul").children).toHaveLength(1);
  });
});

describe("interaction", () => {
  it("pauses the countdown on hover and resumes on leave", async () => {
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");
    expect(newestCard().dataset.countdown).toBe("running");

    newestCard().dispatchEvent(new Event("mouseenter"));
    expect(newestCard().dataset.countdown).toBe("paused");

    newestCard().dispatchEvent(new Event("mouseleave"));
    expect(newestCard().dataset.countdown).toBe("running");
  });

  it("cancels the countdown and hides the bar once the user engages", async () => {
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    newestCard().dispatchEvent(new Event("focusin", { bubbles: true }));

    expect(newestCard().dataset.countdown).toBe("canceled");
    expect(
      q(newestCard(), ".ctm-toast-bar").classList.contains("is-hidden"),
    ).toBe(true);
  });

  it("dismisses on Escape from within the card", async () => {
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    q(newestCard(), "[aria-label='Dismiss']").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(document.querySelector(HOST)).toBeNull();
  });
});

describe("send", () => {
  it("uploads and morphs into a success card with a map link", async () => {
    uploadResult({
      status: "done",
      uploaded: 1,
      duplicates: 0,
      failed: 0,
      total: 1,
      errors: [],
    });
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    q(newestCard(), "button.bg-magenta-500").click();
    await waitForPhase(newestCard(), "success");

    expect(newestCard().textContent).toContain("You're on the map");
    const link = q<HTMLAnchorElement>(newestCard(), "a[href*='/maps/1']");
    expect(link.textContent).toContain("Open your map");
  });

  it("requests permission for only its own cross-origin host", async () => {
    uploadResult({
      status: "done",
      uploaded: 1,
      duplicates: 0,
      failed: 0,
      total: 1,
      errors: [],
    });
    openUploadToast(
      file({ url: "https://a.example/x.gpx", bytesBase64: undefined }),
    );
    await waitForPhase(newestCard(), "offer");
    openUploadToast(
      file({ url: "https://b.example/y.gpx", bytesBase64: undefined }),
    );
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    await waitForPhase(newestCard(), "offer");

    // Each file is its own card, so sending one asks for just that host.
    q(newestCard(), "button.bg-magenta-500").click();
    await waitForPhase(newestCard(), "success");

    expect(permissionsRequest).toHaveBeenCalledTimes(1);
    expect(permissionsRequest).toHaveBeenCalledWith({
      origins: ["https://b.example/*"],
    });
  });

  it("shows a friendly error when the upload fails", async () => {
    uploadResult({ status: "error", reason: "network" });
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    q(newestCard(), "button.bg-magenta-500").click();
    await waitForPhase(newestCard(), "error");

    expect(newestCard().textContent?.toLowerCase()).toContain("connection");
    expect(newestCard().dataset.countdown).toBe("none");
  });

  it("presents a rejected file as a name-over-reason row", async () => {
    uploadResult({
      status: "done",
      uploaded: 0,
      duplicates: 0,
      failed: 1,
      total: 1,
      errors: ["server-reject.gpx: couldn't read a track from the file"],
    });
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    q(newestCard(), "button.bg-magenta-500").click();
    await waitForPhase(newestCard(), "error");

    expect(newestCard().textContent).toContain("Couldn't add that file");
    const rows = newestCard().querySelectorAll("li");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("server-reject.gpx");
    expect(rows[0]!.textContent).toContain("couldn't read a track");
  });

  it("blames the connection, not permissions, when a same-origin file can't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    openUploadToast(file({ url: local("local.gpx"), bytesBase64: undefined }));
    await waitForPhase(newestCard(), "offer");

    q(newestCard(), "button.bg-magenta-500").click();
    await waitForPhase(newestCard(), "error");

    const text = newestCard().textContent?.toLowerCase() ?? "";
    expect(text).toContain("connection");
    expect(text).not.toContain("permission");
  });
});

describe("sign-in flow (#19)", () => {
  // Wires the four message types the sign-in flow exercises. `signedIn` and
  // `startAuth` are mutable so a test can flip auth state as the flow runs.
  function wire(opts: {
    signedIn: () => boolean;
    onStartAuth?: () => void;
    upload?: () => unknown;
  }): void {
    sendMessage.mockImplementation(async (message: unknown) => {
      const type = (message as { type: string }).type;
      if (type === "ctm:list-maps") {
        return opts.signedIn()
          ? { ok: true, maps: [{ id: 1, name: "Trails" }] }
          : { ok: false, reason: "sign-in-required" };
      }
      if (type === "ctm:start-auth") {
        opts.onStartAuth?.();
        return undefined;
      }
      if (type === "ctm:get-auth-state") {
        return opts.signedIn()
          ? { status: "authenticated", profile: {} }
          : { status: "unauthenticated" };
      }
      if (type === "ctm:upload") return opts.upload?.();
      return undefined;
    });
  }

  const connectButton = (card: HTMLElement): HTMLButtonElement =>
    q<HTMLButtonElement>(card, "button.bg-magenta-500");

  it("offers a Connect card — not an options anchor — when the user is signed out", async () => {
    wire({ signedIn: () => false });
    openUploadToast(file());
    await waitForPhase(newestCard(), "sign-in");

    expect(newestCard().textContent).toContain("Connect to Color The Map");
    expect(connectButton(newestCard()).textContent).toContain("Connect");
    expect(newestCard().querySelector("a[href*='options.html']")).toBeNull();
    // Idle Connect card auto-dismisses like the offer.
    expect(newestCard().dataset.countdown).toBe("running");
  });

  it("launches OAuth in place (no options-page hop) and lands on the offer once signed in", async () => {
    let signedIn = false;
    wire({
      signedIn: () => signedIn,
      onStartAuth: () => {
        signedIn = true;
      },
    });
    openUploadToast(file());
    await waitForPhase(newestCard(), "sign-in");

    connectButton(newestCard()).click();
    expect(newestCard().dataset.phase).toBe("authenticating");
    // Auto-dismiss is frozen while the user is away completing OAuth.
    expect(newestCard().dataset.countdown).toBe("none");

    await waitForPhase(newestCard(), "offer");
    expect(newestCard().textContent).toContain("Trails");
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ctm:start-auth", openOptions: false }),
    );
  });

  it("returns to a retriable Connect card when sign-in doesn't complete", async () => {
    wire({ signedIn: () => false });
    openUploadToast(file());
    await waitForPhase(newestCard(), "sign-in");

    connectButton(newestCard()).click();

    await vi.waitFor(() =>
      expect(newestCard().textContent?.toLowerCase()).toContain(
        "try connecting again",
      ),
    );
    expect(newestCard().dataset.phase).toBe("sign-in");
  });

  it("resumes the interrupted upload after signing in (token rejected mid-send)", async () => {
    let signedIn = true; // token present at mount, rejected at upload
    let uploadCalls = 0;
    wire({
      signedIn: () => signedIn,
      onStartAuth: () => {
        signedIn = true;
      },
      upload: () => {
        uploadCalls += 1;
        return uploadCalls === 1
          ? { status: "error", reason: "sign-in-required" }
          : {
              status: "done",
              uploaded: 1,
              duplicates: 0,
              failed: 0,
              total: 1,
              errors: [],
            };
      },
    });
    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");

    connectButton(newestCard()).click(); // Send
    await waitForPhase(newestCard(), "sign-in"); // upload came back 401

    connectButton(newestCard()).click(); // Connect
    await waitForPhase(newestCard(), "success");

    expect(newestCard().textContent).toContain("You're on the map");
    expect(uploadCalls).toBe(2); // the send was retried, not dropped
  });
});

describe("requestUploadToast (pre-validation)", () => {
  it("opens immediately for a cross-origin link, no fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await requestUploadToast({
      url: "https://other.example/x.gpx",
      filename: "x.gpx",
      format: "gpx",
    });
    await waitForPhase(newestCard(), "offer");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("won't re-offer a URL already showing in a card", async () => {
    openUploadToast(
      file({ url: "https://other.example/x.gpx", bytesBase64: undefined }),
    );
    await waitForPhase(newestCard(), "offer");

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await requestUploadToast({
      url: "https://other.example/x.gpx",
      filename: "x.gpx",
      format: "gpx",
    });

    expect(cards()).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offers a same-origin file only after its bytes sniff as the claimed format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<gpx></gpx>", { status: 200 })),
    );

    await requestUploadToast({
      url: local("local.gpx"),
      filename: "local.gpx",
      format: "gpx",
    });
    await waitForPhase(newestCard(), "offer");

    expect(newestCard().textContent).toContain("local.gpx");
  });

  it("discards a same-origin file whose bytes don't match the format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<!doctype html><html></html>", { status: 200 }),
      ),
    );

    await requestUploadToast({
      url: local("fake.gpx"),
      filename: "fake.gpx",
      format: "gpx",
    });

    expect(document.querySelector(HOST)).toBeNull();
  });
});

describe("stacking (a detection during send)", () => {
  it("stacks a fresh card instead of disturbing the in-flight batch", async () => {
    sendMessage.mockImplementation(async (message: unknown) => {
      const type = (message as { type: string }).type;
      if (type === "ctm:list-maps") return currentMaps;
      return new Promise(() => undefined); // upload stays in flight
    });

    openUploadToast(file({ url: "http://localhost/a.gpx", filename: "a.gpx" }));
    await waitForPhase(newestCard(), "offer");
    const firstCard = newestCard();
    q(firstCard, "button.bg-magenta-500").click();
    await waitForPhase(firstCard, "sending");

    openUploadToast(
      file({ url: "https://other.example/b.gpx", filename: "b.gpx" }),
    );
    await vi.waitFor(() => expect(cards()).toHaveLength(2));

    expect(firstCard.dataset.phase).toBe("sending");
    expect(firstCard.querySelector("ul")).toBeNull(); // its file list wasn't rebuilt
    expect(newestCard()).not.toBe(firstCard);
  });

  it("won't dismiss a card mid-upload", async () => {
    sendMessage.mockImplementation(async (message: unknown) => {
      const type = (message as { type: string }).type;
      if (type === "ctm:list-maps") return currentMaps;
      return new Promise(() => undefined); // never resolves
    });

    openUploadToast(file());
    await waitForPhase(newestCard(), "offer");
    const card = newestCard();
    q(card, "button.bg-magenta-500").click();
    await waitForPhase(card, "sending");

    q(card, "[aria-label='Dismiss']").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(document.querySelector(HOST)).not.toBeNull();
    expect(card.dataset.phase).toBe("sending");
  });
});
