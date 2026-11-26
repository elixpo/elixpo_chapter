import LandingNav from '@/components/landing/LandingNav'
import LandingFooter from '@/components/landing/LandingFooter'

/*
 * Shared building blocks for the Elixpo standard site UI. Styles live in
 * src/app/site.css; these components only assemble the markup so every route
 * renders the same header, section headers, art panels and footer.
 */

export function SiteShell({ children, className = '', nav = true, footer = true }) {
  return (
    <div className={`lx-site ${className}`}>
      {nav && <LandingNav />}
      <main>{children}</main>
      {footer && <LandingFooter />}
    </div>
  )
}

export function Eyebrow({ children, className = '' }) {
  return <p className={`lx-eyebrow ${className}`}>{children}</p>
}

/** Two-column section header: eyebrow + large title left, supporting copy right. */
export function SectionHead({ eyebrow, title, lead, size, children }) {
  return (
    <header className={`lx-section-head ${size === 'sm' ? 'lx-section-head-sm' : ''}`}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2>{title}</h2>
      </div>
      {lead ? <p>{lead}</p> : children || <span />}
    </header>
  )
}

export function Section({ id, eyebrow, title, lead, tone, tight, size, className = '', children }) {
  const toneClass = tone ? `lx-tone-${tone}` : ''
  return (
    <section id={id} className={`lx-section ${tight ? 'lx-section-tight' : ''} ${toneClass} ${className}`}>
      {(eyebrow || title) && <SectionHead eyebrow={eyebrow} title={title} lead={lead} size={size} />}
      {children}
    </section>
  )
}

/** Orbit / blob / disc / card geometry used behind hero headings. */
export function HeroObjects({ blob = '001101', disc = ['CANVAS', 'SVG'], card = ['SKETCH', 'SHAPES + DOCS'] }) {
  return (
    <div className="lx-hero-objects" aria-hidden="true">
      <span className="lx-orbit lx-orbit-one" />
      <span className="lx-orbit lx-orbit-two" />
      {blob && <div className="lx-object lx-object-blob"><i /><i /><i /><b>{blob}</b></div>}
      {disc && <div className="lx-object lx-object-disc"><span>{disc[0]}</span><b>{disc[1]}</b></div>}
      {card && <div className="lx-object lx-object-card"><span>{card[0]}</span><b>{card[1]}</b></div>}
    </div>
  )
}

/**
 * Page hero. `compact` keeps it short for interior routes; full height is
 * reserved for the landing page.
 */
export function PageHero({ eyebrow, title, lead, actions, note, objects = true, compact = true, children }) {
  return (
    <header className={`lx-hero ${compact ? 'lx-hero-compact' : ''}`}>
      <div className="lx-hero-copy">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="lx-display">{title}</h1>
        {lead && <p className="lx-lead">{lead}</p>}
        {actions && <div className="lx-actions">{actions}</div>}
        {children}
      </div>
      {objects && (objects === true ? <HeroObjects /> : objects)}
      {note && (
        <div className="lx-hero-note">
          <strong>{note.value}</strong>
          <span>{note.label}</span>
          {note.detail && <small>{note.detail}</small>}
        </div>
      )}
    </header>
  )
}

const ART_TONES = ['yellow', 'blue', 'lilac', 'mint', 'sand', 'teal', 'peach', 'stone']

export const TONE_COLORS = {
  yellow: '#f1c64f',
  blue: '#cbdcff',
  lilac: '#dfd0f3',
  mint: '#d4eadf',
  sand: '#f3dfb5',
  teal: '#cce9e5',
  peach: '#f0d7bd',
  stone: '#d9dedb',
}

/** Small pastel blob holding an icon, for dense cards and list rows. */
export function IconBlob({ tone = 'blue', icon, size = 48, round = false, className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center text-ink ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: TONE_COLORS[tone] || tone,
        borderRadius: round ? '50%' : '24% 76% 62% 38%',
      }}
      aria-hidden="true"
    >
      <i className={icon} />
    </span>
  )
}

export function artTone(index) {
  return ART_TONES[((index % ART_TONES.length) + ART_TONES.length) % ART_TONES.length]
}

/** Pastel geometric panel: ring, pill and a soft blob holding an icon or mark. */
export function ArtPanel({ tone = 'yellow', label, icon, mark, small, className = '', children }) {
  return (
    <div className={`lx-art lx-art-${tone} ${small ? 'lx-art-sm' : ''} ${className}`} aria-hidden="true">
      {label && <span>{label}</span>}
      <i />
      <i />
      {(icon || mark) && <b>{icon ? <i className={icon} /> : mark}</b>}
      {children}
    </div>
  )
}

/** Full-bleed dark band with numbered columns. */
export function StandardBand({ id, eyebrow, title, lead, items, children }) {
  return (
    <section id={id} className="lx-section lx-standard">
      <SectionHead eyebrow={eyebrow} title={title} lead={lead} />
      {items?.length > 0 && (
        <div className="lx-standard-grid">
          {items.map((item, index) => (
            <article key={item.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      )}
      {children}
    </section>
  )
}
