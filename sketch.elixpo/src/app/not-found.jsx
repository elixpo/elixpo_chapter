'use client'

import Link from 'next/link'
import { HeroObjects, PageHero, SiteShell } from '@/components/site/Site'

export default function NotFound() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Error 404"
        title={<>This canvas is <em>empty.</em></>}
        lead="The page you're looking for doesn't exist, was moved, or was erased from the canvas."
        objects={<HeroObjects blob="404" disc={['PAGE', 'MISSING']} card={['ROUTE', 'NOT FOUND']} />}
        actions={(
          <>
            <Link
              href={`/c/lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}
              className="lx-btn lx-btn-primary"
            >
              <i className="bx bx-palette" />
              New Canvas
            </Link>
            <Link href="/" className="lx-btn">
              <i className="bx bx-home" />
              Home
            </Link>
          </>
        )}
      />
    </SiteShell>
  )
}
