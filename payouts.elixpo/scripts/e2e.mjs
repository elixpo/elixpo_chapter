#!/usr/bin/env node
/**
 * Runs the end-to-end checks in tests/e2e: bundles each *.e2e.ts with esbuild
 * (resolving the tsconfig "@/" alias) into .e2e-out/ and executes it with Node.
 * Exit code is non-zero if any check fails. Usage: npm run test:e2e
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
    console.error(`Node ≥ 22.13 is required (node:sqlite); found ${process.versions.node}.`);
    process.exit(1);
}

const files = readdirSync("tests/e2e").filter((f) => f.endsWith(".e2e.ts"));
let failed = 0;
for (const file of files) {
    const out = `.e2e-out/${file.replace(/\.ts$/, ".mjs")}`;
    await build({
        entryPoints: [`tests/e2e/${file}`],
        outfile: out,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node22",
        tsconfig: "tsconfig.json",
        external: ["node:sqlite", "@cloudflare/next-on-pages"],
        logLevel: "error",
        // Next's compiled deps expect CommonJS globals inside the ESM bundle.
        banner: {
            js: "import{createRequire as __cr}from'module';import{fileURLToPath as __fu}from'url';import{dirname as __dn}from'path';const require=__cr(import.meta.url);const __filename=__fu(import.meta.url);const __dirname=__dn(__filename);",
        },
    });
    console.log(`\n▶ ${file}`);
    const run = spawnSync(process.execPath, ["--no-warnings", out], { stdio: "inherit", env: process.env });
    if (run.status !== 0) failed++;
}
if (failed) {
    console.error(`\n${failed} e2e suite(s) failed.`);
    process.exit(1);
}
