import browser from "webextension-polyfill";
import componentsCss from "../styles/components.css?raw";
import tokensCss from "../styles/tokens.css?raw";
import { assembleDialogCss, buildFontFaceCss } from "./dialog-styles";

let cached: string | null = null;

// The full design-system CSS for the dialog's shadow root, with fonts resolved
// to extension-absolute URLs. Built once per content-script context.
export function dialogCss(): string {
  if (cached !== null) {
    return cached;
  }
  const fontFaceCss = buildFontFaceCss((weight) =>
    browser.runtime.getURL(`fonts/general-sans/general-sans-${weight}.woff2`),
  );
  cached = assembleDialogCss({ tokensCss, componentsCss, fontFaceCss });
  return cached;
}
