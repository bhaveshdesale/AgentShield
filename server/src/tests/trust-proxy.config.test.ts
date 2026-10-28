import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTrustedProxyHops } from "../config/env";

describe("trusted proxy hop configuration", () => {
  it("defaults to no trusted proxies and accepts bounded integer hop counts", () => {
    assert.equal(getTrustedProxyHops({}), 0);
    assert.equal(getTrustedProxyHops({ TRUST_PROXY_HOPS: "" }), 0);
    assert.equal(getTrustedProxyHops({ TRUST_PROXY_HOPS: "0" }), 0);
    assert.equal(getTrustedProxyHops({ TRUST_PROXY_HOPS: "1" }), 1);
    assert.equal(getTrustedProxyHops({ TRUST_PROXY_HOPS: "10" }), 10);
  });

  it("rejects malformed, negative, fractional, and excessive hop counts", () => {
    for (const value of ["false", "-1", "1.5", "01", "11", "999999999999999999999"]) {
      assert.throws(
        () => getTrustedProxyHops({ TRUST_PROXY_HOPS: value }),
        /TRUST_PROXY_HOPS must be an integer between 0 and 10/,
        `expected ${JSON.stringify(value)} to be rejected`,
      );
    }
  });
});
