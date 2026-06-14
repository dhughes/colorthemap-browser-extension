import browser from "webextension-polyfill";
import { aliveMessage } from "./shared/alive";

console.log(aliveMessage("background"));

browser.runtime.onInstalled.addListener((details) => {
  console.log(aliveMessage("background"), "onInstalled", details.reason);
});

browser.runtime.onStartup.addListener(() => {
  console.log(aliveMessage("background"), "onStartup");
});
