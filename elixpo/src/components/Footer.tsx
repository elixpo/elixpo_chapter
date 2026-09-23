"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Github, MessagesSquare, Heart, Star } from "lucide-react";
import { ELIXPO_LINKS } from "@/lib/elixpo-links";
import { ECOSYSTEM_PRODUCTS } from "@/lib/catalog";

// Single source of truth - exactly the projects shown on /projects.
const ecosystem = ECOSYSTEM_PRODUCTS.map((product) => ({ label: product.name, href: product.url }));

const community = [
  { label: "GitHub Org", href: ELIXPO_LINKS.github },
  { label: "Chapter Monorepo", href: ELIXPO_LINKS.githubChapter },
  { label: "GitHub Discussions", href: ELIXPO_LINKS.discussions },
  { label: "GitHub Sponsors", href: ELIXPO_LINKS.sponsors },
];

const legal = [
  { label: "Terms of Service", href: ELIXPO_LINKS.terms, external: false },
  { label: "Privacy Policy", href: ELIXPO_LINKS.privacy, external: false },
  { label: "License", href: `${ELIXPO_LINKS.githubChapter}/blob/main/LICENSE`, external: true },
];

export function Footer() {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(ELIXPO_LINKS.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <footer className="bg-black border-t border-white/10 px-4 sm:px-6 lg:px-8 pt-16 pb-10 relative overflow-hidden">
      {/* Ambient brand glow */}
      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[60vw] h-[240px] bg-primary/[0.05] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-10 lg:gap-8 mb-14">

          {/* Brand block */}
          <div className="lg:col-span-1">
            <h3 className="text-2xl font-serif italic text-[#E1E0CC] mb-3">Elixpo Chapter</h3>
            <p className="text-sm text-[#DEDBC8]/65 leading-relaxed max-w-xs mb-5">
              An open-source ecosystem of interconnected AI and developer tools, built by a
              global community of {`45+`} contributors. Free and open source, forever.
            </p>
            <div className="flex items-center gap-3">
              <a
                href={ELIXPO_LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="p-2 rounded-lg border border-white/10 text-[#DEDBC8]/70 hover:text-white hover:border-white/30 transition-colors"
              >
                <Github size={16} />
              </a>
              <a
                href={ELIXPO_LINKS.discussions}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub Discussions"
                className="p-2 rounded-lg border border-white/10 text-[#DEDBC8]/70 hover:text-white hover:border-white/30 transition-colors"
              >
                <MessagesSquare size={16} />
              </a>
              <a
                href={ELIXPO_LINKS.sponsors}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Sponsor"
                className="p-2 rounded-lg border border-white/10 text-[#DEDBC8]/70 hover:text-primary hover:border-primary/30 transition-colors"
              >
                <Heart size={16} />
              </a>
            </div>
          </div>

          {/* Ecosystem links */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-mono text-[#DEDBC8]/50 mb-4">Ecosystem</h4>
            <ul className="space-y-2.5">
              {ecosystem.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#DEDBC8]/75 hover:text-white transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community links */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-mono text-[#DEDBC8]/50 mb-4">Community</h4>
            <ul className="space-y-2.5">
              {community.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#DEDBC8]/75 hover:text-white transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-mono text-[#DEDBC8]/50 mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {legal.map((item) =>
                item.external ? (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#DEDBC8]/75 hover:text-white transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ) : (
                  <li key={item.label}>
                    <Link href={item.href} className="text-sm text-[#DEDBC8]/75 hover:text-white transition-colors">
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Developer contact */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-mono text-[#DEDBC8]/50 mb-4">Get in touch</h4>
            <p className="text-sm text-[#DEDBC8]/65 mb-3 leading-relaxed">
              Questions, partnerships, or just want to say hi? Reach the developers directly.
            </p>
            <button
              onClick={copyEmail}
              className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/[0.04] hover:border-primary/30 transition-colors"
              aria-label="Copy email address"
            >
              <span className="text-sm font-mono text-[#DEDBC8] group-hover:text-white transition-colors">
                {ELIXPO_LINKS.email}
              </span>
              {copied ? (
                <Check size={14} className="text-green-400" />
              ) : (
                <Copy size={14} className="text-[#DEDBC8]/60 group-hover:text-primary transition-colors" />
              )}
            </button>
            {copied && (
              <span className="block text-[10px] font-mono text-green-400/80 mt-2">Copied to clipboard!</span>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <span className="text-[#DEDBC8]/55 font-mono">
            © 2026 Elixpo Chapter · MIT &amp; CC-BY-4.0 · Built in the open
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link href={ELIXPO_LINKS.architecture} className="text-[#DEDBC8]/60 hover:text-white transition-colors">
              Architecture
            </Link>
            <Link href={ELIXPO_LINKS.assets} className="text-[#DEDBC8]/60 hover:text-white transition-colors">
              Brand
            </Link>
            <a href={ELIXPO_LINKS.blog} target="_blank" rel="noopener noreferrer" className="text-[#DEDBC8]/60 hover:text-white transition-colors">
              Blog
            </a>
            {/* GitHub star CTA (replaces the elixpo.com link) */}
            <a
              href={ELIXPO_LINKS.githubChapter}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-full bg-primary text-black font-semibold px-4 py-1.5 hover:opacity-90 transition-opacity"
            >
              <Star size={12} className="group-hover:fill-black transition-all" />
              <span>Star on GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
