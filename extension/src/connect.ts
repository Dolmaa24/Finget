/**
 * Pairing bridge, injected only on the Finget web app's own origin.
 *
 * The connect page cannot call `chrome.runtime.sendMessage` directly — that
 * needs the extension id, which is not known until the extension is packed and
 * differs between a store build and an unpacked one. So the page posts a
 * message to itself and this script, which the browser already trusts on that
 * origin, forwards it to the service worker.
 *
 * The page also renders the token as copyable text, so pairing still works if
 * this script is not present (a fresh install that has not reloaded the tab).
 */

const ACCEPTED_TYPES = ["finget:pair", "finget:ping"] as const;

window.addEventListener("message", (event) => {
  // Only same-origin messages. `event.source !== window` rejects anything
  // posted in from an iframe, which is the whole attack here: a framed page
  // asking the extension to store a token the attacker controls.
  if (event.source !== window || event.origin !== location.origin) return;

  const data = event.data as { type?: string; token?: string; apiBaseUrl?: string };
  if (!data || typeof data.type !== "string") return;
  if (!ACCEPTED_TYPES.includes(data.type as (typeof ACCEPTED_TYPES)[number])) return;

  if (data.type === "finget:ping") {
    // Lets the page say "extension detected" instead of guessing.
    window.postMessage({ type: "finget:pong" }, location.origin);
    return;
  }

  if (typeof data.token !== "string") return;

  chrome.runtime
    .sendMessage({ type: "pair", token: data.token, apiBaseUrl: data.apiBaseUrl })
    .then((res: { ok?: boolean } | undefined) => {
      window.postMessage(
        { type: "finget:paired", ok: Boolean(res && res.ok) },
        location.origin
      );
    })
    .catch(() => {
      window.postMessage({ type: "finget:paired", ok: false }, location.origin);
    });
});

// Announce on load so a page that rendered before the script ran can react.
window.postMessage({ type: "finget:pong" }, location.origin);
