"use client"

import { useEffect } from 'react'
import useSketchStore from '@/store/useSketchStore'
import useUIStore from '@/store/useUIStore'
import { isSceneFile, openSceneFile } from '@/utils/sceneFiles'

/**
 * Connects `.lixsketch` files to the app:
 *  - exposes scene settings (background, theme, grid) to the engine's
 *    `.lixsketch` export and applies them on import;
 *  - opens `.lixsketch` / `.lixjson` files dropped onto the canvas.
 */
export default function useSceneFileBridge() {
  useEffect(() => {
    window.__lixsketchSceneSettings = () => {
      const sketch = useSketchStore.getState()
      return {
        background: sketch.canvasBackground,
        theme: useUIStore.getState().theme,
        grid: Boolean(sketch.gridEnabled),
      }
    }
    window.__applyLixsketchSceneSettings = (settings = {}) => {
      const ui = useUIStore.getState()
      if ((settings.theme === 'dark' || settings.theme === 'light' || settings.theme === 'system') && settings.theme !== ui.theme) {
        ui.setTheme(settings.theme)
      }
      const sketch = useSketchStore.getState()
      if (typeof settings.background === 'string' && /^#[0-9a-f]{3,8}$/i.test(settings.background)) {
        sketch.setCanvasBackground(settings.background, useUIStore.getState().resolvedTheme)
      }
      if (typeof settings.grid === 'boolean' && settings.grid !== sketch.gridEnabled) sketch.toggleGrid()
    }

    const overCanvas = (target) => {
      const svg = window.svg
      return Boolean(svg && target instanceof Node && (svg === target || svg.contains(target) || target.contains?.(svg)))
    }
    const sceneFileFrom = (event) => Array.from(event.dataTransfer?.files || []).find(isSceneFile)

    const handleDragOver = (event) => {
      if (!overCanvas(event.target)) return
      if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault()
    }
    // Capture phase so the image drop handler never sees scene files.
    const handleDrop = (event) => {
      if (!overCanvas(event.target)) return
      const file = sceneFileFrom(event)
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      void openSceneFile(file)
    }
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop, true)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop, true)
      delete window.__lixsketchSceneSettings
      delete window.__applyLixsketchSceneSettings
    }
  }, [])
}
