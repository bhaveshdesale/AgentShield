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
  }
};
