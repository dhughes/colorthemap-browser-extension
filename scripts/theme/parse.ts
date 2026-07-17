// Purpose-built CSS text helpers for the theme generator — not a CSS parser.
// The CTM source files are small, stable, custom-property-block-shaped files,
// so comment/string-aware scanning covers every shape they contain.

export interface Declaration {
  name: string;
  value: string;
}

function findStringEnd(css: string, start: number): number {
  const quote = css[start]!;
  let i = start + 1;
  while (i < css.length) {
    if (css[i] === "\\") {
      i += 2;
      continue;
    }
    if (css[i] === quote) {
      return i + 1;
    }
    i++;
  }
  return css.length;
}

export function stripComments(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {
      const end = findStringEnd(css, i);
      out += css.slice(i, end);
      i = end;
      continue;
    }
    out += css[i];
    i++;
  }
  return out;
}

// Removes CTM's own leading "GENERATED FILE" banner so the emitted theme
// doesn't ship a regeneration instruction pointing at the wrong repo.
export function stripGeneratedBanner(css: string): string {
  if (!css.startsWith("/*")) {
    return css;
  }
  const end = css.indexOf("*/");
  if (end === -1 || !css.slice(0, end).includes("GENERATED FILE")) {
    return css;
  }
  return css.slice(end + 2).replace(/^\n+/, "");
}

// Appends :host to line-anchored :root selector lists so the same file styles
// real documents and shadow roots. Line-anchoring keeps :root mentions inside
// comment prose untouched.
export function rescopeRootSelectors(css: string): string {
  return css.replace(/^:root(\s*[,{])/gm, ":root,\n:host$1");
}

// The body of the first top-level `:root { ... }` block. Selector lists that
// merely contain :root (`:root, .a { }`) and :root blocks nested inside
// at-rules are both skipped.
export function extractFirstTopLevelRootBlock(css: string): string | null {
  const text = stripComments(css);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      i = findStringEnd(text, i) - 1;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 0 || !text.startsWith(":root", i)) {
      continue;
    }
    const prev = i === 0 ? "" : text[i - 1]!;
    if (prev !== "" && !/[\s};]/.test(prev)) {
      continue;
    }
    const opener = /^\s*\{/.exec(text.slice(i + ":root".length));
    if (!opener) {
      continue;
    }
    const bodyStart = i + ":root".length + opener[0].length;
    let blockDepth = 1;
    for (let j = bodyStart; j < text.length; j++) {
      const cj = text[j]!;
      if (cj === '"' || cj === "'") {
        j = findStringEnd(text, j) - 1;
        continue;
      }
      if (cj === "{") {
        blockDepth++;
      } else if (cj === "}") {
        blockDepth--;
        if (blockDepth === 0) {
          return text.slice(bodyStart, j);
        }
      }
    }
    return null;
  }
  return null;
}

// Custom-property declarations from a block body, in source order, with
// values normalized to single-spaced text. Splits on top-level semicolons
// only, so calc()/color-mix()/font-stack commas and parens stay intact.
export function parseDeclarations(body: string): Declaration[] {
  const text = stripComments(body);
  const decls: Declaration[] = [];
  let current = "";
  let parenDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      const end = findStringEnd(text, i);
      current += text.slice(i, end);
      i = end - 1;
      continue;
    }
    if (ch === "(") {
      parenDepth++;
    } else if (ch === ")") {
      parenDepth--;
    } else if (ch === ";" && parenDepth === 0) {
      pushDeclaration(decls, current);
      current = "";
      continue;
    }
    current += ch;
  }
  pushDeclaration(decls, current);
  return decls;
}

function pushDeclaration(decls: Declaration[], raw: string): void {
  const match = /^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(raw);
  if (match) {
    decls.push({ name: match[1]!, value: match[2]!.replace(/\s+/g, " ") });
  }
}

// Distinct declared custom-property names with the given prefix, first-seen
// order. var() references are not declarations and never match.
export function collectVarNames(css: string, prefix: string): string[] {
  const text = stripComments(css);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/(^|[\s{;])(--[\w-]+)\s*:/g)) {
    const name = match[2]!;
    if (name.startsWith(prefix) && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}
