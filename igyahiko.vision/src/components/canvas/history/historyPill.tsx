import { Redo2, Undo2 } from 'lucide-react'
import React from 'react'


const HistoryPill = () => {
  return (
    <div className='col-span-1 flex justify-start items-center'>
       <div className='flex dark:bg-white/[0.08] border rounded-full dark:border-white/20 items-center'>
        <span className='  flex justify-center items-center p-3 rounded-l-full'>
        <Undo2
         size={18}

         className='opacity-50  stroke-[1.75]'
        />
       </span>
       <span className='mx-1 h-5 w-px rounded bg-white/[0.16]' />
       <span className=' flex justify-center  items-center  p-3 rounded-r-full'>
        <Redo2
         size={18}

         className='opacity-50  stroke-[1.75]'
        />
       </span>
       </div>
    </div>
  )
}

export default HistoryPill