import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const contentDir = path.join(process.cwd(), "content");
const publicDir = path.join(process.cwd(), "public");
const buildTime = new Date();
const lastModifiedCache = new Map();
let memberSeoCache;

export function getPersonContent(person, file) {
  const filePath = path.join(contentDir, person, `${file}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

export function getValidPersons() {
  return fs
    .readdirSync(contentDir)
    .filter((entry) =>
      fs.statSync(path.join(contentDir, entry)).isDirectory()
    );
}

export function getPortfolioPersons() {
  const orderPath = path.join(contentDir, "portfolio-order.json");
  const order = JSON.parse(fs.readFileSync(orderPath, "utf-8"));
  const validPersons = new Set(getValidPersons());

  return order.filter((person) => validPersons.has(person));
}

export function getMemberSeo(person) {
  if (!memberSeoCache) {
    const seoPath = path.join(contentDir, "member-seo.json");
    memberSeoCache = JSON.parse(fs.readFileSync(seoPath, "utf-8"));
  }

  return memberSeoCache[person] || {};
}


export function publicAssetExists(assetPath) {
  return fs.existsSync(path.join(publicDir, assetPath));
}

// Last commit date touching any of the given repo-relative paths. Needs full
// git history (fetch-depth: 0 in CI); falls back to the build time otherwise.
export function getContentLastModified(...paths) {
  const key = paths.join("\0");
  if (lastModifiedCache.has(key)) return lastModifiedCache.get(key);

  let lastModified = buildTime;
  try {
    const output = execFileSync("git", ["log", "-1", "--format=%cI", "--", ...paths], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (output) lastModified = new Date(output);
  } catch {
    // Not a git checkout; keep the build time.
  }

  lastModifiedCache.set(key, lastModified);
  return lastModified;
}
