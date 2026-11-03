const thresholds = {
  statements: 80,
  branches: 80,
  functions: 80,
  lines: 80,
};

export function assertCoverageThresholds(results) {
  if (!results || !Array.isArray(results.files) || results.files.length === 0) {
    throw new Error("Missing or empty coverage results");
  }

  const errors = [];
  for (const [metric, minimum] of Object.entries(thresholds)) {
    const summary = results.summary?.[metric];
    const pct = summary?.pct;
    if (
      !summary ||
      typeof summary.total !== "number" ||
      !Number.isFinite(summary.total) ||
      summary.total <= 0 ||
      typeof pct !== "number" ||
      !Number.isFinite(pct) ||
      pct < minimum
    ) {
      errors.push(
        `${metric}: ${pct ?? "missing"}%, required ${minimum}% (nonempty)`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
}

export default {
  outputDir: "./coverage",
  reports: ["text", "lcovonly"],
  all: "./src",
  outputFilter: ({ sourcePath }) => {
    const file = sourcePath.replaceAll("\\", "/");
    return file.startsWith("src/")
      && file.endsWith(".ts")
      && !file.startsWith("src/tests/")
      && !file.endsWith(".test.ts")
      && !file.endsWith(".d.ts");
  },
  onEnd: assertCoverageThresholds,
};
