"use client";

import { useEffect, useState } from "react";

// Live star count for the header's GitHub pill. Cached in sessionStorage
// for ten minutes so a visit makes at most one API call. On any failure
// (offline, rate-limited) `stars` stays null and the pill shows "GitHub".
const REPO = "elixpo/falera";
const CACHE_KEY = "falera-gh-stars";
const TTL_MS = 10 * 60 * 1000;

export function useGithubStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let aborted = false;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj.stars === "number" && Date.now() - obj.ts < TTL_MS) {
          setStars(obj.stars);
          return;
        }
      }
    } catch { /* storage blocked: fetch anyway */ }

    fetch(`https://api.github.com/repos/${REPO}`, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        if (aborted || typeof j.stargazers_count !== "number") return;
        setStars(j.stargazers_count);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), stars: j.stargazers_count }));
        } catch { /* private mode */ }
      })
      .catch(() => { /* keep null: the pill says "GitHub" */ });
    return () => { aborted = true; };
  }, []);

  return stars;
}

export function formatStars(n: number): string {
  if (n >= 10_000) return (n / 1000).toFixed(0) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
