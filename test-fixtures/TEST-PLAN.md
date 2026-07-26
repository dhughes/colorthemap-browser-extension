# Manual test plan

Covers Chrome, Edge, and Firefox: the local fixtures first, then real GPS sites.
Written for the [#23](https://github.com/dhughes/colorthemap-browser-extension/issues/23)
cross-origin re-fetch work, but Part 2 is the general detection/upload pass.

Detector-layer code depends on real browser APIs, which is why this is manual —
Vitest can mock `chrome.*`, but the integration is what actually matters.

---

## The one idea that makes the rest readable

A detected file reaches Color The Map by one of two paths, and **the toast tells
you which one** — it names the file's source host ("from cdn.example.com").

| Toast says | Path | What's being tested |
| --- | --- | --- |
| the host you're already on | Content script read the bytes itself | Ordinary detection + upload |
| a **different** host | **Background re-fetches with your cookies** | The #23 path — SSRF guard applies |

Everything in Part 3 (cross-origin) and the interesting half of Part 4
(real-world) is about that second row. There is **no permission prompt** in
either path any more — if you ever see the browser ask for site access mid-send,
that's a regression worth reporting.

---

## Part 0 — One-time setup

1. **Hosts file** (needed for the cross-origin fixture; remove when done):

   ```sh
   sudo sh -c 'echo "127.0.0.1  ctm-page.test  ctm-files.test" >> /etc/hosts'
   ```

2. **Local TLS trust**, so Firefox and Chrome accept the fixture cert:

   ```sh
   brew install mkcert nss   # nss is what teaches Firefox to trust it
   mkcert -install
   ```

3. **Build.** `dist/` is git-ignored — only a build updates it, so do this after
   *every* code change, before reloading the extension:

   ```sh
   npm run build
   ```

4. **Serve the fixtures** (two terminals, or two background jobs):

   ```sh
   npm run fixtures         # http  → localhost:8080   (same-origin fixtures)
   npm run fixtures:https   # https → localhost:8443   (cross-origin fixtures)
   ```

   The first `fixtures:https` run generates a cert into `test-fixtures/.certs/`.

5. **A Color The Map account** signed in, with **at least two maps** — the map
   picker only renders when you have more than one, so two maps exercise more UI.

> **Why the cross-origin fixture must be https:** Firefox's default MV3 extension
> CSP includes `upgrade-insecure-requests`, which silently rewrites the
> background's `http://` re-fetches to `https://`. Against a plain-http fixture
> host those can only fail. This bit us for days — an http rig makes Firefox look
> broken when it isn't.

---

## Part 1 — Load the extension

Run the whole plan in one browser, then repeat in the next. Chrome and Edge are
both Chromium and should behave identically; any divergence between them is
itself a finding.

**Chrome** — `chrome://extensions` → **Developer mode** on → **Load unpacked** →
pick the `dist/chrome` **folder**.

**Edge** — `edge://extensions` → same flow → pick `dist/edge`.

**Firefox** — `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on…** → pick `dist/firefox/manifest.json` (the **file**, not the folder).
Temporary add-ons vanish when Firefox closes; after a rebuild, hit **Reload** on
the extension's row.

Sanity check before going further: open any page and confirm
`[CTM Importer scaffold alive] content on …` appears in its console.

---

## Part 2 — Same-origin fixtures (`http://localhost:8080/`)

This is the baseline: the content script reads every file itself, and the
background never re-fetches. Every toast should say **"from localhost"**.

Each sample offers up to three triggers — **link** (Detector C, flags by URL
only), **fetch** and **XHR** (Detector A, intercepts and reads the bytes).

| # | Section | Do | Expect |
| --- | --- | --- | --- |
| 2.1 | Valid samples | Every trigger, for all five formats (GPX, FIT, TCX, KML, KMZ) | Toast every time → pick a map → **Send** → track lands in that map within seconds |
| 2.2 | Client-side rejects | The **fetch / XHR** buttons | **No toast** — Detector A read the bytes and rejected on content |
| 2.3 | Client-side rejects | The **link** | Toast appears (URL-only flag), but **Send** fails locally: "couldn't be imported", no upload, nothing reaches CTM |
| 2.4 | Server-side rejects | Any trigger, then **Send** | Upload happens; CTM finds no track and returns an error the toast shows **verbatim** |
| 2.5 | Detector C dynamic link | Click **Add a valid.gpx link via JS**, then the new link | Toast appears — the MutationObserver wired it on insertion |
| 2.6 | Negatives (`negatives/`) | The **fetch / XHR** buttons | **No toast** for any of them |

Also worth a look while you're here:

- **"+ save"** triggers write the file to disk like a real Export button. The
  extension should neither cause nor block that save.
- Let a toast sit untouched — it auto-dismisses after ~10s. Hovering pauses the
  countdown; clicking into it cancels the countdown outright.
- Each detected file gets **its own card**. Trigger two different files quickly
  and you should get two cards, not one merged one.

> The fixture page's own copy still says "dialog" in places — that's this toast.
> Stale wording, not a different surface.

---

## Part 3 — Cross-origin re-fetch + SSRF guard (`https://ctm-page.test:8443/xorigin.html`)

The heart of #23. Here the page and the files are on **different hosts**, so the
content script can't read the bytes (CORS) and the background re-fetches the URL
with your cookies. That's a page-controlled URL being fetched by privileged
code — hence the guard.

### 3.1 Cross-origin import works, with no prompt

Click **valid.gpx from ctm-files.test** → the file opens in a new tab and the
toast appears on the fixture page.

- Toast says **"from ctm-files.test"** (different host → re-fetch path ✔)
- **Send** → imports successfully
- **No permission prompt at any point.** A prompt here is a regression.

Repeat with the **files.lvh.me** link (public DNS → 127.0.0.1, no hosts file
needed). Some corporate networks block `*.lvh.me` resolution; skip it if so.

### 3.2 Internal targets are refused before any request

Each of these should produce a toast, and then **"couldn't be imported"** on
Send:

- `127.0.0.1` (loopback — **the file really exists there**, so a block proves the
  guard, not a dead link)
- `169.254.169.254` (cloud metadata, link-local)
- `192.168.1.1` (typical router, private)

**Prove nothing was fetched**, don't just trust the error message:

- Chrome/Edge: `chrome://extensions` → this extension → **service worker** →
  DevTools → **Network** → there is **no** request to that address.
- Firefox: `about:debugging` → **Inspect** → Network tab, same check.

You should also see `[ctm] refusing unsafe re-fetch target <url>` in the
background console. All three failures show the *same* generic message on
purpose — a distinct "host unreachable" vs "not a GPS file" would hand a
malicious page an alive/dead probe of your network.

### 3.3 The opt-in relaxes it (and only it)

Open the options page — **click the extension's toolbar icon** (it has no popup;
clicking it goes straight to options) — then *Dangerous features* → enable
**"Allow importing from private network addresses."**

- Retry the `127.0.0.1` link → now it **imports**.
- Turn it back off and confirm the block returns.

### 3.4 The page can't read the toast

With a toast open, run this in the **page's** console (not the extension's):

```js
document.querySelector('ctm-upload-toast').shadowRoot
```

Expect `null` — the shadow root is closed, so a hostile page can't read what the
toast is showing or which files were detected.

---

## Part 4 — Real sites

The fixtures can't reproduce everything real sites do: odd content types, POST →
blob downloads, extension-less export URLs, CDN hosts, redirects. This part is
exploratory — the goal is coverage of *shapes*, and the finding is often "site X
uses a URL shape we don't recognize."

**For each site, record three things:** did a toast appear, what host did it say
"from", and did Send succeed.

That middle one is the interesting column — it tells you whether the site
exercised the ordinary path or the #23 re-fetch path. A site whose files live on
a CDN (`files.<site>.com`, `*.cloudfront.net`, `*.s3.amazonaws.com`) is the
real-world version of Part 3.

### Suggested sites

| Site | How to export | Why it's interesting |
| --- | --- | --- |
| **Strava** | Activity → **…** menu → *Export GPX* (also *Export original* / TCX where offered) | The most common real source; navigation download → Detector B |
| **Komoot** | Tour → download / export GPX | Your original motivating example — check whether files come from a separate host |
| **Garmin Connect** | Activity → gear icon → *Export to GPX* / *Export original* (FIT) | Exercises FIT, and a heavily JS-driven export |
| **Ride with GPS** | Route/ride → *Export* → GPX / TCX / FIT | Multiple formats behind one menu |
| **Wikiloc** | Trail → *Download* → GPX/KML | KML/KMZ coverage, which is thin elsewhere |
| **Polar Flow**, **MapMyFitness** | Export from an activity | Named in `detection-url.ts` for their extension-less URLs (`?format=`, `/export/<id>/tcx`) — direct regression targets for `linkDownloadFormat` |

I can't promise each site's current export UI or paywall status — several have
moved GPX export behind subscriptions over the years. Test whichever you have
accounts for; the shapes matter more than the specific brands.

### A no-login cross-origin check

If you want one deterministic real-internet cross-origin test, open a GitHub repo
containing `.gpx` files and click the **Raw** button — for example
`tkrajina/gpxpy` → `test_files/cerknicko-jezero.gpx`. The raw link points at
`raw.githubusercontent.com`, a genuinely different host from `github.com`, so a
toast reading **"from raw.githubusercontent.com"** is the cross-origin path
working against a real CDN. (If GitHub's Raw button is JS-driven rather than a
plain anchor in their current UI, Detector C won't see it — that's a GitHub
implementation detail, not an extension bug. Skip it and rely on Part 3.)

### What counts as a finding vs. expected

- **No toast at all** → the URL shape wasn't recognized. Capture the exact
  download URL and the `Content-Type`; that's a `detection-url.ts` /
  `classify.ts` improvement, and it's the most valuable thing you can bring back.
- **Toast, but Send fails** → capture the background console error. Distinguish
  CTM rejecting the file (server error, shown verbatim) from a re-fetch failure
  (generic "couldn't be imported").
- **A toast for something that isn't a GPS file** → expected and harmless if
  Send then rejects it locally. That's the design: Detector C flags by URL,
  content is validated at send.

---

## Part 5 — When something fails, look here

| Browser | Background console | Content-script console |
| --- | --- | --- |
| Chrome / Edge | `chrome://extensions` (or `edge://`) → **service worker** link | The page's own DevTools console |
| Firefox | `about:debugging#/runtime/this-firefox` → **Inspect** | The page's own DevTools console |

Useful markers: `[ctm]` prefixes every extension log; `[detector:B] would send …`
confirms the downloads API saw the file; `[ctm] refusing unsafe re-fetch target`
is the SSRF guard doing its job.

**Before filing anything, rebuild and reload.** A stale `dist/` explains a
startling share of "regressions" — `npm run build`, then reload the extension
(Chrome/Edge: the ↻ on its card; Firefox: **Reload** in `about:debugging`).

---

## Expected browser differences

These are known and **not** bugs:

- **Firefox upgrades background `http://` re-fetches to `https://`** (MV3 CSP).
  A real site serving files over plain http will fail to import in Firefox and
  work in Chrome. Rare in 2026, but that's the explanation if you hit it.
- **Firefox temporary add-ons disappear** when the browser closes.
- **Firefox site access can be partial.** If you've narrowed the extension's site
  access, a granted page linking a file on a *non-granted* host fails the
  re-fetch and shows the generic "couldn't be imported" — indistinguishable from
  a dead link. Known rough edge; a follow-up issue covers better copy.
- **Chrome and Edge should be identical.** Any difference is a real finding.

---

## Cleanup

```sh
# stop both fixture servers, then:
sudo sed -i '' '/ctm-page.test  ctm-files.test/d' /etc/hosts
```

Turn the *Allow importing from private network addresses* toggle back **off** if
you left it on, and remove the unpacked extension if you don't want it loaded
day to day.
