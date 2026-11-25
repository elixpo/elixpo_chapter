// Validates config/festivals.yaml and writes public/festive/theme.js with the calendar inlined.
// Runs before every build; a malformed calendar fails the build instead of shipping a broken theme.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..");
const calendar = parse(readFileSync(join(site, "..", "config", "festivals.yaml"), "utf8"), { schema: "core" });
const engine = readFileSync(join(site, "festive", "engine.js"), "utf8");
const THEMES = ["diwali", "holi", "independence-day", "republic-day", "durga-puja", "christmas", "new-year", "winter", "summer"];

const problems = [];
const fail = (message) => problems.push(message);
const isoDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value));
const validIso = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

if (calendar?.version !== 1) fail("version must be 1");
try { new Intl.DateTimeFormat("en-CA", { timeZone: calendar.timezone }); } catch { fail(`unknown timezone: ${calendar?.timezone}`); }
if (!Number.isInteger(calendar?.defaults?.before) || !Number.isInteger(calendar?.defaults?.after)) fail("defaults.before and defaults.after must be integers");
if (!Array.isArray(calendar?.services) || calendar.services.length === 0) fail("services must list at least one host");
if (calendar?.canary != null && (!Array.isArray(calendar.canary) || calendar.canary.some((host) => !calendar.services?.includes(host)))) fail("canary must list hosts that are also in services");
if (calendar?.exclude_paths != null) {
  if (typeof calendar.exclude_paths !== "object" || Array.isArray(calendar.exclude_paths)) fail("exclude_paths must map hosts to lists of paths");
  else for (const [host, paths] of Object.entries(calendar.exclude_paths)) {
    if (!calendar.services?.includes(host)) fail(`exclude_paths: ${host} is not in services`);
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string" || !p.startsWith("/"))) fail(`exclude_paths: ${host} must list paths starting with "/"`);
  }
}
if (calendar?.override != null && calendar.override !== "none" && !THEMES.includes(calendar.override)) fail(`override must be null, "none", or one of: ${THEMES.join(", ")}`);

const ids = new Set();
const festivals = (calendar?.festivals ?? []).map((festival) => {
  const where = `festival ${festival?.id ?? "?"}`;
  if (!THEMES.includes(festival?.id)) fail(`${where}: id has no theme (${THEMES.join(", ")})`);
  if (ids.has(festival.id)) fail(`${where}: duplicate id`);
  ids.add(festival.id);
  if (!festival.name || !festival.greeting) fail(`${where}: name and greeting are required`);
  if (!festival.every_year === !festival.dates) fail(`${where}: set exactly one of every_year or dates`);
  if (festival.every_year && !/^\d{2}-\d{2}$/.test(festival.every_year)) fail(`${where}: every_year must be "MM-DD"`);
  const dates = (festival.dates ?? []).map((range) => {
    const start = isoDate(range.start);
    const end = isoDate(range.end ?? range.start);
    if (!validIso(start) || !validIso(end) || end < start) fail(`${where}: invalid date range ${start}..${end}`);
    return { start, end };
  });
  for (const key of ["before", "after"]) if (festival[key] != null && !Number.isInteger(festival[key])) fail(`${where}: ${key} must be an integer`);
  return { id: festival.id, name: festival.name, greeting: festival.greeting, every_year: festival.every_year, dates: festival.dates ? dates : undefined, before: festival.before, after: festival.after };
});
const seasons = (calendar?.seasons ?? []).map((season) => {
  if (!THEMES.includes(season?.id)) fail(`season ${season?.id}: id has no theme`);
  if (!Array.isArray(season.months) || season.months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) fail(`season ${season.id}: months must be 1–12`);
  return { id: season.id, name: season.name, months: season.months };
});

if (problems.length) {
  console.error(`festivals.yaml is invalid:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const payload = { timezone: calendar.timezone, defaults: calendar.defaults, override: calendar.override ?? null, services: calendar.services, canary: calendar.canary ?? [], exclude_paths: calendar.exclude_paths ?? {}, festivals, seasons };
const out = join(site, "public", "festive", "theme.js");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, engine.replace("/*__ELIXPO_FESTIVE_CALENDAR__*/ null", JSON.stringify(payload)));
console.log(`festive: wrote ${festivals.length} festivals and ${seasons.length} seasons to public/festive/theme.js`);
