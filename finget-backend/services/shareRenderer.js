/**
 * Share-card image rendering.
 *
 * DEFERRED TO MILESTONE 1 — deliberately an interface plus a stub.
 *
 * Milestone 0 ships nothing user-visible, so it does not need a PNG pipeline,
 * and the renderer choice (satori + @resvg/resvg-js, both with native
 * prebuilds, plus a bundled font) is better made in M1 when the card design is
 * being iterated on and the hosting target is known — that is what actually
 * decides whether native binaries are a deployment problem.
 *
 * The HTML + Open Graph page works today without any of this; only the
 * `.png` endpoint is stubbed.
 */

const isRendererAvailable = () => false;

/**
 * @param {object} _card a ShareCard document
 * @returns {Promise<Buffer>} PNG bytes
 * @throws {RendererUnavailableError} until Milestone 1
 */
async function renderCardPng(_card) {
  throw new RendererUnavailableError(
    "Share card image rendering arrives in Milestone 1. The shareable link and its preview metadata work now."
  );
}

class RendererUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.status = 501;
  }
}

module.exports = { renderCardPng, isRendererAvailable, RendererUnavailableError };
