"use client";

import { useEffect, useRef, useState } from "react";

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };
const money = (minor: number, cur: string) =>
    `${SYMBOL[cur] ?? `${cur} `}${Math.round(minor / 100).toLocaleString(cur === "INR" ? "en-IN" : "en-US")}`;

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(mq.matches);
        const on = () => setReduced(mq.matches);
        mq.addEventListener?.("change", on);
        return () => mq.removeEventListener?.("change", on);
    }, []);
    return reduced;
}

/** Ease-out count-up from 0 to `target` once `run` turns true. */
function useCountUp(target: number, run: boolean, reduced: boolean, ms = 1400): number {
    const [v, setV] = useState(0);
    useEffect(() => {
        if (!run) return;
        if (reduced) return setV(target);
        let raf = 0;
        const t0 = performance.now();
        const tick = (t: number) => {
            const p = Math.min(1, (t - t0) / ms);
            setV(target * (1 - (1 - p) ** 3));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, run, reduced, ms]);
    return v;
}

/**
 * Fundraiser progress: count-up figures, an animated bar with milestone ticks,
 * and the Elixpo panda walking to the current point with a speech bubble.
 * Starts when scrolled into view; respects prefers-reduced-motion.
 */
export default function AnimatedProgress({
    raised,
    goal,
    currency,
    contributors,
    closed,
}: {
    raised: number;
    goal: number;
    currency: string;
    contributors: number;
    closed?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const reduced = usePrefersReducedMotion();
    const [run, setRun] = useState(false);
    const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    setRun(true);
                    io.disconnect();
                }
            },
            { threshold: 0.3 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    const shownRaised = useCountUp(raised, run, reduced);
    const shownPeople = useCountUp(contributors, run, reduced);
    const width = run ? Math.max(pct, raised > 0 ? 2 : 0) : 0;
    // Keep the persona fully on the track at both ends.
    const personaAt = run ? Math.min(96, Math.max(4, pct)) : 4;
    const remaining = Math.max(0, goal - raised);

    const bubble = closed
        ? "Thank you, everyone!"
        : pct >= 100
          ? "Goal reached — thank you!"
          : raised === 0
            ? "Be the first to chip in!"
            : `${Math.round(pct)}% there — ${money(remaining, currency)} to go`;

    return (
        <div className="fr-progress" ref={ref} data-run={run} data-reduced={reduced}>
            <div className="fr-progress-figs">
                <strong>{money(shownRaised, currency)}</strong>
                <span>raised of {money(goal, currency)} goal</span>
            </div>

            <div className="fr-track-wrap">
                <div
                    className="fr-persona"
                    data-edge={personaAt < 22 ? "start" : personaAt > 78 ? "end" : undefined}
                    style={{ left: `${personaAt}%` }}
                    aria-hidden
                >
                    <span className="fr-bubble">{bubble}</span>
                    <span className="fr-persona-face">
                        {/* biome-ignore lint/performance/noImgElement: static mascot */}
                        <img src="/icon.png" alt="" width={34} height={34} />
                    </span>
                </div>
                <div
                    className="fr-bar"
                    role="progressbar"
                    aria-label="Progress toward the goal"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(pct)}
                    aria-valuetext={`${money(raised, currency)} of ${money(goal, currency)}, ${Math.round(pct)}%`}
                >
                    <i style={{ width: `${width}%` }} />
                    {[25, 50, 75].map((m) => (
                        <b key={m} className={pct >= m ? "hit" : ""} style={{ left: `${m}%` }} />
                    ))}
                </div>
            </div>

            <div className="fr-progress-meta">
                <span>{Math.round(run ? pct : 0)}% funded</span>
                <span>
                    {Math.round(shownPeople)} {contributors === 1 ? "contributor" : "contributors"}
                </span>
            </div>
        </div>
    );
}
