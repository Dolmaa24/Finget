/** The wire between the content script, the popup, and the service worker. */

export type HeadlineKind = "goal_delay" | "safe_days" | "rupees";
export type RiskLevel = "Safe" | "Warning" | "Risky";

/** The subset of `/api/finance/translate` the chip actually renders. */
export interface ChipTranslation {
  amountPaise: number;
  headline: string;
  headlineKind: HeadlineKind;
  riskAfter: RiskLevel;
}

export type TranslateResult =
  | { ok: true; translation: ChipTranslation }
  /**
   * `reason` drives whether the chip appears at all. Only `error` is worth a
   * retry; `logged-out` and `offline` mean render nothing and stay quiet.
   */
  | { ok: false; reason: "logged-out" | "offline" | "rate-limited" | "error" };

export interface ConnectionState {
  connected: boolean;
  apiBaseUrl: string;
  /** Non-secret label, e.g. "fgt_A1b2C3". Never the token itself. */
  tokenPrefix?: string;
}

export type Message =
  | { type: "translate"; amountPaise: number }
  | { type: "get-state" }
  | { type: "disconnect" }
  /** Sent by the connect content script after the web app hands over a token. */
  | { type: "pair"; token: string; apiBaseUrl?: string };

export type Response = TranslateResult | ConnectionState | { ok: boolean };
