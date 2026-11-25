'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import CopyLlmButton from './CopyLlmButton';

interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Right-rail "On this page" list (≥1280px). Built from the article's h2/h3
 * after each navigation, with scroll-spy highlighting.
 */
export default function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const root = document.getElementById('docs-content');
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLHeadingElement>('h2, h3'));
    const list = elements.map((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-toc-ignore]').forEach((n) => n.remove());
      const text = (clone.textContent || '').trim();
      if (!el.id) el.id = slugify(text);
      return { id: el.id, text, level: el.tagName === 'H3' ? 3 : 2 } as Heading;
    });
    setHeadings(list);
    setActiveId(list[0]?.id ?? '');

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-110px 0px -65% 0px' },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <aside className="docs-toc" aria-label="On this page">
      {headings.length > 0 && (
        <>
          <p className="docs-label">On this page</p>
          <ol>
            {headings.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  data-level={h.level}
                  aria-current={activeId === h.id ? 'true' : undefined}
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="docs-toc-tools">
        <CopyLlmButton />
      </div>
    </aside>
  );
}
