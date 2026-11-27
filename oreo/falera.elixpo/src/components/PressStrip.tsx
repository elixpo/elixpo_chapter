import { BLOG, COVERAGE, PUBLISHED, UPSTREAM, type PressItem } from "@/data/press";
import { SectionHeader } from "@/components/ui";

const GROUPS = [
  { title: "Wrote about it", items: COVERAGE },
  { title: "Recognised upstream", items: UPSTREAM },
  { title: "Published", items: PUBLISHED },
  { title: "From our blog", items: BLOG },
];

function Item({ item }: { item: PressItem }) {
  return (
    <li className="border-b border-border last:border-0">
      <a href={item.href} target="_blank" rel="noreferrer" className="group block py-3">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-bold text-text group-hover:text-primary">{item.who}</span>
          {item.date ? <span className="shrink-0 font-mono text-xs text-muted">{item.date}</span> : null}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-text-dim">{item.what}</span>
      </a>
    </li>
  );
}

/** "In the press": coverage, upstream recognition and publications, from
 *  src/data/press.ts, in the deck's three-column layout (07a-recognition). */
export default function PressStrip() {
  return (
    <div>
      <SectionHeader
        eyebrow="In the press"
        title={<>What others wrote, <em>and where it was accepted.</em></>}
      />
      <div className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map((g) => (
          <div key={g.title} className="min-w-0">
            <p className="eyebrow border-b-2 border-primary pb-3">{g.title}</p>
            <ul>
              {g.items.map((item) => <Item key={item.href} item={item} />)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
