// SSRF guard for the background's cross-origin re-fetch. The re-fetch target
// comes from page-controlled content (a link href), and the background fetches
// it with the user's cookies and CORS bypassed — so an unvalidated URL lets a
// malicious page aim that reach at the user's own machine or LAN. We refuse
// loopback / link-local / private / non-http(s) targets before ever fetching.
//
// We classify off the WHATWG URL's *normalized* hostname, which collapses
// decimal/hex/octal IPv4 obfuscation (e.g. http://2130706433/) to dotted-decimal
// and canonicalizes IPv6 — so those tricks can't slip past a string check.
//
// Limitation: a hostname that *resolves* to an internal IP (DNS rebinding) isn't
// caught here — we can't resolve DNS before fetching. The runtime host-permission
// prompt remains the backstop for that case.

interface RefetchSafetyOptions {
  // When true (the buried "dangerous features" opt-in), private/loopback hosts
  // are allowed — for local dev testing and rare self-hosted sources. The
  // http(s)-only rule still holds.
  allowPrivate: boolean;
}

export function isSafeRefetchTarget(
  url: string,
  { allowPrivate }: RefetchSafetyOptions,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  if (allowPrivate) {
    return true;
  }
  return !isPrivateHost(parsed.hostname);
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".home.arpa") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  if (host.startsWith("[") && host.endsWith("]")) {
    return isPrivateIpv6(host.slice(1, -1));
  }

  const v4 = parseIpv4(host);
  if (v4) {
    return isPrivateIpv4(v4);
  }

  return false;
}

type Ipv4 = [number, number, number, number];

function parseIpv4(host: string): Ipv4 | null {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const n = Number(part);
    if (n > 255) {
      return null;
    }
    octets.push(n);
  }
  return octets as Ipv4;
}

function isPrivateIpv4([a, b]: Ipv4): boolean {
  if (a === 127 || a === 0) return true; // loopback 127/8, "this host" 0/8
  if (a === 10) return true; // 10/8
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local 169.254/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

function isPrivateIpv6(inner: string): boolean {
  const groups = expandIpv6(inner);
  if (!groups || groups.length !== 8) {
    return true; // fail closed on a bracketed host we can't parse
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    if (g6 === 0 && (g7 === 0 || g7 === 1)) return true; // :: and ::1
  }
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0xffff
  ) {
    // ::ffff:a.b.c.d — an IPv4-mapped address; classify the embedded IPv4.
    return isPrivateIpv4([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]);
  }
  return false;
}

function expandIpv6(inner: string): number[] | null {
  let s = inner.toLowerCase();

  // A trailing dotted-quad (::ffff:127.0.0.1) becomes two hex groups.
  const lastColon = s.lastIndexOf(":");
  if (lastColon !== -1 && s.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(s.slice(lastColon + 1));
    if (!v4) {
      return null;
    }
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) {
    return null;
  }

  const toGroups = (side: string): number[] | null => {
    if (side === "") {
      return [];
    }
    const out: number[] = [];
    for (const part of side.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) {
        return null;
      }
      out.push(parseInt(part, 16));
    }
    return out;
  };

  const head = toGroups(halves[0]!);
  const tail = halves.length === 2 ? toGroups(halves[1]!) : [];
  if (head === null || tail === null) {
    return null;
  }

  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) {
      return null;
    }
    return [...head, ...new Array<number>(missing).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}
