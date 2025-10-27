'use client'

import { Tool } from '@/redux/slices/shapes'
import {
  ArrowRight,
  Circle,
  CircleEllipsisIcon,
  Eraser,
  Frame,
  Hash,
  LucideEraser,
  Minus,
  MousePointer,
  Pencil,
  RectangleHorizontal,
  Type,
} from 'lucide-react'
import React from 'react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { useInfiniteCastle } from '@/hooks/use-infinite-castle'

const ToolbarShapes = () => {
  const { currentTool, selectTool } = useInfiniteCastle()

  // Debug logging
  React.useEffect(() => {
    console.log('Current Tool:', currentTool)
    console.log('Select Tool function exists:', typeof selectTool === 'function')
  }, [currentTool, selectTool])

  const handleToolSelect = (toolId: Tool) => {
    console.log('Tool selected:', toolId)
    selectTool(toolId)
  }

  const options: Array<{
    id: Tool
    label: string
    icon: React.ReactNode
    description: string
  }> = [
    {
      id: 'frame',
      label: 'Frame',
      icon: <Frame className='w-4 h-4' />,
      description: 'Draw a frame container',
    },
    {
      id: 'select',
      label: 'Select',
      icon: <MousePointer className='w-4 h-4' />,
      description: 'Select and move shapes',
    },
    {
      id: 'rect',
      label: 'Rectangle',
      icon: <RectangleHorizontal className='w-4 h-4' />,
      description: 'Draw a rectangle',
    },
    {
      id: 'ellipse',
      label: 'Ellipse',
      icon: <CircleEllipsisIcon className='w-4 h-4' />,
      description: 'Draw an ellipse',
    },
    // Remove circle if not supported by your Redux slice
    // {
    //   id: 'circle',
    //   label: 'Circle',
    //   icon: <Circle className='w-4 h-4' />,
    //   description: 'Draw a circle',
    // },
    {
      id: 'freedraw',
      label: 'Free Draw',
      icon: <Pencil className='w-4 h-4' />,
      description: 'Draw freehand lines',
    },
    {
      id: 'line',
      label: 'Line',
      icon: <Minus className='w-4 h-4' />,
      description: 'Draw straight lines',
    },
    {
      id: 'text',
      label: 'Text',
      icon: <Type className='w-4 h-4' />,
      description: 'Add a text block',
    },
    {
      id: 'arrow',
      label: 'Arrow',
      icon: <ArrowRight className='w-4 h-4' />,
      description: 'Draw arrows with direction',
    },
    {
      id: 'eraser',
      label: 'Eraser',
      icon: <LucideEraser className='w-4 h-4' />,
      description: 'Remove shapes',
    },
  ]

  return (
    <div className='col-span-1 flex justify-center items-center'>
      <div className='flex backdrop-blur-2xl items-center bg-white/[0.08] border border-white/[0.12] gap-2 rounded-full p-2 saturate-150'>
       {options.map((tool) => (
  <Button
    key={tool.id}
    variant="ghost"
    onClick={() => handleToolSelect(tool.id)}
    data-state={currentTool === tool.id ? 'active' : 'inactive'}
    title={`${tool.label} - ${tool.description}`} 
    className={cn(
      'relative flex items-center gap-2 rounded-2xl px-5 py-4 text-sm font-medium transition-all duration-300 font-mono',
      'bg-[#0f0f0f] text-white hover:bg-[#1a1a1a] border border-transparent',
      'data-[state=active]:bg-[#0c0c0c] data-[state=active]:border-white/10',
      'data-[state=active]:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-2px_-2px_6px_rgba(255,255,255,0.07),0_1px_4px_rgba(0,0,0,0.6)]',
      'data-[state=active]:after:content-[""] data-[state=active]:after:absolute data-[state=active]:after:inset-0 data-[state=active]:after:rounded-2xl data-[state=active]:after:border data-[state=active]:after:border-white/5 data-[state=active]:after:shadow-[0_0_8px_rgba(255,255,255,0.04)]'
    )}
  >
    {tool.icon} 
    <span className="sr-only">{tool.label}</span>
  </Button>
))}

      </div>
    </div>
  )
}

export default ToolbarShapes