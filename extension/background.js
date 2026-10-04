const HOST = "ui_notes_for_claude_code";

// Content scripts cannot reach a native host, so each request passes through here to the one that
// keeps the queues. Each site has its own queue, and the site is the hostname Chrome reports for the
// sending tab, never one the page could claim: a page only ever sees and changes its own site's notes.
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  const site = URL.canParse(sender.url) ? new URL(sender.url).hostname : null;
  chrome.runtime.sendNativeMessage(HOST, { ...request, site }, (reply) =>
    respond(reply ?? { ok: false, error: chrome.runtime.lastError?.message ?? "no reply" }),
  );
  return true;
});

// The host watches this folder while Chrome runs and asks for a reload when a file changes, so an
// edit takes effect without a trip to chrome://extensions. The open port also keeps this worker up.
const port = chrome.runtime.connectNative(HOST);
port.onMessage.addListener((message) => message.reload && chrome.runtime.reload());
port.postMessage({ op: "watch" });
chrome.runtime.onStartup.addListener(() => {});

// Tabs already open get the new content script now, not on their next page load.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: chrome.runtime.getManifest().host_permissions });
  for (const tab of tabs) {
    const target = { tabId: tab.id };
    chrome.scripting.executeScript({ target, files: ["react.js"], world: "MAIN" }).catch(() => {});
    chrome.scripting.executeScript({ target, files: ["content.js"] }).catch(() => {});
  }
});
