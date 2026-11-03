import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertCoverageThresholds } from "./mcr.config.mjs";

function createCoverageResults(pct = 80) {
  const summary = Object.fromEntries(
    ["statements", "branches", "functions", "lines"].map((metric) => [
      metric,
      { total: 10, covered: pct / 10, pct },
    ]),
  );
  return { files: [{ sourcePath: "src/example.ts" }], summary };
}

describe("Monocart coverage thresholds", () => {
  it("accepts nonempty summaries meeting all configured thresholds", () => {
    assert.doesNotThrow(() => assertCoverageThresholds(createCoverageResults()));
  });

  it("rejects a summary below a configured threshold", () => {
    const results = createCoverageResults();
    results.summary.branches.pct = 79.99;

    assert.throws(
      () => assertCoverageThresholds(results),
      /branches: 79\.99%, required 80%/,
    );
  });

  it("rejects missing and empty coverage results", () => {
    assert.throws(
      () => assertCoverageThresholds(undefined),
      /Missing or empty coverage results/,
    );
    assert.throws(
      () => assertCoverageThresholds({ files: [], summary: {} }),
      /Missing or empty coverage results/,
    );
    assert.throws(
      () =>
        assertCoverageThresholds({
          files: [{ sourcePath: "src/example.ts" }],
          summary: {
            statements: { total: 0, pct: "" },
            branches: { total: 0, pct: "" },
            functions: { total: 0, pct: "" },
            lines: { total: 0, pct: "" },
          },
        }),
      /nonempty/,
    );
  });
});
