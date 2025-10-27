'use client'
import { Button } from '@/components/ui/button'
import { useInfiniteCastle } from '@/hooks/use-infinite-castle'
import { setScale } from '@/redux/slices/viewport'
import { AppDispatch } from '@/redux/store'
import { ZoomIn, ZoomOut } from 'lucide-react'
import React from 'react'
import { useDispatch } from 'react-redux'

const Zoombar = () => {
  const {viewport} = useInfiniteCastle()
  const dispatch = useDispatch<AppDispatch>()
  const handleZoomOut = () => {
     const newScale = Math.max(viewport.scale / 1.2, viewport.minScale)
     dispatch(setScale({scale: newScale}))
  }
   const handleZoomIn = () => {
     const newScale = Math.min(viewport.scale * 1.2, viewport.maxScale)
     dispatch(setScale({scale: newScale}))
  }
  return (
    <div className='col-span-1 flex justify-start items-center'>
      <div className=' flex items-center gap-1 backdrop:blur-xl bg-white-[0.08] border border-white/[0.12] p-2 rounded-full saturate-150'>
        <Button
         onClick={handleZoomOut}
          variant={'ghost'}
          className='rounded-full cursor-pointer h-6 w-6 p-0 hover:bg-white/[0.12] border border-transparent hover:border-white/[0.16] transition-all'
        >
            <ZoomOut
             className='w-4 h-4'/>
        </Button>

        <div>
            <span className='font-mono text-xs opacity-50'>{Math.round(viewport.scale * 100)}%</span>
        </div>

         <Button
          onClick={handleZoomIn}
          variant={'ghost'}
          className='rounded-full cursor-pointer h-6 w-6 p-0 hover:bg-white/[0.12] border border-transparent hover:border-white/[0.16] transition-all'
        >
            <ZoomIn className='w-4 h-4'/>
        </Button>
      </div>
    </div>
  )
}

export default Zoombar