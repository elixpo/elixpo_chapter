"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

// Route-specific lines; the first matching prefix wins, so list detail routes before their index.
const QUIPS: [string, string[]][] = [
  ["/projects/", ["Read the README first. I didn't.", "I pressed every button. For science."]],
  ["/projects", ["Pick one. I'll pretend I helped.", "Some of these are archived. Like my diet."]],
  ["/research/", ["Cite it properly. I'll know.", "I only read the figures."]],
  ["/research", ["I read the abstracts. Mostly.", "Not peer reviewed. Panda reviewed."]],
  ["/packages", ["sudo apt install bamboo", "Signed, sealed, apt-delivered."]],
  ["/services", ["Uptime is the humans' job. Naps are mine.", "If it's down, it wasn't me."]],
  ["/about", ["Foundry? I just live here.", "I'm the unofficial morale department."]],
  ["/history", ["2023 me was smaller. Same appetite.", "I was there. Allegedly."]],
  ["/people", ["I'm not on this page. I filed a complaint.", "Say hi to my humans."]],
  ["/contributors", ["Every commit counts. I count on my paws.", "You could be on this page."]],
  ["/recognition", ["Certificates are for humans. I take bamboo.", "Verified. By me. Sniffed, really."]],
  ["/chapter", ["Chapters end. Snacks don't.", "Frame, build, release, nap."]],
  ["/contributing", ["First PR? I'll cheer. Loudly.", "Small PRs get reviewed faster. Trust me."]],
  ["/community", ["Be kind in Discussions. I'm lurking.", "Say hi. I won't bite. Much."]],
  ["/code-of-conduct", ["Be excellent. I'm watching.", "Even pandas follow this one."]],
  ["/licensing", ["I'm a panda, not a lawyer.", "Read the actual license, please."]],
  ["/terms", ["I'm a panda, not a lawyer.", "Nobody reads these. You're a legend."]],
  ["/privacy", ["I don't track you. I just stare.", "I'm a panda, not a lawyer."]],
  ["/partnerships", ["Sponsors keep the lights on. And me fed.", "Your logo would look great next to me."]],
  ["/contact", ["Humans answer email. I supervise.", "Be nice. They're doing their best."]],
  ["/wiki", ["[citation needed]", "I edited nothing here. Promise."]],
  ["/branding", ["Yes, that's me. My good side.", "Please don't stretch my logo."]],
  ["/assets", ["Yes, that's me. My good side.", "Please don't stretch my logo."]],
  ["/architecture", ["I drew none of these boxes.", "Arrows go that way. Probably."]],
];
const FALLBACK = ["Hi! I'm Lumi.", "ship it ↗", "LGTM ✓"];
const IDLE_LINE = "Still reading? Respect.";
const DISMISS_KEY = "elixpo:oreo-dismissed";

type FestiveWindow = Window & { ElixpoFestive?: { active: { greeting: string | null; url?: string | null } | null } };
type Festive = { line: string; url: string | null };

const linesFor = (path: string) => [...(QUIPS.find(([route]) => (route.endsWith("/") ? path.startsWith(route) : path === route))?.[1] ?? []), ...FALLBACK];

type Mode = "hidden" | "peek" | "up";

const readDismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };
const noSubscription = () => () => {};

/**
 * Lumi peeks in from the bottom edge of every page. She ducks while the reader scrolls down,
 * steps aside while another Lumi ([data-oreo-scene]) is on screen, and pops up on hover or tap.
 */
export function OreoCompanion() {
  const pathname = usePathname();
  // Keyed by route so every page starts with a fresh line, timer, and entrance.
  return <Oreo key={pathname} pathname={pathname} />;
}

function Oreo({ pathname }: { pathname: string }) {
  const [festive, setFestive] = useState<Festive | null>(null);
  const lines = festive ? [festive.line, ...linesFor(pathname)] : linesFor(pathname);
  const [line, setLine] = useState(0);
  const [idle, setIdle] = useState(false);
  const [mode, setMode] = useState<Mode>("hidden");
  const [hop, setHop] = useState(0);
  const storedDismissal = useSyncExternalStore(noSubscription, readDismissed, () => false);
  const [shooed, setShooed] = useState(false);
  const blocked = useRef(false);
  const ducking = useRef(false);
  const hovering = useRef(false);

  useEffect(() => {
    let settle: number | undefined;
    let lastY = window.scrollY;
    const visibleScenes = new Set<Element>();
    const rest = () => setMode(blocked.current || ducking.current ? "hidden" : hovering.current ? "up" : "peek");

    const observer = new IntersectionObserver((records) => {
      records.forEach((record) => (record.isIntersecting ? visibleScenes.add(record.target) : visibleScenes.delete(record.target)));
      blocked.current = visibleScenes.size > 0;
      rest();
    });
    // Wait a frame so the new route's scenes are in the DOM.
    const frame = requestAnimationFrame(() => document.querySelectorAll("[data-oreo-scene]").forEach((scene) => observer.observe(scene)));

    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY + 6) { ducking.current = true; rest(); }
      lastY = y;
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { ducking.current = false; rest(); }, 900);
    };
    const enter = window.setTimeout(() => {
      // The shared festive script (agent.elixpo.com/festive/theme.js) loads after hydration.
      // Birthdays carry a link to the person's page so readers can send a wish.
      const active = (window as FestiveWindow).ElixpoFestive?.active;
      if (active?.greeting) setFestive({ line: `${active.greeting.replace(/[!.]+$/, "")}! 🎉`, url: active.url ?? null });
      rest();
    }, 1200);
    const idleTimer = window.setTimeout(() => setIdle(true), 45000);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      [settle, enter, idleTimer].forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (mode !== "up" || hovering.current) return;
    const timer = window.setTimeout(() => setMode(blocked.current ? "hidden" : "peek"), 5000);
    return () => window.clearTimeout(timer);
  }, [mode, line]);

  if (storedDismissal || shooed) return null;

  const say = idle ? IDLE_LINE : lines[line % lines.length];
  const poke = () => {
    if (mode === "up") setLine((value) => value + 1);
    setIdle(false);
    setHop((value) => value + 1);
    setMode("up");
  };
  const shoo = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable */ }
    setShooed(true);
  };

  return (
    <div
      className="oreo-companion"
      data-mode={mode}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") { hovering.current = true; setMode("up"); } }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") { hovering.current = false; setMode(blocked.current ? "hidden" : "peek"); } }}
    >
      <p className="oreo-companion-bubble">
        <span key={`${say}-${hop}`}>{festive?.url && say === festive.line ? <a href={festive.url}>{say} Send a wish ↗</a> : say}</span>
        <button type="button" onClick={shoo} aria-label="Send Lumi away for this visit">×</button>
      </p>
      <button type="button" className="oreo-companion-panda" onClick={poke} aria-label={`Lumi the panda says: ${say} Press for another line.`}>
        <Image key={hop} className={hop ? "is-hopping" : undefined} src="/logos/logo.webp" alt="" width={96} height={96} />
      </button>
    </div>
  );
}
