"use client"

import useSketchStore from '@/store/useSketchStore'
import ShapeSidebar, { Divider, LayerControls } from './ShapeSidebar'
import { OpacityControl } from './AppearanceControls'

/** Properties panel for a selected icon (the icon picker is IconSidebar). */
export default function IconPropertiesSidebar() {
  const selectedShapeSidebar = useSketchStore((s) => s.selectedShapeSidebar)
  return (
    <ShapeSidebar visible={selectedShapeSidebar === 'icon'}>
      <OpacityControl />
      <Divider />
      <LayerControls />
    </ShapeSidebar>
  )
}
