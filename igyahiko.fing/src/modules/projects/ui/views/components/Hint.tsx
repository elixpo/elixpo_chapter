'use client'

import React, { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'


interface HintProps {
  children: ReactNode
  message: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

const Hint = ({ children, message, side = 'top', align = 'center' }: HintProps) => {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side={side} align={align} className="text-xs max-w-xs">
          {message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default Hint
