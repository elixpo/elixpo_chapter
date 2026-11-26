'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useAuthStore from '@/store/useAuthStore'
import { HeroObjects, PageHero, SiteShell } from '@/components/site/Site'

export default function ComingSoon({ title, description, icon }) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const openCanvas = () => {
    if (isAuthenticated) {
      router.push('/profile')
    } else {
      const id = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      router.push(`/c/${id}?new=1`)
    }
  }

  return (
    <SiteShell>
      <PageHero
        eyebrow="Coming soon"
        title={<>{title} <em>is on the way.</em></>}
        lead={description}
        objects={<HeroObjects blob="SOON" disc={['STATUS', 'DRAFT']} card={null} />}
        actions={(
          <>
            <button type="button" onClick={openCanvas} className="lx-btn lx-btn-primary">
              <i className="bx bx-palette" />
              {isAuthenticated ? 'My Canvases' : 'Open Canvas'}
            </button>
            <Link href="/" className="lx-btn">
              <i className="bx bx-arrow-back" />
              Back to Home
            </Link>
          </>
        )}
      >
        <span className="lx-pill mt-6">
          <i className={`${icon} text-sm text-lx-blue`} />
          <b>Coming Soon</b>
        </span>
      </PageHero>
    </SiteShell>
  )
}
