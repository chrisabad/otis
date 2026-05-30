import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/worker.ts"],
  bundle: true,
  outfile: "dist/worker.js",
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: true,
  external: ["node:*"],
  // Minify identifiers in prod; keep readable in dev
  minifyIdentifiers: process.env.NODE_ENV === "production",
});
