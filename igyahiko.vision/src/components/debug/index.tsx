// components/enhanced-debug.tsx
'use client'
import { useInfiniteCastle } from '@/hooks/use-infinite-castle'
import { useState, useEffect } from 'react'

export const EnhancedDebug = () => {
  const { 
    currentTool, 
    selectTool, 
    shapes, 
    viewport, 
    onPointerDown, 
    onPointerUp,
    onPointerMove,
    getDraftShape,
    getFreeDrawPoints
  } = useInfiniteCastle()
  
  const [lastEvent, setLastEvent] = useState<string>('None')
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 })
  const [eventLog, setEventLog] = useState<string[]>([])
  const [drawingState, setDrawingState] = useState({
    isDrawing: false,
    startTime: null as number | null,
    startPos: null as {x: number, y: number} | null
  })

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY })
    }
    document.addEventListener('mousemove', handleMove)
    return () => document.removeEventListener('mousemove', handleMove)
  }, [])

  const addToEventLog = (message: string) => {
    setEventLog(prev => [
      `${new Date().toLocaleTimeString()}: ${message}`,
      ...prev.slice(0, 15) // Keep last 15 events
    ])
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    const eventInfo = `PointerDown - Button: ${e.button}, Tool: ${currentTool}`
    setLastEvent(eventInfo)
    setDrawingState({
      isDrawing: true,
      startTime: Date.now(),
      startPos: { x: e.clientX, y: e.clientY }
    })
    
    addToEventLog(`🟡 DOWN: ${currentTool} at ${e.clientX},${e.clientY}`)
    
    console.log('🔴 Manual PointerDown:', {
      button: e.button,
      tool: currentTool,
      clientX: e.clientX,
      clientY: e.clientY
    })
    //@ts-ignore
    onPointerDown(e)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const duration = drawingState.startTime ? Date.now() - drawingState.startTime : 0
    addToEventLog(`🟢 UP: after ${duration}ms`)
    
    setDrawingState({
      isDrawing: false,
      startTime: null,
      startPos: null
    })
    
    console.log('🟢 PointerUp called after', duration, 'ms')
    //@ts-ignore
    onPointerUp(e)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drawingState.isDrawing && Math.random() < 0.3) { // 30% chance when drawing
      addToEventLog(`↗️ MOVE: ${e.clientX},${e.clientY}`)
    }
    //@ts-ignore
    onPointerMove(e)
  }

  // Get real-time draft info
  const draftShape = getDraftShape()
  const freeDrawPoints = getFreeDrawPoints()

  // Calculate drag distance if drawing
  const dragDistance = drawingState.startPos 
    ? Math.hypot(pointerPos.x - drawingState.startPos.x, pointerPos.y - drawingState.startPos.y)
    : 0

  return (
    <div className="fixed top-4 left-4 bg-black/90 text-white p-4 rounded z-50 text-xs font-mono space-y-2 max-w-2xl max-h-[90vh] overflow-y-auto">
      {/* Current State */}
      <div className="grid grid-cols-2 gap-2">
        <div><strong>Current Tool:</strong> {currentTool}</div>
        <div>
          <strong>Viewport Mode:</strong> 
          <span className={
            viewport.mode === 'moving' ? 'text-green-400' :
            viewport.mode === 'panning' ? 'text-yellow-400' :
            viewport.mode === 'drawing' ? 'text-blue-400' :
            viewport.mode === 'idle' ? 'text-gray-400' : 'text-red-400'
          }> {viewport.mode}</span>
        </div>
        <div><strong>Shapes Count:</strong> {shapes.length}</div>
        <div><strong>Scale:</strong> {viewport.scale.toFixed(2)}</div>
        <div><strong>Translate:</strong> {viewport.translate.x.toFixed(0)}, {viewport.translate.y.toFixed(0)}</div>
        <div><strong>Pointer:</strong> {pointerPos.x}, {pointerPos.y}</div>
      </div>

      {/* Drawing State */}
      <div className="border-t border-white/20 pt-2">
        <div><strong>Drawing State:</strong></div>
        <div className="grid grid-cols-2 gap-2">
          <div>Status: 
            <span className={drawingState.isDrawing ? 'text-green-400' : 'text-gray-400'}>
              {drawingState.isDrawing ? ' DRAWING' : ' IDLE'}
            </span>
          </div>
          <div>Drag Distance: {dragDistance.toFixed(0)}px</div>
          {drawingState.startTime && (
            <div>Duration: {(Date.now() - drawingState.startTime)}ms</div>
          )}
        </div>
      </div>

      {/* Draft Info */}
      <div className="border-t border-white/20 pt-2">
        <div><strong>Draft State:</strong></div>
        {draftShape ? (
          <div className="text-green-400">
            📐 <strong>{draftShape.type}</strong> | 
            Start: {draftShape.startWorld.x.toFixed(0)},{draftShape.startWorld.y.toFixed(0)} | 
            Current: {draftShape.currentWorld.x.toFixed(0)},{draftShape.currentWorld.y.toFixed(0)} |
            Size: {Math.abs(draftShape.currentWorld.x - draftShape.startWorld.x).toFixed(0)}x{Math.abs(draftShape.currentWorld.y - draftShape.startWorld.y).toFixed(0)}
          </div>
        ) : (
          <div className="text-gray-400">❌ No active draft</div>
        )}
        {freeDrawPoints.length > 0 && (
          <div className="text-blue-400">
            ✏️ FreeDraw: {freeDrawPoints.length} points
          </div>
        )}
      </div>

      {/* Last Event */}
      <div className="border-t border-white/20 pt-2">
        <div><strong>Last Event:</strong> {lastEvent}</div>
      </div>

      {/* Event Log */}
      <div className="border-t border-white/20 pt-2">
        <div><strong>Event Log:</strong></div>
        <div className="max-h-32 overflow-y-auto text-[10px] bg-black/50 p-2 rounded">
          {eventLog.length === 0 ? (
            <div className="text-gray-400">No events yet</div>
          ) : (
            eventLog.map((event, index) => (
              <div key={index} className="border-b border-white/10 py-1">
                {event}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Shapes */}
      <div className="border-t border-white/20 pt-2">
        <div><strong>Recent Shapes ({shapes.length} total):</strong></div>
        <div className="max-h-20 overflow-y-auto text-[10px] bg-black/50 p-2 rounded">
          {shapes.length === 0 ? (
            <div className="text-gray-400">No shapes created</div>
          ) : (
            shapes.slice(-5).map(shape => ( // Show only last 5 shapes
              <div key={shape.id} className="border-b border-white/10 py-1">
                {shape.type} - {shape.id.slice(0, 8)}...
                {shape.type === 'rect' && ` (${shape.x},${shape.y} ${shape.w}x${shape.h})`}
                {shape.type === 'ellipse' && ` (${shape.x},${shape.y} ${shape.w}x${shape.h})`}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Test Area */}
      <div className="border-t border-white/20 pt-2">
        <div 
          className="p-4 border-2 border-dashed border-green-400 rounded cursor-crosshair bg-green-400/10"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerMove={handlePointerMove}
          title="Click and drag here to test drawing"
        >
          <div className="text-center">
            <strong>🎯 TEST CANVAS AREA</strong>
            <div className="text-[10px] opacity-70">
              {drawingState.isDrawing ? 
                `Drawing ${currentTool} - drag to create` : 
                `Click and drag with ${currentTool} tool`
              }
            </div>
            {drawingState.isDrawing && (
              <div className="text-[10px] text-green-400 mt-1">
                Dragging: {dragDistance.toFixed(0)}px
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tool Buttons */}
      <div className="border-t border-white/20 pt-2">
        <div className="flex gap-1 flex-wrap">
          {['select', 'rect', 'ellipse', 'freedraw', 'line', 'arrow', 'eraser'].map(tool => (
            <button 
              key={tool}
              //@ts-ignore
              onClick={() => selectTool(tool)}
              className={`px-2 py-1 rounded text-xs ${
                currentTool === tool ? 'bg-white text-black' : 'bg-gray-700 text-white'
              }`}
            >
              {tool}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="border-t border-white/20 pt-2 text-[10px] text-gray-400">
        <div><strong>Debug Instructions:</strong></div>
        <div>1. Select drawing tool → 2. Click+drag in test area → 3. Watch Draft State</div>
        <div>✅ Shapes created: {shapes.length} | ❌ Draft active: {draftShape ? 'Yes' : 'No'}</div>
      </div>
    </div>
  )
}