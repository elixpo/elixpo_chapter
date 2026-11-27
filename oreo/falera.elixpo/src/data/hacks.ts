/* The hack cards on /hacks. A card with `doc` is a guide in the
 * repository's docs/hacks/ folder, rendered at /hacks/<slug>/ at build
 * time; a card with `href` links somewhere else. Keep the text true to
 * the code: the guides are checked against it, the cards should be too. */

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type Hack = {
  slug: string;
  title: string;
  body: string;
  difficulty: Difficulty;
  mins: number;
  /** docs/hacks/<doc> in the repository, rendered at /hacks/<slug>/. */
  doc?: string;
  /** Where the card goes when there is no guide. */
  href?: string;
  /** Lead paragraph on the guide's page. */
  lead?: string;
};

export const HACKS: Hack[] = [
  {
    slug: "github-handle", doc: "github-handle.md",
    title: "Put your GitHub handle on the badge",
    body: "falera setup writes GITHUB_USER, DISPLAY_NAME and DISPLAY_DESIGNATION to the badge; the Badge app shows your name, title and live GitHub card.",
    lead: "Fill in the Badge app with your name, title, @handle and GitHub card, over USB with falera setup.",
    difficulty: "beginner", mins: 5,
  },
  {
    slug: "gallery-photo", doc: "gallery-photo.md",
    title: "Add your photo to the Gallery",
    body: "Send a photo or a short video with the Transfer app and falera transfer send, or falera add; it is converted to .rz565 / .rv565 and lands in the carousel.",
    lead: "Three ways to put a photo or a short video in the Gallery: the Transfer app, falera add, or baked into your build.",
    difficulty: "beginner", mins: 8,
  },
  {
    slug: "commits-brick", doc: "commits-brick.md",
    title: "Your contribution graph on the badge",
    body: "Point the built-in Commits app at your GitHub user: the full year, streaks and your busiest week. The brick-breaker built on it is still yours to write.",
    lead: "Make the Commits app show your GitHub year, then use the same cached data for a game of your own.",
    difficulty: "beginner", mins: 10,
  },
  {
    slug: "custom-theme", doc: "custom-theme.md",
    title: "Theme the OS in your colours",
    body: "Edit the palette in oreoOS/theme.py and push it with falera push: the background, accent, cards and text of every themed screen follow.",
    lead: "Most of FaleraOS's colours come from one file. Change a few numbers and push it to the badge.",
    difficulty: "beginner", mins: 10,
  },
  {
    slug: "ir-quest", doc: "ir-quest.md",
    title: "Beam a booth code with IR Quest",
    body: "Send NEC codes from one badge and watch another pick them up in IR Quest, or loop a beacon with falera run. Receiving still has an open bug (#48).",
    lead: "Turn one badge into an infrared booth beacon and receive its code on another, with an honest note on what works today.",
    difficulty: "intermediate", mins: 30,
  },
  {
    slug: "imu-tilt", doc: "imu-tilt.md",
    title: "Tilt to scroll in your app",
    body: "Read the MPU-6050 through oreoWare.imu in your app's update(dt) and turn a forward or backward tilt into scrolling, next to UP / DOWN.",
    lead: "Read the badge's accelerometer in your own app and scroll with a tilt.",
    difficulty: "intermediate", mins: 25,
  },
  {
    slug: "custom-app",
    title: "Ship your first app",
    body: "falera new my_app, edit src/app.py, falera app install ./my_app: a counter on the badge in minutes.",
    difficulty: "intermediate", mins: 45,
    href: "/docs/apps/",
  },
  {
    slug: "ota-fork", doc: "ota-fork.md",
    title: "Self-host OTA updates",
    body: "Point oreoOS/ota.py at your GitHub fork and publish stable/ or beta/ releases with tools/release.py; your badge updates from them.",
    lead: "Publish FaleraOS releases from your own fork and have your badge update from them.",
    difficulty: "advanced", mins: 60,
  },
  {
    slug: "pcb-design",
    title: "Spin a PCB",
    body: "Start from the KiCad 10 schematics in circuit/elixpo/ and docs/HARDWARE.md. The schematics are drawn; the board layout is not, yet.",
    difficulty: "advanced", mins: 240,
    href: "https://github.com/elixpo/falera/tree/main/circuit/elixpo",
  },
];

export const HACK_GUIDES = HACKS.filter((h): h is Hack & { doc: string } => Boolean(h.doc));

export const hackUrl = (h: Hack) => (h.doc ? `/hacks/${h.slug}/` : h.href ?? "/hacks/");
