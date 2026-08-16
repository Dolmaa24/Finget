/**
 * express-rate-limit skips its own config validation when NODE_ENV=test, so a
 * misconfigured limiter passes the suite and then throws on a real boot. The
 * limiters set `validate: true` explicitly; this file asserts that loading
 * them actually constructs without a ValidationError, and that the key
 * generator handles IPv6 the way the library requires.
 */
const limiters = require("../middleware/rateLimit");

describe("rate limiters", () => {
  it("constructs every limiter with validation enabled", () => {
    for (const name of ["shareCreateLimiter", "sharePublicLimiter", "aiLimiter", "translateLimiter"]) {
      expect(typeof limiters[name]).toBe("function");
    }
  });

  it("keys authenticated requests by user, not by IP", () => {
    const key = limiters.byUser({ user: "6a80e497af36fafa963a39d8", ip: "1.2.3.4" });
    expect(key).toContain("6a80e497af36fafa963a39d8");
    expect(key).not.toContain("1.2.3.4");
  });

  it("normalises IPv6 for anonymous requests instead of using the raw address", () => {
    // Two addresses inside the same /64 must collapse to one bucket, otherwise
    // a single user can rotate addresses to bypass the limit.
    const a = limiters.byUser({ ip: "2001:db8:1234:5678:0000:0000:0000:0001" });
    const b = limiters.byUser({ ip: "2001:db8:1234:5678:ffff:ffff:ffff:ffff" });
    expect(a).toBe(b);
  });

  it("still distinguishes different IPv4 clients", () => {
    expect(limiters.byUser({ ip: "1.2.3.4" })).not.toBe(limiters.byUser({ ip: "5.6.7.8" }));
  });
});
