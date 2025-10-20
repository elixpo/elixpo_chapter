#!/usr/bin/env node
import concurrently from "concurrently";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// commands for backend modules
const commands = pkg.backendModules.map(file => `npx tsx --watch ${file}`);


// run concurrently — v8+ automatically handles logs
concurrently(commands, {
  killOthers: ["failure"],
  prefix: "name",
  restartTries: 3
});
