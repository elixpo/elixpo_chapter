"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { CustomOAuthScope } from "@/lib/oauth-scope-registry";
import { generatePixelAvatar } from "@/lib/pixel-avatar";
import BackgroundAurora from "../../components/background-aurora";
import {
    AccountSelector,
    OAuthScopeList,
} from "../../components/oauth-consent";
import "../../components/consent.css";

interface AuthorizationRequest {
    clientId: string;
    clientName: string;
    clientDescription?: string;
    homepageUrl?: string;
    redirectUri: string;
    scopes: string[];
    customScopes: CustomOAuthScope[];
    state: string;
    logoUrl?: string | null;
    brandingDisplayName?: string | null;
    brandingPrimaryColor?: string | null;
    brandingAccentColor?: string | null;
    privacyPolicyUrl?: string | null;
    termsOfServiceUrl?: string | null;
    isBrandingVerified?: boolean;
    brandingVerifiedDomain?: string | null;
}

type Account = {
    id: string;
    email: string;
    displayName: string | null;
    username: string | null;
    avatar: string | null;
};

function ClientIcon({
    name,
    homepageUrl,
    clientId,
    logoUrl,
    size = 44,
}: {
    name: string;
    homepageUrl?: string;
    clientId: string;
    logoUrl?: string | null;
    size?: number;
}) {
    const [stage, setStage] = useState(0);
    // Try custom logo URL first, then the app's OWN /favicon.ico, then Google's
    // favicon service, then fall back to a generated pixel avatar.
    const sources = (() => {
        const list: string[] = [];
        if (logoUrl) {
            list.push(logoUrl);
        }
        if (homepageUrl) {
            try {
                const u = new URL(homepageUrl);
                list.push(`${u.origin}/favicon.ico`);
                list.push(
                    `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`,
                );
            } catch {}
        }
        return list;
    })();

    if (stage < sources.length) {
        return (
            <img
                src={sources[stage]}
                alt=""
                width={size}
                height={size}
                onError={() => setStage((s) => s + 1)}
            />
        );
    }

    return (
        <img
            src={generatePixelAvatar(clientId + name, size)}
            alt=""
            width={size}
            height={size}
        />
    );
}

function getContrastColorLocal(hex: string): string {
    if (!hex?.startsWith("#")) return "#FFFFFF";
    let cleanHex = hex.slice(1);
    if (cleanHex.length === 3 || cleanHex.length === 4) {
        cleanHex = cleanHex
            .split("")
            .map((c) => c + c)
            .join("");
    }
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return "#FFFFFF";

    const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

function ConsentFrame({ children }: { children: React.ReactNode }) {
    return (
        <main className="consent-page">
            <BackgroundAurora variant="auth" />
            <div className="consent-shell">{children}</div>
        </main>
    );
}

function AuthorizeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [authRequest, setAuthRequest] = useState<AuthorizationRequest | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number>(600);
    const [hasTimedOut, setHasTimedOut] = useState(false);
    // The signed-in user this authorization is for — shown so the person can
    // confirm which account they're authorizing with.
    const [account, setAccount] = useState<Account | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    // Account being switched to. While set, the card stays covered by a
    // loading overlay until the request has been re-read for that account.
    const [switchTarget, setSwitchTarget] = useState<Account | null>(null);
    const [switchError, setSwitchError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    // Account the session must belong to after a switch; the consent card is
    // only re-enabled once /api/auth/me confirms it.
    const expectedUserId = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                await loadRequest();
            } catch {
                if (cancelled) return;
                expectedUserId.current = null;
                if (reloadKey > 0) {
                    setSwitchTarget(null);
                    setSwitchError(
                        "Couldn't load the selected account. Reload this page to continue.",
                    );
                } else {
                    setError("Failed to load authorization request");
                }
            }
        };
        const loadRequest = async () => {
            const state = searchParams.get("state");
            const clientId = searchParams.get("client_id");
            const redirectUri = searchParams.get("redirect_uri");
            const scope = searchParams.get("scope") || "openid profile email";
            const scopes = scope.split(" ").filter(Boolean);

            if (!state || !clientId || !redirectUri) {
                setError("Invalid authorization request");
                return;
            }

            // 1. Check if user is logged in
            const meRes = await fetch("/api/auth/me", {
                credentials: "include",
                cache: "no-store",
            });
            if (cancelled) return;
            if (!meRes.ok) {
                // Not logged in — redirect to login with ?next= pointing back here
                const currentUrl = `/authorize?${searchParams.toString()}`;
                window.location.href = `/login?next=${encodeURIComponent(currentUrl)}`;
                return;
            }
            let meData: any = null;
            try {
                meData = await meRes.clone().json();
            } catch {
                // handled below
            }
            // After a switch, refuse to show the consent card unless the
            // session is confirmed to be the account that was picked;
            // authorizing uses the cookie session, not what's displayed.
            if (
                expectedUserId.current &&
                meData?.id !== expectedUserId.current
            ) {
                expectedUserId.current = null;
                setError(
                    "We couldn't confirm which account is signed in. Reload this page and try again.",
                );
                return;
            }
            expectedUserId.current = null;
            if (meData?.email) {
                if (!meData.username) {
                    const currentUrl = `/authorize?${searchParams.toString()}`;
                    window.location.href = `/setup-name?next=${encodeURIComponent(currentUrl)}`;
                    return;
                }
                setAccount({
                    id: meData.id,
                    email: meData.email,
                    displayName: meData.displayName ?? null,
                    username: meData.username ?? null,
                    avatar: meData.avatar ?? null,
                });
            }

            const accountsRes = await fetch("/api/auth/accounts", {
                credentials: "include",
                cache: "no-store",
            });
            if (cancelled) return;
            if (accountsRes.ok) {
                const accountData: any = await accountsRes.json();
                setAccounts(accountData.accounts || []);
            }

            try {
                // 2. Fetch client info (public endpoint, no auth needed)
                const [configRes, clientRes] = await Promise.all([
                    fetch("/api/auth/config"),
                    fetch(
                        `/api/auth/oauth-clients?client_id=${encodeURIComponent(clientId)}`,
                    ),
                ]);
                if (cancelled) return;

                // Keep the running countdown when re-reading after a switch.
                if (configRes.ok && reloadKey === 0) {
                    const config = await configRes.json();
                    setTimeRemaining(
                        (config as any).authorizationTimeoutSeconds || 600,
                    );
                }

                if (!clientRes.ok) {
                    const err: any = await clientRes.json();
                    setError(err.error || "Application not found");
                    return;
                }

                const client: any = await clientRes.json();

                // 3. Validate redirect URI is registered
                const registeredUris: string[] = client.redirect_uris || [];
                if (!registeredUris.includes(redirectUri)) {
                    setError(
                        "Redirect URI is not registered for this application",
                    );
                    return;
                }

                setAuthRequest({
                    clientId,
                    clientName: client.name || "Unknown App",
                    clientDescription: client.description || null,
                    homepageUrl: client.homepage_url || null,
                    redirectUri,
                    scopes: scopes.length > 0 ? scopes : client.scopes || [],
                    customScopes: client.custom_scopes || [],
                    state,
                    logoUrl: client.logo_url || null,
                    brandingDisplayName: client.branding_display_name || null,
                    brandingPrimaryColor: client.branding_primary_color || null,
                    brandingAccentColor: client.branding_accent_color || null,
                    privacyPolicyUrl: client.privacy_policy_url || null,
                    termsOfServiceUrl: client.terms_of_service_url || null,
                    isBrandingVerified: client.is_branding_verified || false,
                    brandingVerifiedDomain:
                        client.branding_verified_domain || null,
                });
                setSwitchTarget(null);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load authorization request",
                );
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [searchParams, reloadKey]);

    useEffect(() => {
        if (!authRequest || hasTimedOut) return;
        const timer = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setHasTimedOut(true);
                    setError("Authorization request expired.");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [authRequest, hasTimedOut]);

    const handleAuthorize = async () => {
        if (!authRequest || hasTimedOut || switchTarget) return;
        setIsLoading(true);
        try {
            const res = await fetch("/api/auth/authorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    state: authRequest.state,
                    clientId: authRequest.clientId,
                    redirectUri: authRequest.redirectUri,
                    scopes: authRequest.scopes,
                    approved: true,
                }),
            });
            if (!res.ok) throw new Error("Authorization failed");
            const data: any = await res.json();
            window.location.href = data.redirect_uri;
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Authorization failed",
            );
            setIsLoading(false);
        }
    };

    const handleSwitchAccount = async (userId: string) => {
        if (userId === account?.id || switchTarget) return;
        const target = accounts.find((candidate) => candidate.id === userId);
        if (!target) return;
        setSwitchTarget(target);
        setSwitchError(null);
        expectedUserId.current = target.id;
        try {
            const response = await fetch("/api/auth/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            if (!response.ok) {
                const data: any = await response.json().catch(() => ({}));
                throw new Error(data.error || "Unable to switch account");
            }
            // Re-read the session and request for the new account. The
            // overlay stays up until the load effect clears switchTarget.
            setReloadKey((key) => key + 1);
        } catch (err) {
            setSwitchError(
                err instanceof Error ? err.message : "Unable to switch account",
            );
            expectedUserId.current = null;
            setSwitchTarget(null);
        }
    };

    const handleDeny = () => {
        if (!authRequest || hasTimedOut) return;
        const url = new URL(authRequest.redirectUri);
        url.searchParams.set("error", "access_denied");
        url.searchParams.set("state", authRequest.state);
        window.location.href = url.toString();
    };

    const formatTime = (s: number) =>
        `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

    const hostname = authRequest?.isBrandingVerified
        ? (() => {
              if (authRequest.brandingVerifiedDomain) {
                  return authRequest.brandingVerifiedDomain;
              }
              if (!authRequest.homepageUrl) return "";
              try {
                  return new URL(authRequest.homepageUrl).hostname;
              } catch {
                  return "";
              }
          })()
        : "";

    // --- Error state ---
    if (error) {
        return (
            <ConsentFrame>
                <div className="consent-card">
                    <div
                        className="consent-band"
                        style={
                            {
                                "--band-bg": "#f7ddd6",
                                "--band-ink": "#8a2a17",
                            } as React.CSSProperties
                        }
                        aria-hidden="true"
                    >
                        <i className="ring" />
                        <i className="pill" />
                        <div className="consent-band-label">
                            <span>Authorization request</span>
                            <span>Stopped</span>
                        </div>
                    </div>
                    <div className="consent-body" style={{ paddingTop: 24 }}>
                        <p
                            className="eyebrow"
                            style={{ color: "var(--danger)" }}
                        >
                            Authorization error
                        </p>
                        <h1 className="consent-title">
                            We couldn&apos;t continue this sign-in.
                        </h1>
                        <p className="consent-sub" role="alert">
                            {error}
                        </p>
                        <p className="consent-sub">
                            Go back to the app and start signing in again. If
                            this keeps happening, the app&apos;s sign-in setup
                            may be misconfigured.
                        </p>
                        <div className="consent-actions">
                            <button
                                type="button"
                                className="consent-btn"
                                onClick={() => window.history.back()}
                            >
                                Go back
                            </button>
                            <button
                                type="button"
                                className="consent-btn consent-btn-primary"
                                onClick={() => router.push("/login")}
                            >
                                Return to login
                            </button>
                        </div>
                    </div>
                </div>
            </ConsentFrame>
        );
    }

    // --- Loading state ---
    if (!authRequest) {
        return (
            <ConsentFrame>
                <div
                    className="consent-card"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="consent-band" aria-hidden="true">
                        <i className="ring" />
                        <i className="pill" />
                        <div className="consent-band-label">
                            <span>Authorization request</span>
                            <span className="spinner-sm" />
                        </div>
                    </div>
                    <div className="consent-body" style={{ paddingTop: 24 }}>
                        <p className="eyebrow">Sign in with Elixpo</p>
                        <p className="consent-sub" style={{ marginTop: 0 }}>
                            Preparing a secure sign-in…
                        </p>
                        <div
                            className="consent-skeleton"
                            aria-hidden="true"
                            style={{ marginTop: 16 }}
                        >
                            <span style={{ width: "70%", height: 26 }} />
                            <span style={{ width: "40%" }} />
                            <span style={{ height: 52, marginTop: 10 }} />
                            <span style={{ width: "85%" }} />
                            <span style={{ width: "60%" }} />
                        </div>
                    </div>
                </div>
            </ConsentFrame>
        );
    }

    const appName =
        authRequest.isBrandingVerified && authRequest.brandingDisplayName
            ? authRequest.brandingDisplayName
            : authRequest.clientName;
    const brandColor =
        authRequest.isBrandingVerified && authRequest.brandingPrimaryColor
            ? authRequest.brandingPrimaryColor
            : null;
    const urgent = timeRemaining < 60;
    const busy = isLoading || hasTimedOut || switchTarget !== null;

    // --- Consent screen ---
    return (
        <ConsentFrame>
            <div className="consent-card" aria-busy={switchTarget !== null}>
                {switchTarget && (
                    <div
                        className="consent-overlay"
                        role="status"
                        aria-live="polite"
                    >
                        <img
                            src={
                                switchTarget.avatar ||
                                generatePixelAvatar(switchTarget.email, 56)
                            }
                            alt=""
                        />
                        <div>
                            <strong>
                                Switching to{" "}
                                {switchTarget.displayName || switchTarget.email}
                            </strong>
                            <span>
                                Getting {appName} ready for this account…
                            </span>
                        </div>
                        <div className="consent-progress" />
                    </div>
                )}

                <div
                    className="consent-band"
                    style={
                        brandColor
                            ? ({
                                  "--band-bg": brandColor,
                                  "--band-ink":
                                      getContrastColorLocal(brandColor),
                              } as React.CSSProperties)
                            : undefined
                    }
                >
                    <i className="ring" aria-hidden="true" />
                    <i className="pill" aria-hidden="true" />
                    <div className="consent-band-label">
                        <span>Authorization request</span>
                        <span
                            className="consent-timer"
                            data-urgent={urgent}
                            title="Time left to respond to this request"
                        >
                            <span className="sr-only">Expires in </span>
                            {formatTime(timeRemaining)}
                        </span>
                    </div>
                    <div className="consent-handshake">
                        <div className="consent-logo">
                            <ClientIcon
                                name={authRequest.clientName}
                                homepageUrl={
                                    authRequest.isBrandingVerified
                                        ? authRequest.homepageUrl
                                        : undefined
                                }
                                clientId={authRequest.clientId}
                                logoUrl={
                                    authRequest.isBrandingVerified
                                        ? authRequest.logoUrl
                                        : null
                                }
                                size={48}
                            />
                        </div>
                        <span className="consent-link" aria-hidden="true">
                            ⇄
                        </span>
                        <div className="consent-logo">
                            <img
                                src="/LOGO/logo.png"
                                alt="Elixpo Accounts"
                                width={48}
                                height={48}
                                style={{ objectFit: "contain", padding: 4 }}
                            />
                        </div>
                    </div>
                </div>

                <div className="consent-body">
                    <p className="eyebrow">Sign in with Elixpo</p>
                    <h1 className="consent-title">Continue to {appName}</h1>
                    {hostname ? (
                        <span className="consent-host">
                            <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                aria-hidden="true"
                            >
                                <path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                            Verified · {hostname}
                        </span>
                    ) : (
                        <p className="consent-sub">
                            via the Elixpo Accounts network
                        </p>
                    )}

                    {account && (
                        <AccountSelector
                            account={account}
                            accounts={accounts}
                            disabled={busy}
                            pendingId={switchTarget?.id ?? null}
                            onSwitch={handleSwitchAccount}
                            addHref={`/login?add_account=1&next=${encodeURIComponent(`/authorize?${searchParams.toString()}`)}`}
                        />
                    )}
                    {switchError && (
                        <p className="consent-inline-error" role="alert">
                            {switchError}
                        </p>
                    )}

                    <div className="consent-section">
                        <p className="eyebrow">{appName} will be able to</p>
                        <OAuthScopeList
                            scopes={authRequest.scopes}
                            customScopes={authRequest.customScopes}
                            accentColor={brandColor ?? undefined}
                        />
                    </div>

                    <div className="consent-section consent-note">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                            style={{ flexShrink: 0, marginTop: 1 }}
                        >
                            <rect x="4" y="11" width="16" height="10" rx="2" />
                            <path d="M8 11V7a4 4 0 018 0v4" />
                        </svg>
                        <span>
                            <b>You stay in control.</b> Access renews while you
                            use {appName}. Revoke it anytime from{" "}
                            <a
                                href="/dashboard/services"
                                style={{ color: "var(--green)" }}
                            >
                                connected services
                            </a>
                            .
                        </span>
                    </div>

                    <div className="consent-actions">
                        <button
                            type="button"
                            className="consent-btn"
                            onClick={handleDeny}
                            disabled={busy}
                        >
                            Deny
                        </button>
                        <button
                            type="button"
                            className="consent-btn consent-btn-primary"
                            onClick={handleAuthorize}
                            disabled={busy}
                            style={
                                brandColor
                                    ? ({
                                          "--btn-bg": brandColor,
                                          "--btn-fg":
                                              getContrastColorLocal(brandColor),
                                      } as React.CSSProperties)
                                    : undefined
                            }
                        >
                            {isLoading ? (
                                <>
                                    <span
                                        className="spinner-sm"
                                        style={{
                                            borderColor:
                                                "rgba(255,255,255,0.35)",
                                            borderTopColor: "currentColor",
                                        }}
                                    />
                                    Authorizing…
                                </>
                            ) : (
                                "Authorize"
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div className="consent-footer">
                <span>
                    Don&apos;t recognize this app?{" "}
                    <button
                        type="button"
                        className="text-btn"
                        onClick={() => router.push("/login")}
                    >
                        Go back to safety
                    </button>
                </span>
                {authRequest.isBrandingVerified &&
                    (authRequest.privacyPolicyUrl ||
                        authRequest.termsOfServiceUrl) && (
                        <span style={{ display: "flex", gap: 12 }}>
                            {authRequest.privacyPolicyUrl && (
                                <a
                                    href={authRequest.privacyPolicyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Privacy Policy
                                </a>
                            )}
                            {authRequest.termsOfServiceUrl && (
                                <a
                                    href={authRequest.termsOfServiceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Terms of Service
                                </a>
                            )}
                        </span>
                    )}
                <span className="consent-secured">
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                    >
                        <path d="M12 2l7 4v6c0 5-3.5 9-7 10-3.5-1-7-5-7-10V6l7-4z" />
                    </svg>
                    Secured by Elixpo Accounts
                </span>
            </div>
        </ConsentFrame>
    );
}

export default function AuthorizePage() {
    return (
        <Suspense>
            <AuthorizeContent />
        </Suspense>
    );
}
