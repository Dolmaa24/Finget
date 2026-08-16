import { describe, it, expect } from 'vitest';
import { inr, inrCompact, initials, pct, clamp, rupeesToPaise, paiseToRupees } from './format';

describe('inr', () => {
  it('formats with Indian digit grouping', () => {
    expect(inr(1000)).toBe('₹1,000');
    expect(inr(100000)).toBe('₹1,00,000');
    expect(inr(8499)).toBe('₹8,499');
  });

  it('marks negatives with a true minus sign, not a hyphen', () => {
    expect(inr(-500)).toBe('−₹500');
  });

  it('survives null, undefined and NaN', () => {
    expect(inr(null)).toBe('₹0');
    expect(inr(undefined)).toBe('₹0');
    expect(inr(NaN)).toBe('₹0');
  });
});

describe('inrCompact', () => {
  it('uses Indian scale words', () => {
    expect(inrCompact(1500)).toBe('₹1.5k');
    expect(inrCompact(150000)).toBe('₹1.5L');
    expect(inrCompact(15000000)).toBe('₹1.5Cr');
    expect(inrCompact(500)).toBe('₹500');
  });
});

describe('rupeesToPaise', () => {
  it('matches the server implementation on float-error cases', () => {
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
    expect(rupeesToPaise(1.005)).toBe(101);
    expect(rupeesToPaise(8499)).toBe(849900);
  });

  it('round-trips', () => {
    expect(paiseToRupees(rupeesToPaise(1234.56))).toBeCloseTo(1234.56, 10);
  });

  it('degrades to zero rather than NaN', () => {
    expect(rupeesToPaise(NaN)).toBe(0);
    expect(rupeesToPaise(Infinity)).toBe(0);
  });
});

describe('pct', () => {
  it('clamps to 0..100', () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(150, 100)).toBe(100);
    expect(pct(-10, 100)).toBe(0);
  });

  it('returns 0 rather than dividing by zero', () => {
    expect(pct(50, 0)).toBe(0);
  });
});

describe('initials', () => {
  it('takes at most two initials', () => {
    expect(initials('Dolma Sharma')).toBe('DS');
    expect(initials('Priya')).toBe('P');
    expect(initials('A B C D')).toBe('AB');
  });

  it('degrades on empty input', () => {
    expect(initials('')).toBe('?');
    expect(initials(undefined)).toBe('?');
  });
});

describe('clamp', () => {
  it('bounds a value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
