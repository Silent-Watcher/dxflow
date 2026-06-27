import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  platform: "node",
  target: "node18",
  // Sourcemaps are left off for the published build: src/ is not included in
  // the npm package, so shipped maps would point at files consumers don't have.
  sourcemap: false,
});
