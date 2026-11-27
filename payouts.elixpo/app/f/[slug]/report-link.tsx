"use client";

import { useState } from "react";

const REASONS = [
    { v: "scam", l: "It looks like a scam" },
    { v: "misleading", l: "It's misleading or false" },
    { v: "impersonation", l: "It impersonates someone" },
    { v: "inappropriate", l: "Inappropriate content" },
    { v: "other", l: "Something else" },
];

/** "Report this page" — sends the page to Elixpo admins for review. */
export default function ReportLink({ slug }: { slug: string }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("scam");
    const [details, setDetails] = useState("");
    const [email, setEmail] = useState("");
    const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

    const submit = async () => {
        setState("sending");
        const r = await fetch(`/api/fundraisers/${encodeURIComponent(slug)}/report`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, details, email }),
        }).catch(() => null);
        setState(r?.ok ? "sent" : "error");
    };

    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Report this page
            </button>
            {open && (
                <div className="fr-dialog" role="dialog" aria-modal="true" aria-labelledby="fr-report-h">
                    <div>
                        <h3 id="fr-report-h">Report this fundraiser</h3>
                        {state === "sent" ? (
                            <>
                                <p style={{ color: "var(--app-fg-muted)" }}>
                                    Thanks — Elixpo will review this page. If it breaks our rules it will be paused.
                                </p>
                                <div className="fr-dialog-actions">
                                    <button type="button" className="primary" onClick={() => setOpen(false)}>
                                        Close
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="fr-field">
                                    <label htmlFor="fr-r-reason">Reason</label>
                                    <select id="fr-r-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                                        {REASONS.map((r) => (
                                            <option key={r.v} value={r.v}>
                                                {r.l}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="fr-field">
                                    <label htmlFor="fr-r-details">Details (optional)</label>
                                    <textarea
                                        id="fr-r-details"
                                        maxLength={1000}
                                        value={details}
                                        onChange={(e) => setDetails(e.target.value)}
                                    />
                                </div>
                                <div className="fr-field">
                                    <label htmlFor="fr-r-email">Your email (optional, for follow-up)</label>
                                    <input id="fr-r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                                </div>
                                {state === "error" && (
                                    <p className="fr-error" role="alert">
                                        Couldn't send the report. Please try again.
                                    </p>
                                )}
                                <div className="fr-dialog-actions">
                                    <button type="button" onClick={() => setOpen(false)}>
                                        Cancel
                                    </button>
                                    <button type="button" className="primary" disabled={state === "sending"} onClick={submit}>
                                        {state === "sending" ? "Sending…" : "Send report"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
