"use client"

import { useEffect, useState } from 'react'
import { ARROWHEAD_TYPES, arrowheadGeometry } from '../../../core/ArrowHeads.js'
import { ToolbarButton } from './ShapeSidebar'

const LABELS = {
  none: 'None',
  arrow: 'Arrow',
  bar: 'Bar',
  dot: 'Dot',
  circle: 'Circle',
  triangle: 'Triangle',
  triangle_outline: 'Triangle (outline)',
  diamond: 'Diamond',
  diamond_outline: 'Diamond (outline)',
  crowfoot_one: 'Crow’s foot: one',
  crowfoot_many: 'Crow’s foot: many',
  crowfoot_one_or_many: 'Crow’s foot: one or many',
  cross: 'Cross',
}

/** Small crisp preview of a head at the start (pointing left) or end (right). */
export function ArrowheadPreview({ type, end = 'end', width = 34, height = 18 }) {
  const y = height / 2
  const tip = end === 'end' ? { x: width - 4, y } : { x: 4, y }
  const angle = end === 'end' ? 0 : Math.PI
  const geometry = arrowheadGeometry(type, tip, angle, 10)
  const shaftFrom = end === 'end' ? 3 : width - 3
  const shaftTo = end === 'end' ? tip.x - geometry.trim : tip.x + geometry.trim
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1={shaftFrom} y1={y} x2={shaftTo} y2={y} />
      {geometry.parts.map((part, i) => {
        if (part.kind === 'circle') {
          return <circle key={i} cx={part.center.x} cy={part.center.y} r={part.diameter / 2} fill={part.filled ? 'currentColor' : 'none'} />
        }
        const points = part.points.map((p) => `${p.x},${p.y}`).join(' ')
        return part.kind === 'polygon'
          ? <polygon key={i} points={points} fill={part.filled ? 'currentColor' : 'none'} />
          : <polyline key={i} points={points} />
      })}
    </svg>
  )
}

/**
 * Excalidraw-style arrowhead picker: a toolbar button showing the current
 * head that opens a grid of every head type.
 */
export function ArrowheadPicker({ end, value, onChange }) {
  const title = end === 'start' ? 'Start arrowhead' : 'End arrowhead'
  return (
    <ToolbarButton
      tooltip={title}
      label={end === 'start' ? 'Start' : 'End'}
      preview={<ArrowheadPreview type={value} end={end} width={26} height={14} />}
    >
      <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">{title}</p>
      <div className="grid grid-cols-4 gap-1" role="listbox" aria-label={title}>
        {ARROWHEAD_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            role="option"
            aria-selected={value === type}
            title={LABELS[type] || type}
            aria-label={LABELS[type] || type}
            onClick={() => onChange(type)}
            className={`flex h-9 w-12 items-center justify-center rounded-lg transition-all duration-100 ${value === type ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-hover'}`}
          >
            <ArrowheadPreview type={type} end={end} />
          </button>
        ))}
      </div>
    </ToolbarButton>
  )
}

// Per shape kind: default end head, tool-defaults bridge and style updater.
const TARGETS = {
  arrow: { defaultEnd: 'arrow', settings: () => window.arrowToolSettings, update: (c) => window.updateSelectedArrowStyle?.(c) },
  line: { defaultEnd: 'none', settings: () => window.lineToolSettings, update: (c) => window.updateSelectedLineStyle?.(c) },
}

function readHeads(kind) {
  const target = TARGETS[kind] || TARGETS.arrow
  if (typeof window === 'undefined') return { start: 'none', end: target.defaultEnd }
  const shape = window.currentShape
  if (shape && shape.shapeName === kind && shape.isSelected) {
    return { start: shape.startArrowhead || 'none', end: shape.endArrowhead || target.defaultEnd }
  }
  const tool = target.settings()
  return { start: tool?.startArrowhead || 'none', end: tool?.endArrowhead || target.defaultEnd }
}

/**
 * Start / end pickers plus a swap action, kept in sync with the selected
 * arrow or line (or that tool's defaults when nothing is selected).
 */
export function ArrowheadControls({ kind = 'arrow' }) {
  const [heads, setHeads] = useState(() => readHeads(kind))

  useEffect(() => {
    const sync = () => {
      const next = readHeads(kind)
      setHeads((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
    }
    sync()
    const timer = setInterval(sync, 300)
    return () => clearInterval(timer)
  }, [kind])

  const apply = (changes) => {
    setHeads((prev) => ({
      start: changes.startArrowhead ?? prev.start,
      end: changes.endArrowhead ?? prev.end,
    }))
    const target = TARGETS[kind] || TARGETS.arrow
    const settings = target.settings()
    if (settings) {
      if (changes.startArrowhead !== undefined) settings.startArrowhead = changes.startArrowhead
      if (changes.endArrowhead !== undefined) settings.endArrowhead = changes.endArrowhead
    }
    target.update(changes)
  }

  return (
    <>
      <ArrowheadPicker end="start" value={heads.start} onChange={(v) => apply({ startArrowhead: v })} />
      <button
        type="button"
        title="Swap arrowheads"
        aria-label="Swap start and end arrowheads"
        onClick={() => apply({ startArrowhead: heads.end, endArrowhead: heads.start })}
        className="flex h-9 w-8 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-all duration-100 hover:bg-surface-hover hover:text-text-primary"
      >
        <i className="bx bx-transfer-alt text-base" aria-hidden="true" />
      </button>
      <ArrowheadPicker end="end" value={heads.end} onChange={(v) => apply({ endArrowhead: v })} />
    </>
  )
}
