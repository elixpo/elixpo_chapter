"use client";

import { useEffect, useState } from "react";

/**
 * Phones: a bottom "Contribute" bar whenever the contribute card is off-screen,
 * so the next step is always one tap away. Hidden on desktop (the card sits in
 * the first viewport there) and once the card is visible.
 */
export default function StickyContribute({ label }: { label: string }) {
    const [show, setShow] = useState(false);
    useEffect(() => {
        const card = document.getElementById("contribute");
        if (!card) return;
        const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { threshold: 0.15 });
        io.observe(card);
        return () => io.disconnect();
    }, []);
    return (
        <div className="fr-sticky" data-show={show} aria-hidden={!show}>
            <button
                type="button"
                tabIndex={show ? 0 : -1}
                onClick={() => {
                    const card = document.getElementById("contribute");
                    card?.scrollIntoView({ behavior: "smooth", block: "start" });
                    setTimeout(() => card?.querySelector<HTMLButtonElement>(".fr-presets button")?.focus({ preventScroll: true }), 500);
                }}
            >
                {label}
            </button>
        </div>
    );
}
