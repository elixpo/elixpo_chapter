import { Shape, rotateShape } from '@/redux/slices/shapes'
import { useRef, useState } from 'react'
import { useDispatch } from 'react-redux'

interface SelectionOverlayProps {
  shape: Shape
  isSelected: boolean
}

export const SelectionOverlay = ({ shape, isSelected }: SelectionOverlayProps) => {
  const dispatch = useDispatch()
  const [isRotating, setIsRotating] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const startAngleRef = useRef(0)
  const startPointerAngleRef = useRef(0)
  const centerRef = useRef({ x: 0, y: 0 })

  if (!isSelected) return null

  const getBounds = () => {
    switch (shape.type) {
      case 'frame':
      case 'rect':
      case 'ellipse':
      case 'generatedui':
        return { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
      case 'freedraw':
        if (!shape.points?.length) return { x: 0, y: 0, w: 0, h: 0 }
        const xs = shape.points.map((p) => p.x)
        const ys = shape.points.map((p) => p.y)
        return {
          x: Math.min(...xs),
          y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        }
      case 'arrow':
      case 'line':
        return {
          x: Math.min(shape.startX, shape.endX),
          y: Math.min(shape.startY, shape.endY),
          w: Math.abs(shape.endX - shape.startX),
          h: Math.abs(shape.endY - shape.startY),
        }
      case 'text':
        const width = Math.max(shape.text.length * (shape.fontSize * 0.6), 100)
        const height = shape.fontSize * 1.2
        return { x: shape.x, y: shape.y, w: width, h: height }
      default:
        return { x: 0, y: 0, w: 0, h: 0 }
    }
  }

  const bounds = getBounds()
  const isResizable = shape.type !== 'generatedui' && shape.type !== 'arrow'

  // ----------------- Rotation -----------------
  const startRotation = (e: React.PointerEvent) => {
    e.stopPropagation()
    setIsRotating(true)

    const rect = overlayRef.current?.getBoundingClientRect()
    if (!rect) return

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    centerRef.current = { x: centerX, y: centerY }

    startAngleRef.current = shape.rotation || 0
    const dx = e.clientX - centerX
    const dy = e.clientY - centerY
    startPointerAngleRef.current = Math.atan2(dy, dx)

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - centerRef.current.x
      const dy = moveEvent.clientY - centerRef.current.y
      const currentPointerAngle = Math.atan2(dy, dx)

      const deltaAngle = currentPointerAngle - startPointerAngleRef.current
      const deltaDegrees = (deltaAngle * 180) / Math.PI

      const newRotation = startAngleRef.current + deltaDegrees
      dispatch(rotateShape({ id: shape.id, rotation: newRotation }))
    }

    const handleUp = () => {
      setIsRotating(false)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  // ----------------- Resize Handlers -----------------
  const handlePointerDown = (e: React.PointerEvent, corner: string) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const event = new CustomEvent('shape-resize-start', {
      detail: { shapeId: shape.id, corner, bounds },
    })
    window.dispatchEvent(event)
  }

  const handlePointerMove = (e: React.PointerEvent, corner: string) => {
    if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      const event = new CustomEvent('shape-resize-move', {
        detail: {
          shapeId: shape.id,
          corner,
          clientX: e.clientX,
          clientY: e.clientY,
          bounds,
        },
      })
      window.dispatchEvent(event)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    const event = new CustomEvent('shape-resize-end', {
      detail: { shapeId: shape.id },
    })
    window.dispatchEvent(event)
  }

  return (
    <div
      ref={overlayRef}
      className="absolute pointer-events-none border-2 border-blue-500 bg-blue-500/10"
      style={{
        left: bounds.x - 2,
        top: bounds.y - 2,
        width: bounds.w + 4,
        height: bounds.h + 4,
        borderRadius: shape.type === 'frame' ? '10px' : '4px',
        transform: `rotate(${shape.rotation || 0}deg)`,
        transformOrigin: 'center center',
      }}
    >
      {isResizable && (
        <>
          <div
            className="absolute w-3 h-3 bg-blue-500 border border-white rounded-full cursor-nw-resize pointer-events-auto"
            style={{ top: -6, left: -6 }}
            onPointerDown={(e) => handlePointerDown(e, 'nw')}
            onPointerMove={(e) => handlePointerMove(e, 'nw')}
            onPointerUp={handlePointerUp}
          />
          <div
            className="absolute w-3 h-3 bg-blue-500 border border-white rounded-full cursor-ne-resize pointer-events-auto"
            style={{ top: -6, right: -6 }}
            onPointerDown={(e) => handlePointerDown(e, 'ne')}
            onPointerMove={(e) => handlePointerMove(e, 'ne')}
            onPointerUp={handlePointerUp}
          />
          <div
            className="absolute w-3 h-3 bg-blue-500 border border-white rounded-full cursor-sw-resize pointer-events-auto"
            style={{ bottom: -6, left: -6 }}
            onPointerDown={(e) => handlePointerDown(e, 'sw')}
            onPointerMove={(e) => handlePointerMove(e, 'sw')}
            onPointerUp={handlePointerUp}
          />
          <div
            className="absolute w-3 h-3 bg-blue-500 border border-white rounded-full cursor-se-resize pointer-events-auto"
            style={{ bottom: -6, right: -6 }}
            onPointerDown={(e) => handlePointerDown(e, 'se')}
            onPointerMove={(e) => handlePointerMove(e, 'se')}
            onPointerUp={handlePointerUp}
          />
        </>
      )}

      <div
        className="absolute w-4 h-4 bg-blue-500 border border-white rounded-full cursor-grab pointer-events-auto"
        style={{
          top: -30,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        onPointerDown={startRotation}
      />
    </div>
  )
}
