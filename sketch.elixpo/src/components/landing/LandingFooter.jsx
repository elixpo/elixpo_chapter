import Link from 'next/link'

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/teams', label: 'Teams' },
      { href: '/templates', label: 'Templates' },
      { href: 'https://www.npmjs.com/package/@elixpo/lixsketch', label: 'NPM Package', icon: 'bx bxl-nodejs', external: true },
      { href: 'https://marketplace.visualstudio.com/items?itemName=elixpo.lixsketch', label: 'VS Code Extension', icon: 'bx bxl-visual-studio', external: true },
    ],
  },
  {
    title: 'Docs',
    links: [
      { href: '/docs', label: 'LixScript Docs' },
      { href: '/docs/connectors', label: 'Connector Docs' },
      { href: '/docs#blog', label: 'Blog' },
      { href: '/docs/blog/e2e-encryption', label: 'E2E Encryption' },
      { href: '/docs/blog/lixscript-dsl', label: 'LixScript DSL' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/resources/how-to-start', label: 'How to start' },
      { href: '/resources/community', label: 'Community' },
      { href: '/resources/security', label: 'Security' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: 'https://elixpo.com', label: 'Elixpo', external: true },
      { href: 'https://github.com/elixpo/sketch.elixpo', label: 'GitHub', external: true },
      { href: '/docs/blog/engine-package-launch', label: 'Engine Launch Blog' },
    ],
  },
]

export default function LandingFooter() {
  return (
    <footer className="lx-footer">
      <div className="lx-footer-top">
        <div className="lx-footer-brand">
          <img src="/icon.png" alt="" />
          <div>
            <strong>LixSketch</strong>
            <p>Open source canvas for visual thinking: hand-drawn diagrams, docs and live collaboration.</p>
          </div>
        </div>

        <div className="lx-footer-cols">
          {columns.map((column) => (
            <div key={column.title}>
              <h4>{column.title}</h4>
              <nav aria-label={column.title}>
                {column.links.map((link) => {
                  const content = (
                    <>
                      {link.icon && <i className={`${link.icon} text-sm`} />}
                      {link.label}
                    </>
                  )
                  return link.external ? (
                    <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{content}</a>
                  ) : (
                    <Link key={link.href} href={link.href}>{content}</Link>
                  )
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>

      <div className="lx-footer-bottom">
        <span>LixSketch &mdash; an Elixpo project. MIT licensed.</span>
        <a href="https://github.com/elixpo/sketch.elixpo" target="_blank" rel="noopener noreferrer" aria-label="LixSketch on GitHub" className="inline-flex items-center gap-1.5 text-ink">
          <i className="bx bxl-github text-lg" />
          GitHub ↗
        </a>
      </div>
    </footer>
  )
}
