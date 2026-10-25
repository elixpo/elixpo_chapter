"use client"

import useSketchStore from '@/store/useSketchStore'
import { useCallback } from 'react'

export default function Footer() {
  const zoom = useSketchStore((s) => s.zoom)
  const setZoom = useSketchStore((s) => s.setZoom)
  const viewMode = useSketchStore((s) => s.viewMode)
  const zenMode = useSketchStore((s) => s.zenMode)

  const zoomPercent = Math.round(zoom * 100)

  const handleZoomIn = useCallback(() => {
    if (window.zoomFromCenter) window.zoomFromCenter(1)
  }, [])

  const handleZoomOut = useCallback(() => {
    if (window.zoomFromCenter) window.zoomFromCenter(-1)
  }, [])

  const handleZoomReset = useCallback(() => {
    if (window.zoomReset) window.zoomReset()
  }, [])

  const handleZoomFit = useCallback(() => {
    if (window.zoomFit) window.zoomFit()
  }, [])

  const handleUndo = useCallback(() => {
    if (window.undo) window.undo()
  }, [])

  const handleRedo = useCallback(() => {
    if (window.redo) window.redo()
  }, [])

  if (viewMode || zenMode) return null

  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-2 z-[1000] font-[lixFont]">
      {/* Undo/Redo */}
      <div className="flex items-center lix-island bg-surface rounded-lg overflow-hidden border border-border-light">
        <button
          onClick={handleUndo}
          type="button"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-undo text-[17px]" />
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleRedo}
          type="button"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-redo text-[17px]" />
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center lix-island bg-surface rounded-lg overflow-hidden border border-border-light">
        <button
          onClick={handleZoomFit}
          aria-label="Fit canvas to content"
          title="Fit to Content (Shift+1)"
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-target-lock text-[17px]" />
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleZoomOut}
          type="button"
          aria-label="Zoom out"
          title="Zoom Out (Ctrl+-)"
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-minus text-[17px]" />
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleZoomReset}
          type="button"
          aria-label="Reset zoom"
          title="Reset Zoom (Ctrl+0)"
          className="min-w-[48px] h-8 flex items-center justify-center text-text-secondary text-xs tabular-nums px-2 hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          {zoomPercent}%
        </button>
        <div className="w-px h-5 bg-border-light" />
        <button
          onClick={handleZoomIn}
          type="button"
          aria-label="Zoom in"
          title="Zoom In (Ctrl++)"
          className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200 cursor-pointer"
        >
          <i className="bx bx-plus text-[17px]" />
        </button>
      </div>
    </div>
  )
}
