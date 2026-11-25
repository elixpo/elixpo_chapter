"use client"

import { useEffect, useState } from 'react'
import useSketchStore from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'

const HINTS = [
  { keys: ['Double-click'], text: 'add text anywhere' },
  { keys: ['Scroll'], text: 'pan  ·  Ctrl + scroll to zoom' },
  { keys: ['Space'], text: 'hold and drag to pan' },
  { keys: ['?'], text: 'all keyboard shortcuts' },
  { keys: ['Ctrl', '/'], text: 'command center' },
]

function countShapes() {
  return typeof window !== 'undefined' && Array.isArray(window.shapes) ? window.shapes.length : 0
}

/**
 * Excalidraw-style empty-state hints. Shown only while the canvas has no
 * shapes; never intercepts pointer events.
 */
export default function WelcomeHints() {
  const [empty, setEmpty] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const viewMode = useSketchStore((s) => s.viewMode)
  const zenMode = useSketchStore((s) => s.zenMode)
  const layoutMode = useSketchStore((s) => s.layoutMode)
  const canvasLoading = useUIStore((s) => s.canvasLoading)

  useEffect(() => {
    // The engine owns window.shapes imperatively and emits no React event,
    // so poll cheaply; the check is a single array length read.
    const check = () => setEmpty(countShapes() === 0)
    check()
    const timer = setInterval(check, 500)
    const down = (event) => {
      if (event.target?.closest?.('#freehand-canvas')) setInteracting(true)
    }
    const up = () => {
      setInteracting(false)
      check()
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    return () => {
      clearInterval(timer)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
    }
  }, [])

  if (!empty || interacting || viewMode || zenMode || canvasLoading || layoutMode === 'docs') return null

  // Side hints respond to the canvas's own width (container queries), not
  // the viewport: in split view the canvas is half the window, and the
  // tool hint would run into the centered card. 64rem leaves room for the
  // 72px toolbar gutter, the hint and half of the 360px card.
  return (
    <div className="@container pointer-events-none absolute inset-0 z-[5] select-none font-[lixFont] text-text-dim" aria-hidden="true">
      <div className="absolute left-[72px] top-1/2 hidden -translate-y-1/2 items-center gap-2 text-sm @5xl:flex">
        <i className="bx bx-left-arrow-alt text-lg" />
        <span>Pick a tool and start drawing</span>
      </div>
      {/* The menu button sits above the docs pane in split view. */}
      {layoutMode !== 'split' && (
        <div className="absolute right-4 top-16 hidden items-center gap-1.5 text-sm @xl:flex">
          <span>Menu, export &amp; theme</span>
          <i className="bx bx-up-arrow-alt text-lg" />
        </div>
      )}
      <div className="absolute left-1/2 top-1/2 flex w-[min(360px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 text-center">
        <p className="text-2xl text-text-muted">Your canvas is empty</p>
        <ul className="flex w-full flex-col gap-1.5 text-[13px]">
          {HINTS.map((hint) => (
            <li key={hint.text} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1">
                {hint.keys.map((k) => (
                  <kbd key={k} className="rounded-md border border-border-light bg-surface/70 px-1.5 py-0.5 text-[11px] text-text-muted">{k}</kbd>
                ))}
              </span>
              <span className="text-right">{hint.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
