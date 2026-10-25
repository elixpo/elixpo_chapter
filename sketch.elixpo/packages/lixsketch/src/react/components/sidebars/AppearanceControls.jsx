"use client"

import { useCallback, useEffect, useState } from 'react'
import { ToolbarButton } from './ShapeSidebar'

const OPACITY_STEP = 10

function readAppearance() {
  const value = typeof window !== 'undefined' ? window.__canvasCommands?.getAppearance?.() : null
  return value || { opacity: 1, edges: undefined }
}

/**
 * Appearance of the current selection (or the next-shape defaults when
 * nothing is selected). Polled while the panel is mounted because the
 * engine changes selection imperatively.
 */
function useSelectionAppearance() {
  const [appearance, setAppearance] = useState(readAppearance)
  useEffect(() => {
    const sync = () => {
      const next = readAppearance()
      setAppearance((prev) => (prev.opacity === next.opacity && prev.edges === next.edges ? prev : next))
    }
    sync()
    const timer = setInterval(sync, 300)
    return () => clearInterval(timer)
  }, [])
  return [appearance, setAppearance]
}

/**
 * Excalidraw-style opacity slider (0–100, step 10). Dragging previews live;
 * releasing records a single undo step for every selected shape.
 */
export function OpacityControl() {
  const [appearance, setAppearance] = useSelectionAppearance()
  const percent = Math.round((appearance.opacity ?? 1) * 100)

  const preview = useCallback((value) => {
    setAppearance((prev) => ({ ...prev, opacity: value / 100 }))
    window.__canvasCommands?.previewAppearance?.({ opacity: value / 100 })
  }, [setAppearance])
  const begin = useCallback(() => window.__canvasCommands?.beginAppearanceEdit?.(), [])
  const commit = useCallback(() => window.__canvasCommands?.commitAppearanceEdit?.(), [])

  return (
    <ToolbarButton
      icon="bx-adjust"
      tooltip="Opacity"
      label={`${percent}%`}
    >
      <label className="flex flex-col gap-2" htmlFor="shape-opacity">
        <span className="flex items-center justify-between text-xs uppercase tracking-wider text-text-muted">
          <span>Opacity</span>
          <span className="tabular-nums normal-case text-text-secondary">{percent}%</span>
        </span>
        <input
          id="shape-opacity"
          type="range"
          min="0"
          max="100"
          step={OPACITY_STEP}
          value={percent}
          aria-valuetext={`${percent}%`}
          onPointerDown={begin}
          onChange={(e) => preview(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="w-44 cursor-pointer accent-accent"
        />
        <span className="flex justify-between text-[10px] text-text-dim tabular-nums" aria-hidden="true">
          <span>0</span><span>50</span><span>100</span>
        </span>
      </label>
    </ToolbarButton>
  )
}

const EDGE_OPTIONS = [
  { value: 'sharp', label: 'Sharp', path: 'M5 19 V5 H19' },
  { value: 'round', label: 'Round', path: 'M5 19 V11 Q5 5 11 5 H19' },
]

/**
 * Sharp / round corners (rectangles and frames). `onDefaultChange` lets the
 * owning tool remember the choice for the next shape it draws.
 */
export function EdgesControl({ onDefaultChange }) {
  const [appearance, setAppearance] = useSelectionAppearance()
  const [fallback, setFallback] = useState('sharp')
  const current = appearance.edges || fallback

  const choose = (value) => {
    setFallback(value)
    setAppearance((prev) => ({ ...prev, edges: value }))
    window.__canvasCommands?.setAppearance?.({ edges: value })
    onDefaultChange?.(value)
  }

  return (
    <ToolbarButton icon={current === 'round' ? 'bx-square-rounded' : 'bx-square'} tooltip="Edges" label="Edges">
      <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Edges</p>
      <div className="flex items-center gap-1">
        {EDGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.label}
            aria-label={`${option.label} edges`}
            aria-pressed={current === option.value}
            onClick={() => choose(option.value)}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-all duration-100 ${current === option.value ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-surface-hover'}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d={option.path} />
            </svg>
            {option.label}
          </button>
        ))}
      </div>
    </ToolbarButton>
  )
}
