/** Tiny class-name joiner used across the UI layer. */
export const cn = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ');
