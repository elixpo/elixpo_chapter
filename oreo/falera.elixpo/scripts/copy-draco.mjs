// SPDX-License-Identifier: MIT
//
// Copies the Draco mesh decoder that ships with three.js into
// public/draco/, so the badge page's 3D viewer decodes
// public/models/falera-badge.glb from this site instead of a Google CDN.
// Runs before `next dev` and `next build` (predev / prebuild). The copied
// files are git-ignored: they come from node_modules (Apache-2.0, Google)
// on every build rather than being vendored into the repo.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/three/examples/jsm/libs/draco/gltf");
const dst = join(root, "public/draco");
const files = ["draco_wasm_wrapper.js", "draco_decoder.wasm"];

if (!existsSync(src)) {
  console.warn(`copy-draco: ${src} not found; run npm install. ` +
               "The 3D viewer will fall back to the flat renders.");
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log(`copy-draco: ${files.join(", ")} -> public/draco/`);
