"use client";

import { useEffect } from "react";

const SPOTLIGHT = ".featured-card, .family-grid > a, .wiki-entry";

/**
 * One rAF-throttled pointer listener drives two effects: hero shapes drift with the pointer
 * (--mx/--my on .story-hero) and cards light up under the cursor (--px/--py on the card).
 * Fine pointers only, and nothing runs when the reader prefers reduced motion.
 */
export function PointerEffects() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let event: PointerEvent | null = null;

    const apply = () => {
      frame = 0;
      if (!event) return;
      const { clientX: x, clientY: y, target } = event;
      const hero = document.querySelector<HTMLElement>(".story-hero");
      if (hero) {
        const box = hero.getBoundingClientRect();
        if (y < box.bottom) {
          hero.style.setProperty("--mx", (((x - box.left) / box.width) * 2 - 1).toFixed(3));
          hero.style.setProperty("--my", (((y - box.top) / box.height) * 2 - 1).toFixed(3));
        }
      }
      const card = target instanceof Element ? target.closest<HTMLElement>(SPOTLIGHT) : null;
      if (card) {
        const box = card.getBoundingClientRect();
        card.style.setProperty("--px", `${x - box.left}px`);
        card.style.setProperty("--py", `${y - box.top}px`);
      }
    };
    const onMove = (next: PointerEvent) => {
      event = next;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
