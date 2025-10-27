
import { Fragment, MessageType } from '@/generated/prisma'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import React from 'react'
import { logos } from '../../../../../../public/assets/images/images'
import { ChevronRight, Code2Icon } from 'lucide-react'


interface Props {
     content: string
     type: MessageType
     fragment: Fragment | null
     createdAt: Date
     isActiveFragment: boolean
     onFragmentClick: (fragment: Fragment) => void

}
const AssistantCardBox = (props: Props) => {
  return (
   <div className={cn(
     "flex flex-col group px-2 pb-4",
     props.type === 'ERROR' &&  'text-red-700 dark:text-red-500'
   )}>
      <div className='flex items-center gap-5 '>
       <div className='flex items-center gap-1'>
         <Image className='w-6 object-contain shrink-0' src={logos.logo7} alt='logo' />
         <span className='text-md font-bold' style={{fontFamily: "monospace"}} >Fing</span>
       </div>
       <span className='group-hover:opacity-100 opacity-0 transition-opacity'> <p className="text-xs text-right" style={{ fontFamily: "monospace" }}>
        {props.createdAt.toLocaleString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          month: "long",
          day: 'numeric'
        })}
</p></span>
      </div>
     <div className='flex p-1 rounded-2xl  flex-col pl-8 gap-y-4'>
        <span className='text-md' style={{fontFamily: "poppins"}}>{props.content}</span>
        {props.fragment && props.type === 'RESULT' && (
             <FragmentCard
              fragment={props.fragment}
              isActiveFragment={props.isActiveFragment}
              onFragmentClick={props.onFragmentClick}
             />
        )}
     </div>
   </div>
  )
}

export default AssistantCardBox

interface FragmentProps {
     fragment: Fragment
     isActiveFragment: boolean
     onFragmentClick: (fragment: Fragment) => void
}
export const FragmentCard = (props: FragmentProps) => {
     return (
         <button 
         onClick={() => props.onFragmentClick(props.fragment)}
         className={cn(
             "flex items-start text-start gap-2 w-fit p-3 bg-muted rounded-lg border border-black/15 hover:bg-secondary transition-colors",
             props.isActiveFragment && '  border border-primary '
         )}>
         <Code2Icon />
          <div className='flex flex-col flex-1'>
            {props.fragment?.title || "Fragment"}
            <p className='text-xs' style={{ fontFamily: "monospace"}}>Preview</p>
          </div>
          <ChevronRight className='size-4 mt-1'  />
         </button>
     )
}

