"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Wishes go to the Pages Function at /api/wishes/<slug> (D1-backed). Clicks are counted in
// localStorage and sent in batches, and the shared count is polled slowly and cached across tabs,
// so mashing the button costs one request every few seconds at most.
const API = process.env.NEXT_PUBLIC_WISHES_API || "";
const FLUSH_MS = 5000;
const POLL_MS = 30000;
const MAX_BATCH = 50;
const COLORS = ["#ff6fae", "#ffd166", "#7dd3fc", "#a78bfa", "#34d399"];

const year = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());
const keys = (slug) => {
  const base = `elixpo:wishes:${slug}:${year()}`;
  return { pending: `${base}:pending`, mine: `${base}:mine`, cache: `${base}:count` };
};
const read = (key, fallback = 0) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };
const format = (n) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString("en-IN"));

export default function WishCounter({ slug, name }) {
  const k = keys(slug);
  const [server, setServer] = useState(null);
  const [pending, setPending] = useState(0);
  const [mine, setMine] = useState(0);
  const [pops, setPops] = useState([]);
  const [sparks, setSparks] = useState([]);
  const [bump, setBump] = useState(0);
  const [milestone, setMilestone] = useState(null);
  const flushing = useRef(false);

  const fetchCount = useCallback(async (force = false) => {
    const cached = read(k.cache, null);
    if (!force && cached && Date.now() - cached.at < POLL_MS) { setServer(cached.count); return; }
    try {
      const response = await fetch(`${API}/api/wishes/${slug}`);
      if (!response.ok) return;
      const { count } = await response.json();
      write(k.cache, { count, at: Date.now() });
      setServer(count);
    } catch { /* offline: keep the last count */ }
  }, [k.cache, slug]);

  const flush = useCallback(async (beacon = false) => {
    const queued = read(k.pending);
    if (!queued || flushing.current) return;
    // Claim the batch first so another tab cannot send the same wishes.
    const batch = Math.min(queued, MAX_BATCH);
    write(k.pending, queued - batch);
    const body = JSON.stringify({ count: batch });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(`${API}/api/wishes/${slug}`, new Blob([body], { type: "application/json" }));
      return;
    }
    flushing.current = true;
    try {
      const response = await fetch(`${API}/api/wishes/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (response.status === 409) return; // no Elixpo account linked to this portfolio yet: drop the batch
      if (response.status === 429) throw new Error("throttled");
      if (!response.ok) throw new Error(String(response.status));
      // Wishes the server throttle dropped are not retried.
      const { count } = await response.json();
      write(k.cache, { count, at: Date.now() });
      setServer(count);
    } catch {
      write(k.pending, read(k.pending) + batch); // put the batch back and retry next round
    } finally {
      flushing.current = false;
      setPending(read(k.pending));
    }
  }, [k.cache, k.pending, slug]);

  useEffect(() => {
    setPending(read(k.pending));
    setMine(read(k.mine));
    fetchCount();
    const flushTimer = window.setInterval(() => flush(), FLUSH_MS);
    const pollTimer = window.setInterval(() => { if (document.visibilityState === "visible") fetchCount(); }, POLL_MS);
    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    const onStorage = (event) => {
      if (event.key === k.pending) setPending(read(k.pending));
      if (event.key === k.cache) setServer(read(k.cache, null)?.count ?? null);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(flushTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("storage", onStorage);
    };
  }, [fetchCount, flush, k.cache, k.mine, k.pending]);

  const wish = (event) => {
    const sent = read(k.mine) + 1;
    write(k.pending, read(k.pending) + 1);
    write(k.mine, sent);
    setPending(read(k.pending));
    setMine(sent);
    setBump((value) => value + 1);
    navigator.vibrate?.(8);

    const id = Date.now() + Math.random();
    const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)];
    setPops((list) => [...list.slice(-11), { id, color: pick(), x: Math.round((Math.random() - 0.5) * 60) }]);
    // A small spray from where the button was pressed; every 10th wish gets a bigger one.
    const big = sent % 10 === 0;
    const rect = event.currentTarget.getBoundingClientRect();
    const originX = event.clientX ? event.clientX - rect.left : rect.width / 2;
    const originY = event.clientY ? event.clientY - rect.top : rect.height / 2;
    const burst = Array.from({ length: big ? 26 : 8 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / (big ? 26 : 8) + Math.random() * 0.6;
      const distance = (big ? 70 : 34) + Math.random() * (big ? 60 : 22);
      return { id: `${id}-${index}`, color: pick(), x: originX, y: originY, dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - (big ? 20 : 8), r: Math.round(Math.random() * 360) };
    });
    setSparks((list) => [...list.slice(-60), ...burst]);
    if (big) { setMilestone({ id, sent }); window.setTimeout(() => setMilestone((m) => (m?.id === id ? null : m)), 1600); }
    window.setTimeout(() => {
      setPops((list) => list.filter((pop) => pop.id !== id));
      setSparks((list) => list.filter((spark) => !spark.id.startsWith(`${id}-`)));
    }, 1000);
  };

  const total = (server ?? 0) + pending;
  return (
    <div className="wish-counter">
      <button type="button" className="wish-button" onClick={wish} aria-label={`Send ${name} a birthday wish. ${total} wishes so far.`}>
        <span className="wish-button-label"><span aria-hidden="true">🎂</span> Send a wish</span>
        <span key={bump} className={`wish-button-count${bump ? " is-bumped" : ""}`} aria-live="polite">{server == null && !pending ? "…" : format(total)}</span>
        <span key={`ripple-${bump}`} className={bump ? "wish-ripple" : undefined} aria-hidden="true" />
        {sparks.map((spark) => <i key={spark.id} className="wish-spark" style={{ left: spark.x, top: spark.y, background: spark.color, "--dx": `${spark.dx}px`, "--dy": `${spark.dy}px`, "--r": `${spark.r}deg` }} aria-hidden="true" />)}
        {pops.map((pop) => <i key={pop.id} className="wish-pop" style={{ "--x": `${pop.x}px`, color: pop.color }} aria-hidden="true">+1</i>)}
      </button>
      {milestone && <p key={milestone.id} className="wish-milestone" aria-hidden="true">🎉 {milestone.sent} wishes!</p>}
      {mine > 0 && <p className="wish-mine">You sent {format(mine)} {mine === 1 ? "wish" : "wishes"}. Keep going!</p>}
    </div>
  );
}
