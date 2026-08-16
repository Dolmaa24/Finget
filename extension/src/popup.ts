import type { ConnectionState } from "./lib/messages";

/**
 * The popup shows exactly two states and offers exactly two actions. It is not
 * a dashboard — the app is the dashboard.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * Where "Connect Finget" points. Derived from the API base the worker already
 * holds, so a self-hosted or local install lands on its own app rather than on
 * a hardcoded production URL.
 */
function appUrlFor(apiBaseUrl: string): string {
  try {
    const api = new URL(apiBaseUrl);
    // The dev API is on :5001 and the web app on :5173. Anywhere else, the app
    // and API share a host and only the /api prefix differs.
    if (api.hostname === "localhost" || api.hostname === "127.0.0.1") {
      return `${api.protocol}//${api.hostname}:5173/extension/connect`;
    }
    return `${api.origin}/extension/connect`;
  } catch {
    return "http://localhost:5173/extension/connect";
  }
}

function render(state: ConnectionState) {
  $("pill").classList.toggle("on", state.connected);
  $("statusText").textContent = state.connected ? "Connected" : "Not connected";

  $("connected").hidden = !state.connected;
  $("disconnected").hidden = state.connected;

  if (state.connected && state.tokenPrefix) {
    $("prefix").textContent = `${state.tokenPrefix}…`;
  }

  $<HTMLAnchorElement>("connectLink").href = appUrlFor(state.apiBaseUrl);
}

async function refresh() {
  const state = (await chrome.runtime.sendMessage({ type: "get-state" })) as ConnectionState;
  render(state);
}

$("disconnect").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "disconnect" });
  await refresh();
});

refresh().catch(() => {
  $("statusText").textContent = "Could not reach the extension";
});
