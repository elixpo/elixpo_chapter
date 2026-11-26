'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import useAuthStore from '@/store/useAuthStore'
import { ArtPanel, SiteShell } from '@/components/site/Site'

export default function SignInPage() {
  const login = useAuthStore((state) => state.login)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const requestedNext = new URLSearchParams(window.location.search).get('next')
    login(requestedNext || '/profile')
  }, [login])

  return (
    <SiteShell footer={false}>
      <div className="mx-auto flex min-h-[calc(100vh-110px)] w-[min(calc(100%-2rem),460px)] items-center py-12">
        <div className="lx-card w-full">
          <ArtPanel tone="blue" label="Elixpo account" small>
            <b><i className="bx bx-loader-alt animate-spin" /></b>
          </ArtPanel>
          <div className="lx-card-body">
            <small>Secure sign in</small>
            <h3>Opening secure sign in</h3>
            <p>Sign in with your Elixpo account before connecting personal Cloudinary storage.</p>
            <Link href="/profile?tab=integrations" className="lx-card-foot mt-6">
              Return to integrations →
            </Link>
          </div>
        </div>
      </div>
    </SiteShell>
  )
}
