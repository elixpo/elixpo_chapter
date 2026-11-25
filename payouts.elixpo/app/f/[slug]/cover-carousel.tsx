"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cover slideshow. Swipe (native scroll-snap), arrows, dots and arrow keys.
 * Autoplay (when the creator enabled it) pauses on hover/focus, when the tab is
 * hidden, and never runs for visitors who prefer reduced motion.
 */
export default function CoverCarousel({ images, autoplay, title }: { images: string[]; autoplay: boolean; title: string }) {
    const track = useRef<HTMLDivElement>(null);
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [reduced, setReduced] = useState(false);
    const count = images.length;

    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(mq.matches);
    }, []);

    const go = useCallback(
        (i: number) => {
            const el = track.current;
            if (!el || !count) return;
            const next = (i + count) % count;
            el.scrollTo({ left: next * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
        },
        [count, reduced],
    );

    // Keep the dot in sync with manual swipes.
    useEffect(() => {
        const el = track.current;
        if (!el) return;
        const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        if (!autoplay || reduced || paused || count < 2) return;
        const t = setInterval(() => {
            if (document.visibilityState === "visible") go(index + 1);
        }, 5000);
        return () => clearInterval(t);
    }, [autoplay, reduced, paused, count, index, go]);

    if (!count) return null;
    return (
        <section
            className="fr-carousel"
            aria-roledescription="carousel"
            aria-label={`${title} — images`}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            onKeyDown={(e) => {
                if (e.key === "ArrowRight") go(index + 1);
                if (e.key === "ArrowLeft") go(index - 1);
            }}
        >
            <div className="fr-carousel-track" ref={track} tabIndex={count > 1 ? 0 : -1}>
                {images.map((src, i) => (
                    <figure className="fr-carousel-slide" key={src} aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
                        {/* biome-ignore lint/performance/noImgElement: creator-supplied remote image */}
                        <img src={src} alt="" loading={i === 0 ? "eager" : "lazy"} referrerPolicy="no-referrer" />
                    </figure>
                ))}
            </div>
            {count > 1 && (
                <>
                    <button type="button" className="fr-carousel-arrow prev" aria-label="Previous image" onClick={() => go(index - 1)}>
                        ‹
                    </button>
                    <button type="button" className="fr-carousel-arrow next" aria-label="Next image" onClick={() => go(index + 1)}>
                        ›
                    </button>
                    <div className="fr-carousel-dots">
                        {images.map((src, i) => (
                            <button
                                type="button"
                                key={src}
                                aria-label={`Show image ${i + 1}`}
                                aria-current={i === index}
                                onClick={() => go(i)}
                            />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}
