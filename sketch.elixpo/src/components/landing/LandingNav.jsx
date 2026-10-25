'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useAuthStore from '@/store/useAuthStore'
import { useTranslation } from '@/hooks/useTranslation'

function OpenCanvasButton({ className }) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { t } = useTranslation()

  const handleClick = () => {
    if (isAuthenticated) {
      router.push('/profile?tab=workspaces')
    } else {
      const id = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      router.push(`/c/${id}?new=1`)
    }
  }

  return (
    <button onClick={handleClick} className={className}>
      {isAuthenticated ? t('landing.nav.myCanvases') : t('landing.nav.openCanvas')}
    </button>
  )
}

function SignInButton() {
  const login = useAuthStore((state) => state.login)
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => login()}
      title={t('menu.signIn')}
      className="lx-ghost"
    >
      <i className="bx bx-log-in text-base" />
      <span>{t('menu.signIn')}</span>
    </button>
  )
}

const accountSections = [
  {
    label: 'Workspace',
    items: [
      { href: '/profile?tab=workspaces', label: 'My workspaces', detail: 'Open and manage canvases', icon: 'bx-grid-alt' },
      { action: 'new-canvas', label: 'Create canvas', detail: 'Start a new workspace', icon: 'bx-plus-circle' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/profile?tab=personal', label: 'Personal details', detail: 'Identity and public profile', icon: 'bx-user' },
      { href: '/profile?tab=integrations', label: 'Integrations', detail: 'Cloudinary and Pollinations', icon: 'bx-plug' },
      { href: '/profile?tab=usage', label: 'Usage & limits', detail: 'Storage and collaboration', icon: 'bx-bar-chart-alt-2' },
      { href: '/profile?tab=billing', label: 'Billing & plan', detail: 'Plan and entitlements', icon: 'bx-credit-card' },
    ],
  },
  {
    label: 'Professional',
    items: [
      { href: '/teams', label: 'Teams', detail: 'Collaboration for groups', icon: 'bx-group' },
      { href: '/docs', label: 'Documentation', detail: 'Guides and platform reference', icon: 'bx-book-open' },
    ],
  },
]

function AccountMenu({ onOpenChange }) {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const setMenuOpen = (next) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      if (event.type === 'mousedown' && ref.current && !ref.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Account'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="landing-account-menu"
        title={`${displayName} · ${user?.email || 'signed in'}`}
        className={`flex cursor-pointer items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-1 text-left transition-colors duration-200 lg:pr-3 ${open ? 'border-ink' : 'border-line hover:border-ink'}`}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full border border-line object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-wash text-xs font-bold text-lx-blue">{initials}</span>
        )}
        <span className="hidden min-w-0 max-w-[168px] lg:block">
          <span className="block truncate text-xs font-medium text-text-primary">{displayName}</span>
          <span className="mt-0.5 block truncate text-[10px] text-text-dim">{user?.email || 'Signed in'}</span>
        </span>
        <i className={`bx bx-chevron-down hidden text-sm text-text-dim transition-transform lg:block ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="landing-account-menu"
            role="menu"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="lx-menu absolute right-0 top-full mt-3 max-h-[calc(100vh-96px)] w-[calc(100vw-24px)] max-w-[320px] overflow-y-auto p-2"
          >
            <div className="flex items-center gap-3 px-2 py-2.5">
              {user?.avatar ? (
                <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-full border border-line object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-wash text-sm font-bold text-lx-blue">{initials}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">{displayName}</p>
                <p className="mt-0.5 truncate text-[10px] text-text-dim">{user?.email}</p>
                <span className="mt-1.5 inline-flex rounded-full border border-line bg-paper px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted">{user?.tier || 'Free'} plan</span>
              </div>
            </div>

            {accountSections.map((section) => (
              <div key={section.label} className="border-t border-line py-1.5 first-of-type:mt-1">
                <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-lx-blue">{section.label}</p>
                {section.items.map((item) => {
                  const content = (
                    <>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-deep text-ink">
                        <i className={`bx ${item.icon} text-base`} />
                      </span>
                      <span className="min-w-0 text-left">
                        <span className="block text-xs">{item.label}</span>
                        <span className="mt-0.5 block text-[9px] text-text-dim">{item.detail}</span>
                      </span>
                      <i className="bx bx-chevron-right ml-auto text-sm text-text-dim" />
                    </>
                  )
                  const className = 'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-ink transition-colors hover:bg-paper'
                  if (item.action === 'new-canvas') {
                    return (
                      <button
                        key={item.action}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          const id = `lx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
                          setMenuOpen(false)
                          router.push(`/c/${id}?new=1&preserveLocal=1`)
                        }}
                        className={className}
                      >
                        {content}
                      </button>
                    )
                  }
                  return (
                    <Link key={item.href} href={item.href} role="menuitem" onClick={() => setMenuOpen(false)} className={className}>
                      {content}
                    </Link>
                  )
                })}
              </div>
            ))}

            <div className="border-t border-line pt-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => { logout(); setMenuOpen(false) }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-xs text-red-700 transition-colors hover:bg-red-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50"><i className="bx bx-log-out text-base" /></span>
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const resourceLinks = [
  { href: '/resources/how-to-start', key: 'howToStart', label: 'How to start', icon: 'bx bx-rocket' },
  { href: '/resources/community', key: 'community', label: 'Community', icon: 'bx bx-group' },
  { href: '/resources/security', key: 'security', label: 'Security', icon: 'bx bx-shield' },
]

// Compact star-count formatter: 999 → "999", 1200 → "1.2k", 12345 → "12.3k".
function formatStars(n) {
  if (typeof n !== 'number' || n < 0) return null
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k.toFixed(k < 10 ? 1 : 0).replace(/\.0$/, '')}k`
}

const GH_REPO = 'elixpo/sketch.elixpo'
const STARS_CACHE_KEY = `gh-stars:${GH_REPO}`
const STARS_TTL_MS = 10 * 60 * 1000 // 10 minutes — unauth GitHub API is 60 req/hr

function useGitHubStars(repo) {
  const [stars, setStars] = useState(null)
  useEffect(() => {
    // Serve from localStorage cache if fresh.
    try {
      const cached = localStorage.getItem(STARS_CACHE_KEY)
      if (cached) {
        const { count, at } = JSON.parse(cached)
        if (Date.now() - at < STARS_TTL_MS && typeof count === 'number') {
          setStars(count)
          return
        }
      }
    } catch {
      // localStorage unavailable (SSR, private mode) — fall through to fetch.
    }

    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || typeof data.stargazers_count !== 'number') return
        setStars(data.stargazers_count)
        try {
          localStorage.setItem(STARS_CACHE_KEY, JSON.stringify({ count: data.stargazers_count, at: Date.now() }))
        } catch {
          // Storage quota / private mode — ignore; memory state still updates.
        }
      })
      .catch(() => {
        // Network / rate limit — silently leave stars=null; pill renders without the count.
      })
    return () => {
      cancelled = true
    }
  }, [repo])
  return stars
}

export default function LandingNav() {
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const dropdownRef = useRef(null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initAuth = useAuthStore((state) => state.init)
  const stars = useGitHubStars(GH_REPO)
  const starsLabel = formatStars(stars)
  const { t } = useTranslation()

  useEffect(() => { initAuth() }, [initAuth])

  useEffect(() => {
    function handleOutsideClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setResourcesOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const primaryLinks = [
    { href: '/pricing', label: t('landing.nav.pricing') },
    { href: '/teams', label: t('landing.nav.teams') },
    { href: '/templates', label: t('landing.nav.templates') },
    { href: '/docs', label: t('landing.resources.docs') },
  ]

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="lx-header"
      >
        <Link href="/?noredirect=1" className="lx-brand" aria-label="LixSketch home">
          <img src="/icon.png" alt="" />
          <span><b>LixSketch</b><small>by Elixpo</small></span>
        </Link>

        <nav className="lx-nav" aria-label="Primary navigation">
          {primaryLinks.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setResourcesOpen(!resourcesOpen)}
              aria-expanded={resourcesOpen}
              className="flex cursor-pointer items-center gap-1"
            >
              {t('landing.nav.resources')}
              <i className={`bx bx-chevron-down text-base transition-transform duration-200 ${resourcesOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {resourcesOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="lx-menu absolute right-0 top-full mt-4 w-56 overflow-hidden p-1.5"
                >
                  {resourceLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setResourcesOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper"
                    >
                      <i className={`${item.icon} text-base text-lx-blue`} />
                      {t(`landing.resources.${item.key}`)}
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        <div className="lx-header-actions">
          <a
            href={`https://github.com/${GH_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={starsLabel ? `GitHub · ${starsLabel} stars` : 'GitHub'}
            title={starsLabel ? `${stars.toLocaleString()} stars on GitHub` : 'GitHub'}
            className="lx-ghost lx-gh-pill"
          >
            <i className="bx bxl-github text-lg" />
            {starsLabel && <span className="tabular-nums">{starsLabel}</span>}
            <span className="hidden xl:inline">{t('links.github')}</span>
          </a>
          {isAuthenticated ? (
            <AccountMenu onOpenChange={(open) => {
              if (open) {
                setResourcesOpen(false)
                setMobileOpen(false)
              }
            }} />
          ) : (
            <SignInButton />
          )}
          <OpenCanvasButton className="lx-portal" />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="lx-ghost lx-nav-toggle"
          >
            <i className={`bx ${mobileOpen ? 'bx-x' : 'bx-menu'} text-xl`} />
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="lx-menu lx-mobile-panel md:hidden"
          >
            <nav className="flex flex-col" aria-label="Mobile navigation">
              {primaryLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="border-b border-line py-3 text-base font-semibold text-ink"
                >
                  {item.label}
                </Link>
              ))}
              <p className="lx-eyebrow mb-1 mt-4">{t('landing.nav.resources')}</p>
              {resourceLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 py-2 text-sm font-semibold text-ink"
                >
                  <i className={`${item.icon} text-base text-lx-blue`} />
                  {t(`landing.resources.${item.key}`)}
                </Link>
              ))}
              <a
                href={`https://github.com/${GH_REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm font-semibold text-ink"
              >
                <i className="bx bxl-github text-base" />
                {t('landing.nav.starUs')}
                {starsLabel && <span className="font-mono text-xs text-muted">{starsLabel}</span>}
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
