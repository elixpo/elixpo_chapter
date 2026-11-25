import type { ReactNode } from 'react';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';
import '../styles/docs.css';
import { DocsMobileNav, DocsRail } from './_components/DocsNav';
import DocsToc from './_components/DocsToc';

export const runtime = 'edge';

/*
 * Docs reading layout: site navbar, section rail (from lib/docs-sections.ts),
 * article, and an "On this page" rail. Server component — only the nav,
 * table of contents, and copy buttons hydrate.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />
      <div className="docs-shell">
        <DocsRail />
        <main id="main-content" className="min-w-0">
          <DocsMobileNav />
          {children}
        </main>
        <DocsToc />
      </div>
      <Footer />
    </div>
  );
}
