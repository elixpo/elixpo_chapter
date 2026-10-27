import type { Metadata } from 'next';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Research Paper — Low-Latency LLM Web Search',
  description: 'Read the OreoLook research paper on a three-layer caching architecture for low-latency, source-grounded LLM web search on commodity CPU hardware.',
  alternates: { canonical: '/paper' },
};

export default function PaperPage() {
  return (
    <div className="paper-shell flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 md:px-12 py-4 border-b border-white/[0.06] max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <div className="w-px h-5 bg-white/10" />
          <div>
            <h1 className="text-sm font-display font-semibold text-white/90">
              A Three-Layer Caching Architecture for Low-Latency LLM Web Search
            </h1>
            <p className="text-xs text-white/40 mt-0.5">
              Ayushman Bhattacharya and Nihal Gazi, 2026
            </p>
            <p className="text-[11px] text-white/30 mt-0.5">
              ayushman@pollinations.ai · info@nihalgazi.com · Pollinations.ai
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/pollinations/lixSearch"
            target="_blank"
            rel="noopener noreferrer"
            className="paper-github-button"
          >
            <ExternalLink size={12} />
            GitHub
          </a>
          <a
            href="/paper.pdf"
            download="lix_cache_paper.pdf"
            className="paper-download-button"
          >
            <Download size={14} />
            Download PDF
          </a>
        </div>
      </header>

      {/* PDF Viewer */}
      <div className="flex-1 w-full max-w-7xl mx-auto p-4">
        <iframe
          src="/paper.pdf"
          className="w-full h-full min-h-[calc(100vh-120px)] rounded-xl border border-white/[0.06]"
          title="Research Paper"
        />
      </div>
    </div>
  );
}
