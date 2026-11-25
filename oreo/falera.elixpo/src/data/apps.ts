/* Single source of truth for the app catalogue surfaced on the site.
 * Mirrors the manifest.json files shipped on the badge.
 *
 *   slug      — the on-disk app directory ("Lumi", "snake", …)
 *   urlSlug   — URL-safe variant used by /apps/[urlSlug]/ routes
 *   pngIcon   — path under /public/icons (real asset; pixel-art LCD icon)
 *   icon      — Lucide string fallback when the PNG fails to load
 *   version   — last published manifest version
 *   author    — manifest.author; defaults to @Circuit-Overtime
 *   details   — long-form pitch used on the detail page; falls back to
 *               `blurb` if absent. Markdown is NOT parsed here — plain
 *               paragraphs separated by \n\n.
 */

export type AppIconId =
  | "Contact" | "Bird"     | "Image"      | "Worm"      | "Compass"
  | "BookOpen"| "Car"      | "Cloud"      | "GitCommit" | "User"
  | "Gamepad2"| "HardDrive"| "Palette"    | "PawPrint"  | "Cpu"
  | "Wifi"    | "Bluetooth"| "RefreshCw"  | "Settings"  | "Store"
  | "Sparkles"| "Hand";

export type AppEntry = {
  slug:      string;
  urlSlug:   string;
  name:      string;
  blurb:     string;
  details?:  string;
  category:  "core" | "game" | "tool" | "store";
  tint:      "primary" | "teal" | "gold" | "lilac";
  icon:      AppIconId;
  pngIcon?:  string;
  version?:  string;
  author?:   string;
};

const DEFAULT_AUTHOR  = "@Circuit-Overtime";
const DEFAULT_VERSION = "0.1";

/* Convert a badge dir slug into a URL-safe identifier — lowercase,
 * spaces → hyphens, strip everything else. Used at both data-entry
 * time below and at lookup time on the detail route. */
export function toUrlSlug(slug: string): string {
  return slug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function app(
  slug: string,
  rest: Omit<AppEntry, "slug" | "urlSlug" | "author" | "version"> &
        Partial<Pick<AppEntry, "author" | "version">>,
): AppEntry {
  return {
    slug,
    urlSlug: toUrlSlug(slug),
    author:  rest.author  ?? DEFAULT_AUTHOR,
    version: rest.version ?? DEFAULT_VERSION,
    ...rest,
  };
}

export const PRELOADED: AppEntry[] = [
  app("store",   { name: "App Store",   category: "core", tint: "primary", icon: "Store",
    pngIcon: "/icons/store_icon.png", version: "1.0",
    blurb:   "Discover, install, update and remove apps for your badge.",
    details: "A Discover page with a featured card and every app's icon, tagline, " +
             "category and size, plus an app page with Install, Open and Update. " +
             "B switches to Installed, where apps uninstall behind a confirm step " +
             "and reinstall from Discover.\n\nThe catalogue is one file " +
             "(apps_market/index.json), cached on the badge so it opens instantly " +
             "and refreshes in the background. Installs stream into a staging " +
             "folder and only swap in when complete, and updates keep an app's " +
             "saved files." }),
  app("badge",   { name: "Badge",       category: "core", tint: "primary", icon: "Contact",
    version: "0.2", pngIcon: "/icons/badge_icon.png",
    blurb:   "Your conference badge: name, title and GitHub card.",
    details: "One screen, no scrolling: your avatar (or initials), your name and " +
             "title from your profile, your GitHub handle, location and bio, and " +
             "your repos, followers and following in one row. It opens instantly " +
             "from the last cached GitHub profile, works offline, and refreshes " +
             "in the background (press A to refresh now). Designed to be held up " +
             "at conferences and read across a table." }),
  app("gallery", { name: "Gallery",     category: "core", tint: "gold",    icon: "Image",
    version: "0.2", pngIcon: "/icons/gallery_icon.png",
    blurb:   "Browse photos, pixel art, and uploaded videos.",
    details: "Shows RGB565 photos baked by `tools/optimize_assets.py` or sent over " +
             "Wi-Fi, and plays RV565 videos. The UI auto-hides after 2 s, so it " +
             "doubles as a slideshow." }),
  app("commits", { name: "Commits",     category: "tool", tint: "gold",    icon: "GitCommit",
    pngIcon: "/icons/commits_icon.png",
    blurb:   "Your GitHub contribution graph: the full year, with streaks.",
    details: "The full 53-week contribution grid with active days, current and " +
             "longest streaks, and your busiest week. It opens from the cached " +
             "graph and syncs in the background with a progress bar; on a first " +
             "run, an empty grid fills week by week as the data arrives." }),
  app("reader",  { name: "Reader",      category: "tool", tint: "lilac",   icon: "BookOpen",
    pngIcon: "/icons/reader_icon.png",
    blurb:   "Markdown and text viewer for files you send to the badge.",
    details: "Lightweight markdown renderer supporting headings, lists, code blocks " +
             "and inline emphasis. Files arrive over Wi-Fi and land in " +
             "`documents/`. UP/DOWN scrolls, LEFT/RIGHT skips a page." }),
];

export const ALL_APPS: AppEntry[] = [
  ...PRELOADED,
  app("about",    { name: "About",     category: "core", tint: "teal",    icon: "Cpu",
    pngIcon: "/icons/about_icon.png",
    blurb:   "Build info, OS version, and credits.",
    details: "Firmware and FaleraOS versions, hardware details and credits. Opens " +
             "instantly from cache and refreshes in the background." }),
  app("gamepad",  { name: "Gamepad",   category: "tool", tint: "primary", icon: "Gamepad2",
    pngIcon: "/icons/gamepad_icon.png",
    blurb:   "Button tester: every button's live state on one screen.",
    details: "A full-screen list of every badge button: held buttons light up " +
             "green, and a gold flash marks presses too short to notice. C is one " +
             "of the buttons under test, so it never opens the notification panel " +
             "here; a double-tap of HOME returns to the drawer." }),
  app("storage",  { name: "Storage",   category: "tool", tint: "lilac",   icon: "HardDrive",
    pngIcon: "/icons/storage_icon.png",
    blurb:   "Disk usage by app and asset bundle.",
    details: "Walks the 13.7 MB filesystem and shows which apps and asset folders " +
             "use how much flash." }),
  app("wifi",     { name: "WiFi",      category: "core", tint: "teal",    icon: "Wifi",
    pngIcon: "/icons/wifi_icon.png",
    blurb:   "Live scan, saved networks, and connect feedback.",
    details: "Scans nearby networks live with signal bars and lock icons, shows " +
             "connect progress with a clear reason when it fails, and lists saved " +
             "networks to join or forget. The badge connects in the background at " +
             "boot. Networks can also be added from a computer with `falera wifi " +
             "connect`. Files no longer travel over Wi-Fi: use the Transfer app." }),
  app("updates",  { name: "Updates",   category: "core", tint: "gold",    icon: "RefreshCw",
    pngIcon: "/icons/settings_icon.png",
    blurb:   "Check for and install new FaleraOS releases over Wi-Fi.",
    details: "Reads the latest GitHub release, shows its changelog, and streams " +
             "the update to flash over a reused connection. Also reachable from " +
             "the notification panel's Update tile." }),
  app("settings", { name: "Settings",  category: "core", tint: "primary", icon: "Settings",
    pngIcon: "/icons/settings_icon.png",
    blurb:   "Brightness, sleep timer, Wi-Fi, time, and updates.",
    details: "Top-level settings hub. Drills into Wi-Fi, Bluetooth, Gestures and " +
             "Updates as needed." }),
];

export const STORE: AppEntry[] = [
  app("patakha",  { name: "Patakha",      category: "store", tint: "gold",    icon: "Sparkles",
    pngIcon: "/icons/patakha_icon.png",
    blurb:   "Diwali special: shoot firecrackers, light up the sky.",
    details: "Steer a launcher by tilting the badge and fire firecrackers at falling " +
             "matchboxes; every hit bursts into a firework. Targets speed up every " +
             "100 points, rocket barrages clear the sky at 250, 500 and 1000, and a " +
             "rare UFO gives 8 seconds of invincible rapid fire." }),
  app("racer",    { name: "Racer",        category: "store", tint: "primary", icon: "Car",
    pngIcon: "/icons/racer_icon.png",
    blurb:   "Panda kart racer. Tilt to steer, dodge traffic.",
    details: "Endless top-down racer steered by tilting the badge (or with the " +
             "buttons). Traffic can appear in every lane right up to the kerb, so " +
             "there is no safe edge to hide on." }),
  app("flappy",   { name: "Flappy Lumi",  category: "store", tint: "lilac",   icon: "Bird",
    pngIcon: "/icons/flappy_icon.png",
    blurb:   "Tap A to flap. Dodge pipes. High score lives on flash.",
    details: "A one-button flyer with the Lumi mascot: procedurally generated " +
             "pipes, a parallax background, and a high score that survives reboots." }),
  app("snake",    { name: "Snake",        category: "store", tint: "teal",    icon: "Worm",
    pngIcon: "/icons/snake_icon.png",
    blurb:   "Classic Snake: eat the dot, don't bite yourself.",
    details: "Grid-based Snake that speeds up the longer you survive." }),
  app("Lumi", { name: "Lumi",     category: "store", tint: "primary", icon: "PawPrint",
    pngIcon: "/icons/elixpo_pet_icon.png",
    blurb:   "Lumi, our panda. Feed her, play, put her to bed.",
    details: "Lumi, the badge's panda, lives in this app and needs your care. Her stats " +
             "drop in real time, so neglecting the badge for a week genuinely matters. " +
             "Hold C to put her to sleep." }),
  app("quest",    { name: "IR Quest",     category: "store", tint: "primary", icon: "Compass",
    pngIcon: "/icons/IR_Quest_icon.png",
    blurb:   "Find other badges over IR and trade quest tokens.",
    details: "Hold your badge up to find IR beacons and other badges; each one " +
             "awards a token. Every tab shares one receive lifecycle, and a DIAG " +
             "tab shows the IR receiver's state." }),
  app("bt",       { name: "Bluetooth",    category: "store", tint: "lilac",   icon: "Bluetooth",
    pngIcon: "/icons/bluetooth_icon.png",
    blurb:   "Bluetooth radio, pairing and BLE receive status.",
    details: "Turns the radio on and off, shows whether the badge is visible or " +
             "connected and how many devices are paired, and shows progress while " +
             "a text file arrives over BLE. C disconnects the peer." }),
  app("weather",  { name: "Weather",      category: "store", tint: "teal",    icon: "Cloud",
    pngIcon: "/icons/wallpaper_icon.png",
    blurb:   "Current conditions and 3-day forecast.",
    details: "OpenWeatherMap-backed, cached on flash so the forecast survives " +
             "offline stretches. Set OWM_API_KEY in your .env." }),
  app("Colors",   { name: "Color Picker", category: "store", tint: "lilac",   icon: "Palette",
    pngIcon: "/icons/color_icon.png", version: "0.2",
    blurb:   "Pick a colour and see it on the badge's RGB LED.",
    details: "A full-screen spectrum with a crosshair: the arrows pick, B switches " +
             "the readout between RGB, HSL and CMYK, and A saves. C lights the " +
             "badge's onboard RGB LED in the picked colour (a double-tap of C " +
             "still opens the notification panel)." }),
  app("gestures", { name: "Gestures",     category: "store", tint: "teal",    icon: "Hand",
    pngIcon: "/icons/settings_icon.png",
    blurb:   "Configure shake, flip, and tap quick-actions.",
    details: "Map motion gestures from the badge's IMU to quick actions." }),
];

/* Flat list used by the [slug] route's generateStaticParams and the
 * detail-page lookup. */
export const ALL_CATALOG: AppEntry[] = [...ALL_APPS, ...STORE];

export function findApp(urlSlug: string): AppEntry | undefined {
  return ALL_CATALOG.find(a => a.urlSlug === urlSlug);
}
