"use client";

import { useEffect, useState } from "react";
import { FUND_URL } from "@/lib/links";
import { LumiNote } from "@/components/Lumi";

// Same-origin Pages Function first (functions/api/supporters.js); the
// payouts API directly as a fallback, which works once it sends CORS.
const SOURCES = ["/api/supporters", "https://payouts.elixpo.com/api/fundraisers/falera-badge"];

type Money = { amount: number; currency: string };
type Supporter = {
  name: string | null;
  message: string | null;
  amount: number;
  currency: string;
  paid_at: string;
};
type Fund = {
  title?: string;
  goal: Money;
  raised: number;
  contributors: number;
  ended?: boolean;
  supporters: Supporter[];
};

// Amounts come in the smallest unit (paise, cents).
function money(amount: number, currency: string) {
  const v = amount / 100;
  if (currency === "USD") return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function when(s: string) {
  const d = new Date(s.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function useFund() {
  const [fund, setFund] = useState<Fund | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const src of SOURCES) {
        try {
          const r = await fetch(src, { cache: "no-store" });
          if (!r.ok) continue;
          const d = await r.json();
          if (d && d.goal && Array.isArray(d.supporters)) {
            if (!cancelled) setFund(d);
            return;
          }
        } catch {
          // try the next source
        }
      }
      if (!cancelled) setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { fund, failed };
}

/** The live fundraiser total and the supporters' names, fetched in the
 *  browser. The progress card keeps its height while it loads. */
export default function SupportersLive() {
  const { fund, failed } = useFund();
  const pct = fund ? Math.min(100, Math.round((fund.raised / fund.goal.amount) * 100)) : 0;

  return (
    <>
      <div className="card min-h-[13rem] p-6 sm:p-8">
        <p className="eyebrow">Raised so far</p>
        {fund ? (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <p className="font-display text-[2.5rem] font-bold leading-none tracking-[-0.03em] text-accent tabular-nums">
                {money(fund.raised, fund.goal.currency)}
                <span className="ml-2 text-lg font-normal tracking-normal text-text-dim">
                  of {money(fund.goal.amount, fund.goal.currency)}
                </span>
              </p>
              <p className="text-text-dim">
                {fund.contributors} {fund.contributors === 1 ? "supporter" : "supporters"}
              </p>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-pill border border-border bg-card-sub" role="progressbar"
                 aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                 aria-label="Fundraiser progress">
              <div className="h-full rounded-pill bg-accent"
                   style={{ width: `${Math.max(pct, fund.raised > 0 ? 2 : 0)}%` }} />
            </div>
            <p className="mt-2 text-sm text-text-dim">{pct}% of the goal</p>
          </>
        ) : (
          <LumiNote pose="pet" className="mt-4">
            <p className="text-text-dim" aria-live="polite">
              {failed
                ? "The live total couldn't load. Lumi checked twice; it's on the fundraiser page."
                : "Lumi is counting the live total…"}
            </p>
          </LumiNote>
        )}
        <a href={FUND_URL} target="_blank" rel="noreferrer" className="btn-accent mt-6">
          Fund the badge. Even ₹10 helps
        </a>
      </div>

      <h2 className="h-title mt-16">Supporters</h2>
      {fund && fund.supporters.length > 0 ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fund.supporters.map((s, i) => (
            <li key={`${s.paid_at}-${i}`} className="card flex flex-col gap-2 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-bold text-text">{s.name || "Anonymous"}</p>
                <p className="font-mono text-sm text-accent">{money(s.amount, s.currency)}</p>
              </div>
              {s.message ? <p className="text-sm leading-relaxed text-text-dim">“{s.message}”</p> : null}
              <p className="mt-auto font-mono text-xs text-muted">{when(s.paid_at)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card mt-8 p-6 text-text-dim">
          {fund
            ? "No supporters yet. Be the first, and your name goes here."
            : failed
              ? <>See every supporter on the <a className="link" href={FUND_URL} target="_blank" rel="noreferrer">fundraiser page</a>.</>
              : "Loading supporters…"}
        </div>
      )}
    </>
  );
}
