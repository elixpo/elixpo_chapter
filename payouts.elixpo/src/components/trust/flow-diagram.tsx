import type React from "react";

/**
 * "How it works" step diagram used on every payment surface. Horizontal on
 * wide screens, vertical on narrow ones; framework-agnostic (plain elements +
 * CSS variables, styles scoped under .flowd) and server-component safe.
 *
 *   <FlowDiagram steps={[{ icon: "phone", title: "You pay", body: "…" }, …]} />
 */
export type FlowIcon = "phone" | "shield" | "panda" | "bank" | "app" | "key" | "mail" | "split" | "check" | "code" | "heart" | "refund";

export interface FlowStep {
    icon: FlowIcon;
    title: string;
    body: React.ReactNode;
}

const PATHS: Record<Exclude<FlowIcon, "panda">, React.ReactNode> = {
    phone: (
        <>
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M10.5 18.5h3" />
        </>
    ),
    shield: (
        <>
            <path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.5 7.5 10 4.3-1.5 7.5-5.4 7.5-10v-6Z" />
            <path d="m8.8 12 2.2 2.2 4.2-4.4" />
        </>
    ),
    bank: (
        <>
            <path d="M3 9.5 12 4l9 5.5" />
            <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
            <path d="M3 20.5h18" />
        </>
    ),
    app: (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
        </>
    ),
    key: (
        <>
            <circle cx="8" cy="15" r="4" />
            <path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l2 2" />
        </>
    ),
    mail: (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m4 7 8 6 8-6" />
        </>
    ),
    split: (
        <>
            <path d="M12 3v6" />
            <path d="M12 9c0 4-6 4-6 9M12 9c0 4 6 4 6 9" />
            <path d="m4 16 2 2.5L8 16M16 16l2 2.5 2-2.5" />
        </>
    ),
    check: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="m8 12.5 2.8 2.8L16.5 9.5" />
        </>
    ),
    code: (
        <>
            <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />
        </>
    ),
    heart: (
        <path d="M12 20.5s-7-4.3-9-8.6C1.6 8.7 3.6 5 7.1 5c2 0 3.4 1.1 4.9 2.9C13.5 6.1 14.9 5 16.9 5c3.5 0 5.5 3.7 4.1 6.9-2 4.3-9 8.6-9 8.6Z" />
    ),
    refund: (
        <>
            <path d="M4 9a8 8 0 1 1-1 5" />
            <path d="M4 4v5h5" />
            <path d="M12 8v8M9.5 10.5c0-1 1-1.6 2.5-1.6s2.5.6 2.5 1.6-1 1.4-2.5 1.6-2.5.6-2.5 1.6 1 1.6 2.5 1.6 2.5-.6 2.5-1.6" />
        </>
    ),
};

function Icon({ name }: { name: FlowIcon }) {
    if (name === "panda") {
        // biome-ignore lint/performance/noImgElement: static brand mascot
        return <img src="/icon.png" alt="" width={34} height={34} style={{ objectFit: "contain" }} />;
    }
    return (
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {PATHS[name]}
        </svg>
    );
}

export default function FlowDiagram({
    steps,
    title,
    compact = false,
}: {
    steps: FlowStep[];
    /** Optional accessible heading for the diagram. */
    title?: string;
    /** Smaller nodes for cards and side panels. */
    compact?: boolean;
}) {
    return (
        <figure className={`flowd${compact ? " flowd-compact" : ""}`} aria-label={title ?? "How it works"}>
            <ol style={{ ["--n" as string]: steps.length } as React.CSSProperties}>
                {steps.map((s, i) => (
                    <li key={s.title}>
                        <span className={`flowd-node${i === steps.length - 1 ? " last" : ""}`}>
                            <Icon name={s.icon} />
                        </span>
                        <div>
                            <b>{s.title}</b>
                            <span>{s.body}</span>
                        </div>
                    </li>
                ))}
            </ol>
            <style>{`
                .flowd { margin: 0; }
                .flowd ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
                .flowd li { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 0.6rem; }
                .flowd li > div { display: flex; flex-direction: column; align-items: inherit; }
                .flowd li:not(:last-child)::after {
                    content: ""; position: absolute; top: 31px; left: calc(50% + 38px); right: calc(-50% + 38px); height: 2px;
                    background: repeating-linear-gradient(90deg, var(--app-fg-faint) 0 6px, transparent 6px 12px);
                }
                .flowd-node {
                    display: grid; place-items: center; width: 62px; height: 62px; margin-bottom: 0.75rem; flex-shrink: 0;
                    border-radius: 20px; background: var(--app-bg-2); border: 1px solid var(--app-border); color: var(--app-fg);
                }
                .flowd-node.last {
                    background: color-mix(in srgb, var(--app-success) 12%, transparent);
                    border-color: color-mix(in srgb, var(--app-success) 40%, transparent); color: var(--app-success);
                }
                .flowd b { font-size: 0.95rem; color: var(--app-fg); }
                .flowd li > div > span { margin-top: 0.3rem; color: var(--app-fg-muted); font-size: 0.8rem; line-height: 1.5; }
                .flowd-compact .flowd-node { width: 48px; height: 48px; border-radius: 15px; margin-bottom: 0.55rem; }
                .flowd-compact .flowd-node svg { width: 22px; height: 22px; }
                .flowd-compact .flowd-node img { width: 28px; height: 28px; }
                .flowd-compact li:not(:last-child)::after { top: 24px; left: calc(50% + 30px); right: calc(-50% + 30px); }
                .flowd-compact b { font-size: 0.86rem; }
                .flowd-compact li > div > span { font-size: 0.74rem; }
                @media (max-width: 760px) {
                    .flowd ol { grid-template-columns: 1fr; gap: 1rem; }
                    .flowd li { flex-direction: row; align-items: flex-start; text-align: left; gap: 0.85rem; padding: 0; }
                    .flowd-node { margin: 0; width: 50px; height: 50px; border-radius: 16px; }
                    .flowd li:not(:last-child)::after {
                        top: 54px; bottom: -12px; left: 24px; right: auto; width: 2px; height: auto;
                        background: repeating-linear-gradient(180deg, var(--app-fg-faint) 0 6px, transparent 6px 12px);
                    }
                }
            `}</style>
        </figure>
    );
}
