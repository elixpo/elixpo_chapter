import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MuiThemeBridge } from "./components/mui-theme";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "./components/theme-provider";

const SITE_URL = "https://accounts.elixpo.com";

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fbfbf8" },
        { media: "(prefers-color-scheme: dark)", color: "#0f1712" },
    ],
    colorScheme: "light dark",
};

export const metadata: Metadata = {
    title: {
        default: "Elixpo Accounts — Single Sign-On & User Management",
        template: "%s | Elixpo Accounts",
    },
    description:
        "Add branded sign-in, sign-out, SSO, passkeys, social login, sessions, and user management to any app with hosted OAuth/OIDC and a TypeScript SDK.",
    applicationName: "Elixpo Accounts",
    category: "technology",
    referrer: "strict-origin-when-cross-origin",
    formatDetection: { email: false, address: false, telephone: false },
    manifest: "/manifest.webmanifest",
    keywords: [
        "authentication platform",
        "user management",
        "single sign-on",
        "OAuth 2.0 provider",
        "OpenID Connect",
        "social login",
        "passkey authentication",
        "hosted authentication",
        "TypeScript authentication SDK",
        "edge authentication",
        "Elixpo account",
        "Elixpo login",
        "Elixpo SSO",
    ],
    authors: [{ name: "Elixpo", url: "https://elixpo.com" }],
    creator: "Elixpo",
    publisher: "Elixpo",
    metadataBase: new URL(SITE_URL),
    openGraph: {
        type: "website",
        locale: "en_US",
        url: SITE_URL,
        siteName: "Elixpo Accounts",
        title: "Authentication, SSO & User Management for Any App",
        description:
            "Five sign-in providers, passkeys, account switching, secure sessions, branded hosted screens, and a standards-based TypeScript SDK.",
        images: [
            {
                url: "/og-image.png",
                width: 1280,
                height: 720,
                alt: "Elixpo Accounts authentication and user management platform",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Authentication, SSO & User Management for Any App",
        description:
            "Five sign-in providers, passkeys, account switching, secure sessions, branded hosted screens, and a standards-based TypeScript SDK.",
        images: ["/og-image.png"],
    },
    icons: {
        // Served as static assets from public/. Keeping them out of app/
        // avoids @cloudflare/next-on-pages turning each into an edge
        // route that needs `export const runtime = 'edge'`.
        icon: [
            { url: "/icon.png", sizes: "32x32", type: "image/png" },
            { url: "/icon0.png", sizes: "192x192", type: "image/png" },
            { url: "/icon1.png", sizes: "512x512", type: "image/png" },
        ],
        apple: {
            url: "/apple-icon.png",
            sizes: "180x180",
            type: "image/png",
        },
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
};

const websiteStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            "@id": "https://elixpo.com/#organization",
            name: "Elixpo",
            url: "https://elixpo.com",
            logo: "https://accounts.elixpo.com/icon1.png",
            sameAs: ["https://github.com/elixpo"],
        },
        {
            "@type": "WebSite",
            "@id": "https://accounts.elixpo.com/#website",
            url: "https://accounts.elixpo.com",
            name: "Elixpo Accounts",
            description:
                "Authentication, single sign-on, and user management for web and edge applications.",
            publisher: { "@id": "https://elixpo.com/#organization" },
            inLanguage: "en",
        },
        {
            "@type": "WebApplication",
            "@id": "https://accounts.elixpo.com/#webapp",
            name: "Elixpo Accounts",
            url: "https://accounts.elixpo.com",
            applicationCategory: "SecurityApplication",
            operatingSystem: "Any",
            browserRequirements: "Requires JavaScript",
            offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
            publisher: { "@id": "https://elixpo.com/#organization" },
        },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" data-theme="light" suppressHydrationWarning>
            <head>
                {/* Set the saved theme before first paint (no flash). */}
                {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
                <script
                    dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
                />
            </head>
            <body className="antialiased">
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(websiteStructuredData).replace(
                            /</g,
                            "\\u003c",
                        ),
                    }}
                />
                <ThemeProvider>
                    <MuiThemeBridge>{children}</MuiThemeBridge>
                </ThemeProvider>
            </body>
        </html>
    );
}
