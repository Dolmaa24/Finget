/** Indian-format currency and date helpers used across every surface. */

const inrFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const inrPreciseFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function inr(value: number | null | undefined, opts?: { precise?: boolean }): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "₹0";
  const abs = Math.abs(n);
  const body = opts?.precise
    ? inrPreciseFormatter.format(abs)
    : inrFormatter.format(Math.round(abs));
  return `${n < 0 ? "−" : ""}₹${body}`;
}

/** Compact form for tight spaces: ₹1.2L, ₹4.5Cr. */
export function inrCompact(value: number | null | undefined): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

export function relativeDate(input: string | Date): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function fullDate(input: string | Date): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Deterministic initials for avatars. */
export function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/** Stable per-person hue so the same member keeps the same colour everywhere. */
export function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

/**
 * Rupees → integer paise, for the one place the client originates an amount:
 * a user typing into an input. Everything else passes through paise the server
 * already computed. Mirrors `finget-backend/utils/money.js`.
 */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  const scaled = rupees * 100;
  const epsilon = Math.abs(scaled) * Number.EPSILON * 4;
  return Math.sign(scaled) * Math.round(Math.abs(scaled) + epsilon);
}

export function paiseToRupees(paise: number): number {
  return Number.isFinite(paise) ? paise / 100 : 0;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function pct(current: number, target: number): number {
  if (!target || target <= 0) return 0;
  return clamp(Math.round((current / target) * 100), 0, 100);
}
