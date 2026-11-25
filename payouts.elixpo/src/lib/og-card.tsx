/**
 * The link-preview card for fundraisers (1200×630): flat geometric shapes on
 * paper in the site's colours, the title, raised of goal, a progress bar, the
 * supporter count and a call to action. Rendered by app/f/[slug]/og.png.
 * Fonts are embedded (src/lib/og-fonts.ts), so nothing is fetched at render.
 */
import { ImageResponse } from "next/og";
import {
    BRAND,
    CARD_SIZE,
    type CardState,
    formatRupees,
    progressPercent,
    stripEmoji,
    supportersLabel,
    truncateAtWord,
} from "./fundraiser-share";
import { INTER_EXTRABOLD, INTER_SEMIBOLD } from "./og-fonts";

export interface FundraiserCard {
    title: string;
    slug: string;
    raised: number; // paise
    goal: number; // paise
    supporters: number;
    state: CardState;
}

const C = {
    paper: "#fbfbf8",
    ink: "#142018",
    muted: "#5f6962",
    track: "#e4e8e2",
    blue: "#3a65c7",
    blueWash: "#cbdcff",
    pink: "#d6336c",
    yellow: "#f1c64f",
    mint: "#d4eadf",
    green: "#0b623c",
    orange: "#e76043",
};

const HOST = "payouts.elixpo.com";

/** Small geometric mark + wordmark. */
function Wordmark() {
    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", width: 34, height: 34, borderRadius: 17, background: C.ink, position: "relative" }}>
                <div
                    style={{
                        position: "absolute",
                        left: 17,
                        top: 0,
                        width: 17,
                        height: 17,
                        background: C.yellow,
                        borderTopRightRadius: 17,
                    }}
                />
            </div>
            <div style={{ display: "flex", marginLeft: 14, fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: -0.5 }}>
                {BRAND}
            </div>
        </div>
    );
}

/** Right-hand art: a 2×3 grid of flat shapes, 180×210 per cell. */
function Art() {
    const cell = { display: "flex", width: 180, height: 210, position: "relative" as const, overflow: "hidden" as const };
    return (
        <div style={{ position: "absolute", right: 0, top: 0, width: 360, height: 630, display: "flex", flexWrap: "wrap" }}>
            <div style={{ ...cell, alignItems: "center", justifyContent: "center" }}>
                <div style={{ display: "flex", width: 140, height: 140, borderRadius: 70, background: C.yellow }} />
            </div>
            <div style={{ ...cell, background: C.blue }}>
                <div style={{ position: "absolute", left: 0, bottom: 0, width: 180, height: 180, borderTopRightRadius: 180, background: C.blueWash }} />
            </div>
            <div style={{ ...cell, background: C.ink }}>
                <div style={{ position: "absolute", left: 20, top: 20, width: 140, height: 140, borderRadius: 70, background: C.pink }} />
                <div style={{ position: "absolute", left: 20, top: 90, width: 140, height: 70, background: C.ink }} />
            </div>
            <div style={{ ...cell, background: C.mint, flexDirection: "column", justifyContent: "center", paddingLeft: 30 }}>
                <div style={{ display: "flex", width: 120, height: 22, borderRadius: 11, background: C.green }} />
                <div style={{ display: "flex", width: 84, height: 22, borderRadius: 11, background: C.green, marginTop: 16 }} />
                <div style={{ display: "flex", width: 48, height: 22, borderRadius: 11, background: C.green, marginTop: 16 }} />
            </div>
            <div style={{ ...cell, background: C.pink }}>
                <div style={{ position: "absolute", right: 0, top: 0, width: 180, height: 180, borderBottomLeftRadius: 180, background: C.yellow }} />
            </div>
            <div style={{ ...cell, alignItems: "flex-end", justifyContent: "center" }}>
                <div style={{ display: "flex", width: 140, height: 70, borderTopLeftRadius: 70, borderTopRightRadius: 70, background: C.orange }} />
            </div>
        </div>
    );
}

function Pill({ label, bg, fg, border }: { label: string; bg: string; fg: string; border?: string }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                whiteSpace: "nowrap",
                padding: "16px 30px",
                borderRadius: 999,
                background: bg,
                color: fg,
                fontSize: 28,
                fontWeight: 800,
                border: border ? `3px solid ${border}` : "3px solid transparent",
            }}
        >
            {label}
        </div>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                position: "relative",
                background: C.paper,
                color: C.ink,
                fontFamily: "Inter",
            }}
        >
            <Art />
            <div style={{ display: "flex", flexDirection: "column", width: 840, height: 630, overflow: "hidden", padding: "54px 60px 54px 64px" }}>
                {children}
            </div>
        </div>
    );
}

function titleSize(t: string): number {
    if (t.length <= 24) return 72;
    if (t.length <= 44) return 62;
    return 52;
}

function FundraiserCardView({ card }: { card: FundraiserCard }) {
    const title = truncateAtWord(stripEmoji(card.title), 70);
    const pct = progressPercent(card.raised, card.goal);
    const fill = card.raised > 0 ? Math.max(pct, 2) : 0;
    const url = `${HOST}/f/${card.slug}`;
    return (
        <Shell>
            <Wordmark />
            <div
                style={{
                    display: "flex",
                    marginTop: 34,
                    fontSize: titleSize(title),
                    fontWeight: 800,
                    lineHeight: 1.06,
                    letterSpacing: -1.5,
                }}
            >
                {title}
            </div>
            <div style={{ display: "flex", flexGrow: 1 }} />
            <div style={{ display: "flex", alignItems: "baseline" }}>
                <div style={{ display: "flex", fontSize: 60, fontWeight: 800, letterSpacing: -1 }}>{formatRupees(card.raised)}</div>
                <div style={{ display: "flex", marginLeft: 14, fontSize: 30, fontWeight: 600, color: C.muted }}>
                    {`raised of ${formatRupees(card.goal)}`}
                </div>
            </div>
            <div style={{ display: "flex", marginTop: 16, width: 716, height: 20, borderRadius: 10, background: C.track }}>
                <div style={{ display: "flex", width: `${fill}%`, height: 20, borderRadius: 10, background: C.pink }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", width: 716, marginTop: 12, fontSize: 26, fontWeight: 600, color: C.muted }}>
                <div style={{ display: "flex" }}>{`${pct}% funded`}</div>
                <div style={{ display: "flex" }}>{supportersLabel(card.supporters)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 30 }}>
                {card.state === "live" ? (
                    <Pill label="Back this project →" bg={C.ink} fg="#ffffff" />
                ) : card.state === "funded" ? (
                    <Pill label="Funded" bg={C.green} fg="#ffffff" />
                ) : (
                    <Pill label="Ended" bg={C.paper} fg={C.ink} border={C.ink} />
                )}
                <div style={{ display: "flex", marginLeft: 22, whiteSpace: "nowrap", fontSize: url.length > 36 ? 20 : 24, fontWeight: 600, color: C.blue }}>
                    {url}
                </div>
            </div>
        </Shell>
    );
}

function GenericCardView() {
    return (
        <Shell>
            <Wordmark />
            <div style={{ display: "flex", marginTop: 40, fontSize: 72, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1.5 }}>
                Fundraisers for the things people build
            </div>
            <div style={{ display: "flex", marginTop: 24, fontSize: 30, fontWeight: 600, color: C.muted, lineHeight: 1.3 }}>
                Back a project with UPI or a card.
            </div>
            <div style={{ display: "flex", flexGrow: 1 }} />
            <div style={{ display: "flex", alignItems: "center" }}>
                <Pill label="Start a fundraiser →" bg={C.ink} fg="#ffffff" />
                <div style={{ display: "flex", marginLeft: 22, whiteSpace: "nowrap", fontSize: 24, fontWeight: 600, color: C.blue }}>{HOST}</div>
            </div>
        </Shell>
    );
}

/** Fresh numbers within minutes; stale copies are served while a new one renders. */
export const CARD_CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";

/** Render the card for a fundraiser, or the generic Elixpo Payouts card when `card` is null. */
export function renderCard(card: FundraiserCard | null, cacheControl = CARD_CACHE_CONTROL): ImageResponse {
    return new ImageResponse(card ? <FundraiserCardView card={card} /> : <GenericCardView />, {
        ...CARD_SIZE,
        fonts: [
            { name: "Inter", data: INTER_SEMIBOLD, weight: 600, style: "normal" },
            { name: "Inter", data: INTER_EXTRABOLD, weight: 800, style: "normal" },
        ],
        headers: { "cache-control": cacheControl },
    });
}
