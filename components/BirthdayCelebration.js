"use client";

import { useEffect, useMemo, useState } from "react";
import WishCounter from "@/components/WishCounter";

// Birthdays are "MM-DD" in each profile.json and follow Elixpo's festive calendar timezone.
const TIMEZONE = "Asia/Kolkata";
// Birthdays start one minute early (23:59 the night before), and open pages re-check every 30s.
const LEAD_MS = 60 * 1000;
const RECHECK_MS = 30 * 1000;
const CONFETTI_COLORS = ["#ff6fae", "#ffd166", "#7dd3fc", "#a78bfa", "#34d399", "#e76043"];

function todayMonthDay() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + LEAD_MS));
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("month")}-${get("day")}`;
}

/** People whose birthday is today; `?birthday=preview` (or `?birthday=<slug>`) previews any date. */
function useBirthdays(people) {
  const [celebrating, setCelebrating] = useState([]);
  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("birthday");
    const withBirthday = people.filter((person) => person.birthday);
    const forced = preview && withBirthday.filter((person) => preview === "preview" || person.slug === preview);
    if (forced?.length) { setCelebrating(preview === "preview" ? withBirthday.slice(0, 1) : forced); return; }
    const check = () => {
      const today = todayMonthDay();
      const next = withBirthday.filter((person) => person.birthday === today);
      // Keep the same array while nothing changes so the banner does not re-mount.
      setCelebrating((current) => (current.map((p) => p.slug).join() === next.map((p) => p.slug).join() ? current : next));
    };
    check();
    const timer = window.setInterval(check, RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [people]);
  return celebrating;
}

const firstName = (person) => person.siteName || person.name.split(" ")[0];
const joinNames = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0]);

function ConfettiBurst() {
  const [pieces, setPieces] = useState([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const count = window.matchMedia("(max-width: 640px)").matches ? 36 : 72;
    setPieces(Array.from({ length: count }, (_, index) => ({
      id: index,
      left: `${Math.random() * 100}vw`,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      delay: `${Math.random() * 0.9}s`,
      duration: `${2.6 + Math.random() * 2}s`,
      drift: `${(Math.random() - 0.5) * 160}px`,
      spin: `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540)}deg`,
    })));
    // One burst on arrival; the shared festive layer keeps the gentle confetti going.
    const timer = window.setTimeout(() => setPieces([]), 6000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!pieces.length) return null;
  return (
    <div className="birthday-confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <i key={piece.id} style={{ left: piece.left, background: piece.color, animationDelay: piece.delay, animationDuration: piece.duration, "--drift": piece.drift, "--spin": piece.spin }} />
      ))}
    </div>
  );
}

// Lumi's birthday lines; one is picked per visit.
const BIRTHDAY_QUIPS = [
  (name) => `Lumi already ate the first slice of ${name}'s cake. And the second. Allegedly.`,
  (name) => `Lumi tried to sing for ${name}. The neighbours have filed a complaint.`,
  (name) => `${name} is officially one bug older. No rollback available.`,
  (name) => `Lumi wrapped ${name}'s present in bamboo. It's also bamboo.`,
  (name) => `Lumi says the candles count as a production incident. ${name}, blow them out quickly.`,
  (name) => `Today's standup is cancelled. ${name} is in charge of cake, Lumi is in charge of eating it.`,
];

/** Member pages: a celebration banner and a confetti burst on the member's own birthday. */
export function MemberBirthday({ person, profile }) {
  const [celebrating] = useBirthdays(useMemo(() => [{ slug: person, ...profile }], [person, profile]));
  // Picked on the client only, so a random line cannot mismatch hydration.
  const [quipIndex, setQuipIndex] = useState(0);
  useEffect(() => setQuipIndex(Math.floor(Math.random() * BIRTHDAY_QUIPS.length)), []);
  if (!celebrating) return null;
  const name = firstName(profile);
  const quip = BIRTHDAY_QUIPS[quipIndex](name);
  const email = profile.email ? `mailto:${profile.email}?subject=${encodeURIComponent(`Happy birthday, ${name}! 🎂`)}` : null;
  return (
    <>
      <ConfettiBurst />
      <section className="birthday-banner" aria-label={`It's ${name}'s birthday`}>
        <span className="birthday-banner-cake" aria-hidden="true">🎂</span>
        <div>
          <p className="birthday-banner-eyebrow">Today at Elixpo</p>
          <h2>Happy birthday, {name}!</h2>
          <p>{quip}</p>
          {email && <a className="birthday-banner-email" href={email}>or write {name} a note ↗</a>}
        </div>
        <WishCounter slug={person} name={name} />
      </section>
    </>
  );
}

/** Landing page: points visitors at whoever is celebrating today. */
export function LandingBirthday({ profiles }) {
  const celebrating = useBirthdays(profiles);
  if (!celebrating.length) return null;
  const names = joinNames(celebrating.map(firstName));
  return (
    <>
      <ConfettiBurst />
      <a className="birthday-ribbon" href={`/${celebrating[0].slug}`}>
        <span aria-hidden="true">🎂</span>
        <span>It&apos;s {names}&apos;s birthday today. Say happy birthday</span>
        <b aria-hidden="true">→</b>
      </a>
    </>
  );
}
