'use client'

import { useEffect } from 'react'
import Header from '@/components/header/Header'
import useUIStore, { clearWorkspaceTheme } from '@/store/useUIStore'
import Toolbar from '@/components/toolbar/Toolbar'
import Footer from '@/components/footer/Footer'
import AppMenu from '@/components/menu/AppMenu'
import SaveModal from '@/components/modals/SaveModal'
import AIModal from '@/components/modals/AIModal'
import CommandPalette from '@/components/modals/CommandPalette'
import ExportImageModal from '@/components/modals/ExportImageModal'
import CanvasPropertiesModal from '@/components/modals/CanvasPropertiesModal'
import RectangleSidebar from '@/components/sidebars/RectangleSidebar'
import CircleSidebar from '@/components/sidebars/CircleSidebar'
import LineSidebar from '@/components/sidebars/LineSidebar'
import ArrowSidebar from '@/components/sidebars/ArrowSidebar'
import PaintbrushSidebar from '@/components/sidebars/PaintbrushSidebar'
import TextSidebar from '@/components/sidebars/TextSidebar'
import FrameSidebar from '@/components/sidebars/FrameSidebar'
import IconSidebar from '@/components/sidebars/IconSidebar'
import ImageSidebar from '@/components/sidebars/ImageSidebar'
import IconPropertiesSidebar from '@/components/sidebars/IconPropertiesSidebar'
import PaintBucketSidebar from '@/components/sidebars/PaintBucketSidebar'
import SVGCanvas from '@/components/canvas/SVGCanvas'
import CanvasDocConnectors from '@/components/canvas/CanvasDocConnectors'
import WelcomeHints from '@/components/canvas/WelcomeHints'
import MultiSelectActions from '@/components/canvas/MultiSelectActions'
import ImageSourcePicker from '@/components/canvas/ImageSourcePicker'
import ImageGenerateModal from '@/components/modals/ImageGenerateModal'
import WebEmbedModal from '@/components/modals/WebEmbedModal'
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts'
import useSessionID from '@/hooks/useSessionID'
import useGuestProfile from '@/hooks/useGuestProfile'
import useAuth from '@/hooks/useAuth'
import useAutoSave from '@/hooks/useAutoSave'
import useSceneFileBridge from '@/hooks/useSceneFileBridge'
import CanvasLoadingOverlay from '@/components/canvas/CanvasLoadingOverlay'
import ContextMenu from '@/components/canvas/ContextMenu'
import FindBar from '@/components/canvas/FindBar'
import SplitLayout from '@/components/docs/SplitLayout'
import dynamic from 'next/dynamic'
import useSketchStore from '@/store/useSketchStore'
import useCollabStore from '@/store/useCollabStore'
import useCollaboration from '@/hooks/useCollaboration'

// Lazy: only pulls BlockNote/Mantine/Mermaid into the bundle when the
// docs panel is actually mounted (i.e. layoutMode is 'split' or 'docs').
const DocsPanel = dynamic(() => import('@/components/docs/DocsPanel'), {
  ssr: false,
  loading: () => null,
})

export default function CanvasPage() {
  useEffect(() => {
    document.body.classList.add('canvas-mode')
    const ui = useUIStore.getState()
    ui.hydrateTheme()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemTheme = () => useUIStore.getState().syncSystemTheme()
    media.addEventListener?.('change', handleSystemTheme)
    // Restore the user's last-used layout mode (canvas / split / docs)
    // before the editor or split layout decides to render.
    useSketchStore.getState().hydrateLayoutMode?.()
    return () => {
      media.removeEventListener?.('change', handleSystemTheme)
      // Restore site defaults (light, no canvas/UI theme classes).
      clearWorkspaceTheme()
    }
  }, [])

  useAuth()
  useKeyboardShortcuts()
  useSessionID()
  useGuestProfile()
  useAutoSave()
  useSceneFileBridge()

  const activeRoomId = useCollabStore((s) => s.activeRoomId)
  useCollaboration(activeRoomId)

  const layoutMode = useSketchStore((s) => s.layoutMode)
  const canvasVisible = layoutMode !== 'docs'

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-surface-dark">
      <Header />

      <SplitLayout
        canvas={
          <>
            <SVGCanvas />
            <CanvasDocConnectors />
            {/* All canvas chrome lives inside the canvas wrapper so it
                can't visually overflow into the docs panel during split. */}
            {canvasVisible && (
              <>
                <WelcomeHints />
                <Toolbar />
                <RectangleSidebar />
                <CircleSidebar />
                <LineSidebar />
                <ArrowSidebar />
                <PaintbrushSidebar />
                <TextSidebar />
                <FrameSidebar />
                <IconSidebar />
                <ImageSidebar />
                <IconPropertiesSidebar />
                <PaintBucketSidebar />
                <MultiSelectActions />
                <Footer />
              </>
            )}
          </>
        }
        docs={<DocsPanel />}
      />
      <AppMenu />
      <SaveModal />
      <AIModal />
      <CommandPalette />
      <ExportImageModal />
      <CanvasPropertiesModal />
      <ImageSourcePicker />
      <ImageGenerateModal />
      <WebEmbedModal />
      <ContextMenu />
      <FindBar />
      <CanvasLoadingOverlay />

      <div
        id="save-toast"
        className="hidden fixed bottom-20 left-1/2 -translate-x-1/2 z-9999 px-4 py-2 rounded-xl bg-surface/80 backdrop-blur-md border border-border-light text-text-secondary text-xs font-[lixFont] pointer-events-none animate-fade-in"
      >
        <i className="bx bx-check text-green-400 mr-1.5" />
        Saved
      </div>
    </div>
  )
}
