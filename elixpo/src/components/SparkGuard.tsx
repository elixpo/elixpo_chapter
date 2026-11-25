"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fallback anchor points (left %, top %) tried when a spark's default slot collides with content.
const SLOTS = [[6, 8], [80, 10], [44, 4], [88, 46], [4, 46], [12, 82], [76, 80], [44, 88], [62, 30], [28, 30]];
const MEDIA = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "BUTTON", "INPUT", "TEXTAREA", "SELECT"]);
const PAD = 12; // covers the float animation's travel

const visibleColor = (color: string, minAlpha: number) => {
  if (color === "transparent") return false;
  const channels = color.match(/[\d.]+/g) ?? [];
  return (channels.length === 4 ? Number(channels[3]) : 1) >= minAlpha;
};

/** Whether an element would visibly clash with a sticker placed on top of it. */
function isObstacle(element: Element, hostArea: number) {
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  if (MEDIA.has(element.tagName.toUpperCase())) return true;
  if ([...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return true;
  // Decorative geometry (aria-hidden) only blocks when it is a solid shape, not a hairline circle.
  const decorative = element.closest("[aria-hidden='true']") !== null;
  if (rect.width * rect.height > hostArea * 0.6) return false;
  const bordered = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && visibleColor(style.getPropertyValue(`border-${side.toLowerCase()}-color`), 0.05));
  return visibleColor(style.backgroundColor, decorative ? 0.5 : 0.05) || (!decorative && bordered);
}

const overlaps = (a: DOMRect, b: DOMRect) => a.left - PAD < b.right && a.right + PAD > b.left && a.top - PAD < b.bottom && a.bottom + PAD > b.top;

function settle() {
  document.querySelectorAll<HTMLElement>(".sparks:not([data-spark-free])").forEach((field) => {
    const host = field.parentElement;
    if (!host) return;
    const pieces = [...field.querySelectorAll<HTMLElement>(".spark-chip, .spark-star")];
    pieces.forEach((piece) => { piece.style.removeProperty("left"); piece.style.removeProperty("top"); piece.style.removeProperty("right"); piece.style.removeProperty("bottom"); piece.classList.remove("spark-off"); });
    const hostRect = host.getBoundingClientRect();
    const obstacles = [...host.querySelectorAll("*")].filter((element) => !field.contains(element) && isObstacle(element, hostRect.width * hostRect.height)).map((element) => element.getBoundingClientRect());
    const fieldRect = field.getBoundingClientRect();
    const placed: DOMRect[] = [];
    const clear = (rect: DOMRect) => rect.left >= 0 && rect.right <= document.documentElement.clientWidth && ![...obstacles, ...placed].some((other) => overlaps(rect, other));

    pieces.forEach((piece) => {
      let rect = piece.getBoundingClientRect();
      if (!rect.width) return;
      if (!clear(rect)) {
        const fits = SLOTS.some(([left, top]) => {
          piece.style.left = `${left}%`; piece.style.top = `${top}%`; piece.style.right = "auto"; piece.style.bottom = "auto";
          rect = piece.getBoundingClientRect();
          return rect.right <= fieldRect.right + 1 && rect.bottom <= fieldRect.bottom + 1 && clear(rect);
        });
        if (!fits) { piece.classList.add("spark-off"); return; }
      }
      placed.push(rect);
    });
  });
}

/** Keeps every decorative spark clear of text, controls, cards, images and divider lines. */
export function SparkGuard() {
  const pathname = usePathname();
  useEffect(() => {
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(settle); };
    const timer = window.setTimeout(schedule, 150);
    let resize: number | undefined;
    const onResize = () => { window.clearTimeout(resize); resize = window.setTimeout(schedule, 200); };
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(schedule);
    window.addEventListener("load", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearTimeout(resize);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", schedule);
    };
  }, [pathname]);
  return null;
}
