"use client";

import { useState } from "react";
import {
    type CustomOAuthScope,
    findScopeOption,
} from "@/lib/oauth-scope-registry";
import { generatePixelAvatar } from "@/lib/pixel-avatar";
import "./consent.css";

export type ConsentAccount = {
    id: string;
    email: string;
    displayName: string | null;
    avatar?: string | null;
};

function avatarFor(account: ConsentAccount, size = 36) {
    return account.avatar || generatePixelAvatar(account.email, size);
}

function AccountMeta({ account }: { account: ConsentAccount }) {
    return (
        <span className="account-meta">
            <strong>{account.displayName || account.email}</strong>
            {account.displayName && <span>{account.email}</span>}
        </span>
    );
}

/**
 * Shows which account the request is for and lets the person switch to
 * another signed-in account. `pendingId` marks the account being switched
 * to so the row can show progress until the parent finishes reloading.
 */
export function AccountSelector({
    account,
    accounts,
    disabled,
    onSwitch,
    addHref,
    pendingId = null,
}: {
    account: ConsentAccount;
    accounts: ConsentAccount[];
    disabled: boolean;
    onSwitch: (userId: string) => void;
    addHref: string;
    pendingId?: string | null;
}) {
    const others = accounts.filter((candidate) => candidate.id !== account.id);
    const [open, setOpen] = useState(false);
    const expanded = open || pendingId !== null;

    return (
        <div className="consent-section">
            <p className="eyebrow">Continuing as</p>
            <div className="account-row" data-current="true">
                <img src={avatarFor(account)} alt="" width={36} height={36} />
                <AccountMeta account={account} />
                <span className="account-tag">Active</span>
            </div>

            {expanded && others.length > 0 && (
                <div
                    className="account-list"
                    role="listbox"
                    aria-label="Switch to another account"
                >
                    {others.map((candidate) => {
                        const pending = pendingId === candidate.id;
                        return (
                            <button
                                key={candidate.id}
                                type="button"
                                role="option"
                                aria-selected={pending}
                                className="account-row"
                                data-pending={pending}
                                disabled={disabled}
                                onClick={() => onSwitch(candidate.id)}
                            >
                                <img
                                    src={avatarFor(candidate)}
                                    alt=""
                                    width={36}
                                    height={36}
                                />
                                <AccountMeta account={candidate} />
                                {pending ? (
                                    <span
                                        className="spinner-sm"
                                        role="img"
                                        aria-label="Switching"
                                    />
                                ) : (
                                    <span aria-hidden="true">→</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="account-actions">
                {others.length > 0 ? (
                    <button
                        type="button"
                        className="text-btn"
                        disabled={disabled}
                        aria-expanded={expanded}
                        onClick={() => setOpen((value) => !value)}
                    >
                        {expanded
                            ? "Hide other accounts"
                            : `Switch account (${others.length})`}
                    </button>
                ) : (
                    <span />
                )}
                <a
                    href={addHref}
                    className="text-btn"
                    aria-disabled={disabled}
                    onClick={(event) => {
                        if (disabled) event.preventDefault();
                    }}
                >
                    + Add another account
                </a>
            </div>
        </div>
    );
}

export function OAuthScopeList({
    scopes,
    customScopes = [],
    accentColor,
}: {
    scopes: string[];
    customScopes?: CustomOAuthScope[];
    accentColor?: string;
}) {
    return (
        <ul
            className="scope-list"
            style={
                accentColor
                    ? ({ "--scope-accent": accentColor } as React.CSSProperties)
                    : undefined
            }
        >
            {scopes.map((scope) => {
                const detail = findScopeOption(scope, customScopes) || {
                    label: scope,
                    description: "Use this permission as registered.",
                    highImpact: false,
                    group: "unavailable" as const,
                };
                const highImpact = detail.highImpact === true;
                return (
                    <li key={scope} data-high={highImpact}>
                        <span className="scope-check" aria-hidden="true">
                            {highImpact ? "!" : "✓"}
                        </span>
                        <span>
                            <strong>
                                {detail.label}
                                {detail.group === "custom" && (
                                    <span className="scope-badge">
                                        App-defined
                                    </span>
                                )}
                                {highImpact && (
                                    <span className="scope-badge">
                                        High impact
                                    </span>
                                )}
                            </strong>
                            <small>{detail.description}</small>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
