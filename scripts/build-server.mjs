import { build } from "esbuild";

await build({
  entryPoints: ["server/_core/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "dist",
  packages: "external",
  splitting: true,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  logLevel: "info",
});

