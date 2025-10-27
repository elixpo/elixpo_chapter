"use client";
import React from "react";
import { useInfiniteCastle } from "@/hooks/use-infinite-castle";
import { cn } from "@/lib/utils";
import ShapesRenderer from "../shapes/shapes-renderer";
import TextSideBar from "../text-sidebar/text-sidebar";
import { RectanglePreview } from "../shapes/rectangle/preview";
import { ArrowPreview } from "../shapes/arrow/preview";
import { ElipsePreview } from "../shapes/elipse/preview";
import { LinePreview } from "../shapes/line/preview";
import { FreeDrawStrokePreview } from "../shapes/stroke/preview";
import { SelectionOverlay } from "../shapes/selectionOverlay";
import { useAppSelector } from "@/redux/store";
import { FramePreview } from "../shapes/frame/preview";

const InfiniteCastle = () => {
  const {
    attachCanvasRef,
    shapes,
    viewport,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    isSidebarOpen,
    hasSelectedText,
    currentTool,
    getDraftShape,
    getFreeDrawPoints,

    
  } = useInfiniteCastle();
  const draftShape = getDraftShape()
  const freeDraw = getFreeDrawPoints()
  const selectedShapes = useAppSelector((s) => s.shapes.selected)
  return (
   <>
    <TextSideBar isOpen={isSidebarOpen && hasSelectedText} />
     <div
      aria-label="Infinite drawing castle"
      role='application'
      style={{touchAction: 'none'}}
      draggable={false}
       onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      ref={attachCanvasRef}
      onContextMenu={(e) => e.preventDefault()}
      className={
        cn(
            'w-full h-[calc(100vh-10vh)] relative  overflow-hidden select-none z-0',
            {
                'cursor-grabbing': viewport.mode === 'panning',
                'cursor-grab': viewport.mode === 'shiftPanning',
                'cursor-crosshair': currentTool !== 'select' && viewport.mode === 'idle',
                'cursor-default': currentTool === 'select' && viewport.mode === 'idle'
            }
        )
      }
     >
     <div
      style={{
          transform: `translate3d(${viewport.translate.x}px, ${viewport.translate.y}px, 0) scale(${viewport.scale})`,
          transformOrigin: "0 0",
          willChange: 'transform'
        }}
      className="absolute origin-top-left pointer-events-none z-10"

     >
     {/*  rendering actual shapes */}
      {
        shapes.map((shape) => (
            
            <ShapesRenderer 
            
            shape={shape} key={shape.id} />
        ))
      }
      {/* rendering selection resize rotate overlay stuff */}
      {
        shapes.map((shape) => (
             <SelectionOverlay
              key={`selection-${shape.id}`}
              shape={shape}
              isSelected={!!selectedShapes[shape.id]}
             />
        ))
      }
       {/*   preview stuff */}
        {
            draftShape  && draftShape.type === 'frame' && (
                <FramePreview
                 currentWorld={draftShape.currentWorld}
                 startWorld={draftShape.startWorld}
                />
            )
        }
      {
        draftShape && draftShape.type === 'rect' && (
            <RectanglePreview 
             startWorld={draftShape.startWorld}
             currentWorld={draftShape.currentWorld}
            />
        )
      }

      {
        draftShape && draftShape.type === 'arrow' && (
             <ArrowPreview
              currentWorld={draftShape.currentWorld}
              startWorld={draftShape.startWorld}


             />
        )
      }

      {
        draftShape && draftShape.type === 'ellipse' && (
            <ElipsePreview  
              currentWorld={draftShape.currentWorld}
              startWorld={draftShape.startWorld}
            />
        )
      }
      {
        draftShape && draftShape.type === 'line' && (
            <LinePreview
                currentWorld={draftShape.currentWorld}
                startWorld={draftShape.startWorld}
            />
        )
      }
      {
        currentTool === 'freedraw' && freeDraw.length > 1 && (
            <FreeDrawStrokePreview
              points={freeDraw}
            />
        )
       }
      
     </div>
     </div>
    </>


  );
};

export default InfiniteCastle;



